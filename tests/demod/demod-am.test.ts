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
import { ConfigAM, DemodAM, ModeAM } from "../../src/demod/demod-am.js";
import {
  getMode,
  modeParameters,
  registerDemod,
} from "../../src/demod/modes.js";
import { FFT } from "../../src/dsp/fft.js";
import { modulateAM, noise, sum, tone } from "../../src/sources/generators.js";
import { SampleGenerator } from "../../src/sources/realtime.js";

describe("DemodAM", () => {
  registerDemod("AM", DemodAM, ConfigAM);

  test("Mode configuration", () => {
    let mode = getMode("AM");
    assert.equal(mode.scheme, "AM");

    let params = modeParameters("AM");
    assert.equal(params.getBandwidth(), 15000);
    assert.equal(params.getSquelch(), 0);
    assert.equal(params.getStereo(), false);
    params.setBandwidth(5000);
    params.setSquelch(6);
    params.setStereo(true);
    assert.equal(params.getBandwidth(), 5000);
    assert.equal(params.getSquelch(), 6);
    assert.equal(params.getStereo(), false);
  });

  describe("Demodulate tones", () => {
    let carrierFreq = 7500;
    let inSampleRate = 192000;
    let outSampleRate = 48000;
    let inLen = 2.5 * inSampleRate;

    let demod = new DemodAM(
      inSampleRate,
      outSampleRate,
      getMode("AM") as ModeAM
    );

    const demodulate = (signal: SampleGenerator, noiseAmpl?: number) => {
      let modulated = modulateAM(carrierFreq, 0.1, signal);
      if (noiseAmpl !== undefined) modulated = sum(modulated, noise(noiseAmpl, prng()));
      let I = new Float32Array(inLen);
      let Q = new Float32Array(inLen);
      modulated(0, inSampleRate, 0, I, Q);
      return demod.demodulate(I, Q, carrierFreq);
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

    test("Single tone", () => {
      let signal = tone(1500, 1);
      let output = demodulate(signal);
      let transformed = fftTransform(output.left);
      assert.approximately(binModulus(transformed, 1500), 0.5, 0.01);
      assert.isAbove(output.snr, 3);
    });

    test("Two tones", () => {
      let signal = sum(tone(1500, 0.3), tone(2250, 0.6));
      let output = demodulate(signal);
      let transformed = fftTransform(output.left);
      assert.approximately(binModulus(transformed, 1500), 0.15, 0.01);
      assert.approximately(binModulus(transformed, 2250), 0.3, 0.01);
      assert.isAbove(output.snr, 3);
    });

    test("Single tone with noise", () => {
      let signal = tone(1500, 1);
      let output = demodulate(signal, 0.2);
      let transformed = fftTransform(output.left);
      assert.approximately(binModulus(transformed, 1500), 0.275, 0.05);
      assert.isBelow(output.snr, 2);
    });
  });
});
