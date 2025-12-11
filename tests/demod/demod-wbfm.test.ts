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
import { ConfigWBFM, DemodWBFM, ModeWBFM } from "../../src/demod/demod-wbfm.js";
import {
  getMode,
  modeParameters,
  registerDemod,
} from "../../src/demod/modes.js";
import { FFT } from "../../src/dsp/fft.js";
import {
  modulateFM,
  noise,
  sum,
  tone,
  wbfmSignal,
} from "../../src/sources/generators.js";
import { SampleGenerator } from "../../src/sources/realtime.js";

describe("DemodWBFM", () => {
  registerDemod("WBFM", DemodWBFM, ConfigWBFM);

  test("Mode configuration", () => {
    let mode = getMode("WBFM");
    assert.equal(mode.scheme, "WBFM");

    let params = modeParameters("WBFM");
    assert.equal(params.getBandwidth(), 150000);
    assert.equal(params.getSquelch(), 0);
    assert.equal(params.getStereo(), true);
    params.setBandwidth(5000);
    params.setSquelch(6);
    params.setStereo(false);
    assert.equal(params.getBandwidth(), 150000);
    assert.equal(params.getSquelch(), 0);
    assert.equal(params.getStereo(), false);
  });

  describe("Demodulate mono", () => {
    let carrierFreq = 50000;
    let inSampleRate = 336000;
    let outSampleRate = 48000;
    let inLen = inSampleRate;

    let demod = new DemodWBFM(
      inSampleRate,
      outSampleRate,
      getMode("WBFM") as ModeWBFM,
      { deemphasizerTc: 50 }
    );

    const demodulate = (signal: SampleGenerator, noiseAmpl?: number) => {
      let modulated = modulateFM(
        carrierFreq,
        75000,
        0.1,
        wbfmSignal(signal, 50)
      );
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
      assert.isFalse(output.stereo);
      let transformed = fftTransform(output.left);
      assert.approximately(binModulus(transformed, 1500), 0.5, 0.05);
      assert.isAbove(output.snr, 1.5);
    });

    test("Two tones", () => {
      let signal = sum(tone(1500, 0.3), tone(2250, 0.6));
      let output = demodulate(signal);
      assert.isFalse(output.stereo);
      let transformed = fftTransform(output.left);
      assert.approximately(binModulus(transformed, 1500), 0.15, 0.015);
      assert.approximately(binModulus(transformed, 2250), 0.3, 0.03);
      assert.isAbove(output.snr, 2);
    });

    test("Single tone with noise", () => {
      let signal = tone(1500, 1);
      let output = demodulate(signal, 0.2);
      let transformed = fftTransform(output.left);
      assert.isAtLeast(binModulus(transformed, 1500), 0.15);
      assert.isBelow(output.snr, 2);
    });
  });

  describe("Demodulate stereo", () => {
    let carrierFreq = 50000;
    let inSampleRate = 336000;
    let outSampleRate = 48000;
    let inLen = inSampleRate;

    let demod = new DemodWBFM(
      inSampleRate,
      outSampleRate,
      getMode("WBFM") as ModeWBFM,
      { deemphasizerTc: 50 }
    );

    const demodulate = (
      left: SampleGenerator,
      right: SampleGenerator,
      noiseAmpl?: number
    ) => {
      let modulated = modulateFM(
        carrierFreq,
        75000,
        0.1,
        wbfmSignal(left, right, 50)
      );
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
      let left = tone(1500, 1);
      let right = tone(2250, 1);
      let output = demodulate(left, right);
      assert.isTrue(output.stereo);
      let fftLeft = fftTransform(output.left);
      assert.approximately(binModulus(fftLeft, 1500), 0.5, 0.05);
      assert.approximately(binModulus(fftLeft, 2250), 0, 0.05);
      let fftRight = fftTransform(output.right);
      assert.approximately(binModulus(fftRight, 1500), 0, 0.05);
      assert.approximately(binModulus(fftRight, 2250), 0.5, 0.05);
      assert.isAbove(output.snr, 1.5);
    });

    test("Two tones", () => {
      let left = sum(tone(1500, 0.3), tone(2250, 0.6));
      let right = sum(tone(750, 0.4), tone(3000, 0.5));
      let output = demodulate(left, right);
      assert.isTrue(output.stereo);
      let fftLeft = fftTransform(output.left);
      assert.approximately(binModulus(fftLeft, 1500), 0.15, 0.015);
      assert.approximately(binModulus(fftLeft, 2250), 0.3, 0.03);
      let fftRight = fftTransform(output.right);
      assert.approximately(binModulus(fftRight, 750), 0.2, 0.015);
      assert.approximately(binModulus(fftRight, 3000), 0.25, 0.03);
      assert.isAbove(output.snr, 2);
    });
  });
});
