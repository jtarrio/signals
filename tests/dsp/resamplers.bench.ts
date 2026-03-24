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
  getIqResampler,
  getRealResampler,
  RealDownsampler,
} from "../../src/dsp/resamplers.js";

describe("Downsamplers", () => {
  const inSampleRate = 1008000;
  const len = inSampleRate;
  const I = new Float32Array(len).map((_) => Math.random());
  const Q = new Float32Array(len).map((_) => Math.random());

  const runReal = (len: number, outRate: number) => {
    let downsampler = getRealResampler(inSampleRate, outRate, { taps: 151 });
    let samples = I.subarray(0, len);
    return () => {
      downsampler.resample(samples);
    };
  };

  const runComplex = (len: number, outRate: number) => {
    let downsampler = getIqResampler(inSampleRate, outRate, { taps: 151 });
    let samplesI = I.subarray(0, len);
    let samplesQ = Q.subarray(0, len);
    return () => {
      downsampler.resample(samplesI, samplesQ);
    };
  };

  describe("Real", () => {
    for (let outRate of [28000, 112000, 336000]) {
      describe(`1/${inSampleRate / outRate}`, () => {
        for (let l of [64, 256, 1024, 4096]) {
          bench(`${l}`, runReal(l, outRate));
        }
      });
    }
  });

  describe("I/Q", () => {
    for (let outRate of [28000, 112000, 336000]) {
      describe(`1/${inSampleRate / outRate}`, () => {
        for (let l of [64, 256, 1024, 4096]) {
          bench(`${l}`, runComplex(l, outRate));
        }
      });
    }
  });
});

describe("Upsamplers", () => {
  const inSampleRate = 28000;
  const len = inSampleRate;
  const I = new Float32Array(len).map((_) => Math.random());
  const Q = new Float32Array(len).map((_) => Math.random());

  const runReal = (len: number, outRate: number) => {
    let downsampler = getRealResampler(inSampleRate, outRate, { taps: 151 });
    let samples = I.subarray(0, len);
    return () => {
      downsampler.resample(samples);
    };
  };

  const runComplex = (len: number, outRate: number) => {
    let downsampler = getIqResampler(inSampleRate, outRate, { taps: 151 });
    let samplesI = I.subarray(0, len);
    let samplesQ = Q.subarray(0, len);
    return () => {
      downsampler.resample(samplesI, samplesQ);
    };
  };

  describe("Real", () => {
    for (let outRate of [112000, 336000, 1008000]) {
      describe(`x${outRate / inSampleRate}`, () => {
        for (let l of [64, 256, 1024, 4096]) {
          bench(`${l}`, runReal(l, outRate));
        }
      });
    }
  });

  describe("I/Q", () => {
    for (let outRate of [112000, 336000, 1008000]) {
      describe(`x${outRate / inSampleRate}`, () => {
        for (let l of [64, 256, 1024, 4096]) {
          bench(`${l}`, runComplex(l, outRate));
        }
      });
    }
  });
});


describe("Resamplers", () => {
  const inSampleRate = 384000;
  const len = inSampleRate;
  const I = new Float32Array(len).map((_) => Math.random());
  const Q = new Float32Array(len).map((_) => Math.random());

  const runReal = (len: number, outRate: number) => {
    let downsampler = getRealResampler(inSampleRate, outRate, { taps: 151 });
    let samples = I.subarray(0, len);
    return () => {
      downsampler.resample(samples);
    };
  };

  const runComplex = (len: number, outRate: number) => {
    let downsampler = getIqResampler(inSampleRate, outRate, { taps: 151 });
    let samplesI = I.subarray(0, len);
    let samplesQ = Q.subarray(0, len);
    return () => {
      downsampler.resample(samplesI, samplesQ);
    };
  };

  describe("Real", () => {
    for (let outRate of [11025, 44100, 256000, 1024000]) {
      describe(`${inSampleRate} -> ${outRate}`, () => {
        for (let l of [64, 256, 1024, 4096]) {
          bench(`${l}`, runReal(l, outRate));
        }
      });
    }
  });

  describe("I/Q", () => {
    for (let outRate of [11025, 44100, 256000, 1024000]) {
      describe(`${inSampleRate} -> ${outRate}`, () => {
        for (let l of [64, 256, 1024, 4096]) {
          bench(`${l}`, runComplex(l, outRate));
        }
      });
    }
  });
});
