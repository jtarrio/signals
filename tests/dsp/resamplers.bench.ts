// Copyright 2026 Jacobo Tarrio Barreiro. All rights reserved.
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

import { bench, describe } from "vitest";
import {
  ComplexDownsampler,
  RealDownsampler,
} from "../../src/dsp/resamplers.js";

describe("Downsamplers", () => {
  const inSampleRate = 1024000;
  const outSampleRate = 336000;
  const len = inSampleRate;
  const I = new Float32Array(len).map((_) => Math.random());
  const Q = new Float32Array(len).map((_) => Math.random());

  const runReal = (len: number, fft: boolean) => {
    let downsampler = new RealDownsampler(inSampleRate, outSampleRate, 151, {
      useFftFilter: fft,
    });
    let samples = I.subarray(0, len);
    return () => {
      downsampler.downsample(samples);
    };
  };

  const runComplex = (len: number, fft: boolean) => {
    let downsampler = new ComplexDownsampler(inSampleRate, outSampleRate, 151, {
      useFftFilter: fft,
    });
    let samplesI = I.subarray(0, len);
    let samplesQ = Q.subarray(0, len);
    return () => {
      downsampler.downsample(samplesI, samplesQ);
    };
  };

  for (let l of [256, 1024, 4096]) {
    describe(`Real ${l}`, () => {
      bench("FIR", runReal(l, false));
      bench("FFT", runReal(l, true));
    });
    describe(`Complex ${l}`, () => {
      bench("FIR", runComplex(l, false));
      bench("FFT", runComplex(l, true));
    });
  }
});
