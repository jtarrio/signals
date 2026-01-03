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
import { Spectrum } from "../../src/demod/spectrum";
import { sum, tone } from "../../src/sources/generators";

test("Spectrum", () => {
  let sampleRate = 40960;
  let len = 4096;
  let gen = sum(
    tone(1230, 0.1),
    tone(-2340, 0.2),
    tone(3450, 0.3),
    tone(-4560, 0.4)
  );

  let I = new Float32Array(len);
  let Q = new Float32Array(len);
  gen(0, sampleRate, 0, I, Q);
  let spectrum = new Spectrum(len);
  spectrum.receiveSamples({ I, Q, frequency: 0 });
  let s = new Float32Array(len);
  spectrum.getSpectrum(s);

  assert.approximately(s[123], -27.5, 0.1);
  assert.approximately(s[len - 234], -21.5, 0.1);
  assert.approximately(s[345], -18, 0.1);
  assert.approximately(s[len - 456], -15.5, 0.1);
});
