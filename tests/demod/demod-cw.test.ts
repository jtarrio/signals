// Copyright 2025 Jacobo Tarrio Barreiro. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { test, assert, describe } from "vitest";
import { IQ, modulus, prng } from "../testutil.js";
import { ConfigCW, DemodCW, ModeCW } from "../../src/demod/demod-cw.js";
import {
  getMode,
  modeParameters,
  registerDemod,
} from "../../src/demod/modes.js";
import { FFT } from "../../src/dsp/fft.js";
import { noise, sum, tone } from "../../src/sources/generators.js";

describe("DemodCW", () => {
  registerDemod("CW", DemodCW, ConfigCW);

  test("Mode configuration", () => {
    let mode = getMode("CW");
    assert.equal(mode.scheme, "CW");

    let params = modeParameters("CW");
    assert.equal(params.getBandwidth(), 50);
    assert.equal(params.getSquelch(), 0);
    assert.equal(params.getStereo(), false);
    params.setBandwidth(5000);
    params.setSquelch(6);
    params.setStereo(true);
    assert.equal(params.getBandwidth(), 1000);
    assert.equal(params.getSquelch(), 0);
    assert.equal(params.getStereo(), false);
  });

  describe("Demodulate tones", () => {
    let signalFreq = 7500;
    let inSampleRate = 192000;
    let outSampleRate = 51200; // Puts 600 Hz in one bin for a 4096-bin FFT
    let inLen = 2 * inSampleRate;

    let demod = new DemodCW(
      inSampleRate,
      outSampleRate,
      getMode("CW") as ModeCW
    );

    const demodulate = (freq: number, noiseAmpl?: number) => {
      let modulated = tone(freq, 0.1);
      if (noiseAmpl !== undefined) modulated = sum(modulated, noise(noiseAmpl, prng()));
      let I = new Float32Array(inLen);
      let Q = new Float32Array(inLen);
      modulated(0, inSampleRate, 0, I, Q);
      return demod.demodulate(I, Q, signalFreq);
    };

    const fftTransform = (signal: Float32Array) => {
      return FFT.ofLength(4096).transform(
        signal.subarray(signal.length - 4096),
        new Float32Array(4096)
      );
    };

    const binModulus = (transformed: IQ, freq: number) => {
      return modulus(
        transformed,
        Math.floor(freq * transformed[0].length) / outSampleRate
      );
    };

    test("Zeroed in", () => {
      let output = demodulate(signalFreq);
      let transformed = fftTransform(output.left);
      assert.isAtMost(binModulus(transformed, 575), 0.03);
      assert.isAtLeast(binModulus(transformed, 600), 0.45);
      assert.isAtMost(binModulus(transformed, 625), 0.03);
      assert.isAtLeast(output.snr, 1000);
    });

    test("Slightly above", () => {
      let output = demodulate(signalFreq + 50);
      let transformed = fftTransform(output.left);
      assert.isAtMost(binModulus(transformed, 625), 0.03);
      assert.isAtLeast(binModulus(transformed, 650), 0.45);
      assert.isAtMost(binModulus(transformed, 675), 0.03);
      assert.isAtLeast(output.snr, 800);
    });

    test("Too high", () => {
      let output = demodulate(signalFreq + 250);
      let transformed = fftTransform(output.left);
      assert.isAtMost(binModulus(transformed, 825), 0.01);
      assert.isAtMost(binModulus(transformed, 850), 0.03);
      assert.isAtMost(binModulus(transformed, 875), 0.01);
      assert.isAtMost(output.snr, 5);
    });

    test("Zeroed in with noise", () => {
      let output = demodulate(signalFreq, 0.9);
      let transformed = fftTransform(output.left);
      assert.isAtMost(binModulus(transformed, 575), 0.04);
      assert.isAtLeast(binModulus(transformed, 600), 0.3);
      assert.isAtMost(binModulus(transformed, 625), 0.04);
      assert.isAtLeast(output.snr, 20);
    });
  });
});
