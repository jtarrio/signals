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
import { ConfigSSB, DemodSSB, ModeSSB } from "../../src/demod/demod-ssb.js";
import {
  getMode,
  modeParameters,
  registerDemod,
} from "../../src/demod/modes.js";
import { FFT } from "../../src/dsp/fft.js";
import { noise, sum, tone } from "../../src/sources/generators.js";

describe("DemodSSB", () => {
  registerDemod("USB", DemodSSB, ConfigSSB);
  registerDemod("LSB", DemodSSB, ConfigSSB);

  test("Mode configuration for USB", () => {
    let mode = getMode("USB");
    assert.equal(mode.scheme, "USB");

    let params = modeParameters("USB");
    assert.equal(params.getBandwidth(), 2800);
    assert.equal(params.getSquelch(), 0);
    assert.equal(params.getStereo(), false);
    params.setBandwidth(5000);
    params.setSquelch(6);
    params.setStereo(true);
    assert.equal(params.getBandwidth(), 5000);
    assert.equal(params.getSquelch(), 6);
    assert.equal(params.getStereo(), false);
  });

  test("Mode configuration for USB", () => {
    let mode = getMode("LSB");
    assert.equal(mode.scheme, "LSB");

    let params = modeParameters("LSB");
    assert.equal(params.getBandwidth(), 2800);
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

    let usbDemod = new DemodSSB(
      inSampleRate,
      outSampleRate,
      getMode("USB") as ModeSSB
    );
    let lsbDemod = new DemodSSB(
      inSampleRate,
      outSampleRate,
      getMode("LSB") as ModeSSB
    );

    const demodulate = (
      demod: DemodSSB,
      freq: number,
      ampl: number,
      noiseAmpl?: number
    ) => {
      let modulated = tone(carrierFreq + freq, ampl);
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

    test("Single tone USB same side", () => {
      let output = demodulate(usbDemod, 1500, 1);
      let transformed = fftTransform(output.left);
      assert.isAtMost(binModulus(transformed, 1125), 1e-2);
      assert.approximately(binModulus(transformed, 1500), 0.5, 0.05);
      assert.isAtMost(binModulus(transformed, 1875), 1e-2);
      assert.approximately(output.snr, 1, 0.01);
    });

    test("Single tone USB opposite side", () => {
      let output = demodulate(usbDemod, -1500, 1);
      let transformed = fftTransform(output.left);
      assert.isAtMost(binModulus(transformed, 1125), 1e-2);
      assert.isAtMost(binModulus(transformed, 1500), 1e-2);
      assert.isAtMost(binModulus(transformed, 1875), 1e-2);
      assert.isAtMost(output.snr, 1e-2);
    });

    test("Single tone LSB same side", () => {
      let output = demodulate(lsbDemod, -1500, 1);
      let transformed = fftTransform(output.left);
      assert.isAtMost(binModulus(transformed, 1125), 1e-2);
      assert.approximately(binModulus(transformed, 1500), 0.5, 0.05);
      assert.isAtMost(binModulus(transformed, 1875), 1e-2);
      assert.approximately(output.snr, 1, 0.01);
    });

    test("Single tone LSB opposite side", () => {
      let output = demodulate(lsbDemod, +1500, 1);
      let transformed = fftTransform(output.left);
      assert.isAtMost(binModulus(transformed, 1125), 1e-2);
      assert.isAtMost(binModulus(transformed, 1500), 1e-2);
      assert.isAtMost(binModulus(transformed, 1875), 1e-2);
      assert.isAtMost(output.snr, 1e-2);
    });

    test("Single tone upper side with noise", () => {
      let output = demodulate(usbDemod, 1500, 1, 0.2);
      let transformed = fftTransform(output.left);
      assert.approximately(binModulus(transformed, 1500), 0.4, 0.04);
      assert.approximately(output.snr, 1, 0.01);
    });

    test("Single tone lower side with noise", () => {
      let output = demodulate(lsbDemod, -1500, 1, 0.2);
      let transformed = fftTransform(output.left);
      assert.approximately(binModulus(transformed, 1500), 0.4, 0.04);
      assert.approximately(output.snr, 1, 0.01);
    });
  });
});
