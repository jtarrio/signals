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
import { getRealResampler } from "../../src/dsp/resamplers.js";

describe("Downsampler", () => {
  const blockNum = 20;
  const run = (inRate: number, outRate: number) => {
    const blocks = Array.from({ length: blockNum }).map((_) =>
      new Float32Array(Math.floor(inRate / blockNum)).map((_) => Math.random()),
    );
    let downsampler = getRealResampler(inRate, outRate, {
      taps: 49,
    });
    return () => {
      for (let block of blocks) {
        downsampler.resample(block);
      }
    };
  };

  let inRate = 2048000;
  for (let outRate of [32000, 128000, 512000, 1024000]) {
    bench(`${inRate} -> ${outRate}`, run(inRate, outRate));
  }
});

describe("Upsampler", () => {
  const blockNum = 20;
  const run = (inRate: number, outRate: number) => {
    const blocks = Array.from({ length: blockNum }).map((_) =>
      new Float32Array(Math.floor(inRate / blockNum)).map((_) => Math.random()),
    );
    let downsampler = getRealResampler(inRate, outRate, {
      taps: 49,
    });
    return () => {
      for (let block of blocks) {
        downsampler.resample(block);
      }
    };
  };

  let inRate = 32000;
  for (let outRate of [128000, 512000, 1024000, 2048000]) {
    bench(`${inRate} -> ${outRate}`, run(inRate, outRate));
  }
});

describe("Resampler", () => {
  const blockNum = 20;
  const run = (inRate: number, outRate: number) => {
    const blocks = Array.from({ length: blockNum }).map((_) =>
      new Float32Array(Math.floor(inRate / blockNum)).map((_) => Math.random()),
    );
    let downsampler = getRealResampler(inRate, outRate, {
      taps: 49,
    });
    return () => {
      for (let block of blocks) {
        downsampler.resample(block);
      }
    };
  };

  describe("Net down", () => {
    let inRate = 2048000;
    for (let outRate of [48000, 176000, 336000, 656000]) {
      bench(`${inRate} -> ${outRate}`, run(inRate, outRate));
    }
  });

  describe("Net up", () => {
    let inRate = 48000;
    for (let outRate of [176000, 352000, 656000, 2048000]) {
      bench(`${inRate} -> ${outRate}`, run(inRate, outRate));
    }
  });
});
