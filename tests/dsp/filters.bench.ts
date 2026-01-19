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
import { makeLowPassKernel } from "../../src/dsp/coefficients.js";
import { Filter, FIRFilter, FFTFilter } from "../../src/dsp/filters.js";

describe("Filters", () => {
  const sampleRate = 192000;
  const len = sampleRate;
  const freq = 150000;

  const run = (filter: Filter) => () => {
    let input = new Float32Array(len).map((_, i) =>
      Math.cos((2 * Math.PI * freq * i) / sampleRate),
    );
    filter.inPlace(input);
  };

  for (let l of [41, 151, 351]) {
    describe(String(l), () => {
      const coefs = makeLowPassKernel(sampleRate, freq, l);
      bench("FIRFilter", run(new FIRFilter(coefs)));
      bench("FFTFilter", run(new FFTFilter(coefs)));
    });
  }
});
