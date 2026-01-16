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

import { test, assert } from "vitest";
import { power, rmsd, sineTone } from "../testutil.js";
import {
  makeHilbertKernel,
  makeLowPassKernel,
} from "../../src/dsp/coefficients.js";
import { DelayFilter, FIRFilter } from "../../src/dsp/filters.js";

test("LowPassKernel", () => {
  let coefs = makeLowPassKernel(8000, 500, 151);
  let filter = new FIRFilter(coefs);

  const freqPower = (freq: number) => {
    let signal = sineTone(800, 8000, freq, 1);
    filter.inPlace(signal);
    return power(signal.subarray(400));
  };

  // Low pass, with -6dB at the corner.
  assert.isAtLeast(freqPower(10), 0.499);
  assert.isAtLeast(freqPower(200), 0.499);
  assert.isAtLeast(freqPower(300), 0.499);
  assert.isAtLeast(freqPower(400), 0.499);
  assert.approximately(freqPower(500), 0.125, 0.0005);
  assert.isAtMost(freqPower(600), 1e-6);
});

test("HilbertKernel", () => {
  let coefs = makeHilbertKernel(151);
  let filter = new FIRFilter(coefs);
  let delayFilter = new DelayFilter(filter.getDelay());

  const freq = (freq: number, phase: number) => {
    let signal = sineTone(800, 8000, freq, 1, phase);
    delayFilter.inPlace(signal);
    return signal.subarray(400);
  };
  const filteredFreq = (freq: number) => {
    let signal = sineTone(800, 8000, freq, 1);
    filter.inPlace(signal);
    return signal.subarray(400);
  };

  // Positive frequencies have a -pi/2 phase shift.
  assert.isAtMost(rmsd(filteredFreq(500), freq(500, -Math.PI / 2)), 1e-3);
  // Negative frequencies have a +pi/2 phase shift.
  assert.isAtMost(rmsd(filteredFreq(-500), freq(-500, Math.PI / 2)), 1e-3);
});
