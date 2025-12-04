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
import { atan2 } from "../../src/dsp/math.js";

test("atan2", () => {
  for (let i = 0; i < 10000; ++i) {
    let angle = (2 * Math.PI * i) / 10000;
    let I = Math.cos(angle);
    let Q = Math.sin(angle);
    let expected = Math.atan2(Q, I);
    // We are comparing to Math.atan2 and not to the original angle
    // because sin/cos will bring their own errors into play,
    // and our benchmark is atan2 anyway.
    assert.approximately(atan2(Q, I), expected, 4e-8, `For angle ${angle}`);
  }
});
