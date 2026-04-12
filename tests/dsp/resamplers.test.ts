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
import {
  add,
  iqAdd,
  iqPiecewise,
  iqRmsd,
  iqSineTone,
  iqSubarray,
  piecewise,
  rmsd,
  sineTone,
} from "../testutil.js";
import { getIqResampler, getRealResampler } from "../../src/dsp/resamplers.js";

test("RealDownsampler", () => {
  let input = add(
    sineTone(8000, 8000, 10, 0.1),
    sineTone(8000, 8000, 20, 0.2),
    sineTone(8000, 8000, 35, 0.3),
  );

  let expected = add(
    sineTone(800, 800, 10, 0.1),
    sineTone(800, 800, 20, 0.2),
    sineTone(800, 800, 35, 0.3),
  );

  let downsampler = getRealResampler(8000, 800, { taps: 120 });
  let output = piecewise(input, 64, (x) => downsampler.resample(x));

  assert.approximately(downsampler.getDelay(), 60, 1e-4);
  assert.isAtMost(
    rmsd(output.subarray(400, 800), expected.subarray(400 - 60, 800 - 60)),
    0.001,
  );
});

test("IqDownsampler", () => {
  let input = iqAdd(
    iqSineTone(8000, 8000, 10, 0.1),
    iqSineTone(8000, 8000, 20, 0.2),
    iqSineTone(8000, 8000, 35, 0.3),
  );

  let expected = iqAdd(
    iqSineTone(800, 800, 10, 0.1),
    iqSineTone(800, 800, 20, 0.2),
    iqSineTone(800, 800, 35, 0.3),
  );

  let downsampler = getIqResampler(8000, 800, { taps: 120 });
  let output = iqPiecewise(input[0], input[1], 64, (x, y) =>
    downsampler.resample(x, y),
  );

  assert.approximately(downsampler.getDelay(), 60, 1e-4);
  assert.isAtMost(
    iqRmsd(
      iqSubarray(output, 400, 800),
      iqSubarray(expected, 400 - 60, 800 - 60),
    ),
    0.001,
  );
});

test("RealUpsampler", () => {
  let input = add(
    sineTone(80, 800, 10, 0.1),
    sineTone(80, 800, 20, 0.2),
    sineTone(80, 800, 35, 0.3),
  );

  let expected = add(
    sineTone(800, 8000, 10, 0.1),
    sineTone(800, 8000, 20, 0.2),
    sineTone(800, 8000, 35, 0.3),
  );

  let upsampler = getRealResampler(800, 8000, { taps: 121 });
  let output = piecewise(input, 64, (x) => upsampler.resample(x));

  assert.approximately(upsampler.getDelay(), 60, 1e-4);
  assert.isAtMost(
    rmsd(output.subarray(400, 800), expected.subarray(400 - 60, 800 - 60)),
    0.001,
  );
});

test("IqUpsampler", () => {
  let input = iqAdd(
    iqSineTone(80, 800, 10, 0.1),
    iqSineTone(80, 800, 20, 0.2),
    iqSineTone(80, 800, 35, 0.3),
  );

  let expected = iqAdd(
    iqSineTone(800, 8000, 10, 0.1),
    iqSineTone(800, 8000, 20, 0.2),
    iqSineTone(800, 8000, 35, 0.3),
  );

  let upsampler = getIqResampler(800, 8000, { taps: 121 });
  let output = iqPiecewise(input[0], input[1], 64, (x, y) =>
    upsampler.resample(x, y),
  );

  assert.approximately(upsampler.getDelay(), 60, 1e-4);
  assert.isAtMost(
    iqRmsd(
      iqSubarray(output, 400, 800),
      iqSubarray(expected, 400 - 60, 800 - 60),
    ),
    0.001,
  );
});

test("RealResampler", () => {
  let input = add(
    sineTone(800, 8000, 10, 0.1),
    sineTone(800, 8000, 20, 0.2),
    sineTone(800, 8000, 35, 0.3),
  );

  let expected = add(
    sineTone(1200, 12000, 10, 0.1),
    sineTone(1200, 12000, 20, 0.2),
    sineTone(1200, 12000, 35, 0.3),
  );

  let upsampler = getRealResampler(8000, 12000, { taps: 120 });
  let output = piecewise(input, 64, (x) => upsampler.resample(x));

  assert.approximately(upsampler.getDelay(), 60, 1e-4);
  assert.isAtMost(
    rmsd(output.subarray(600, 1200), expected.subarray(600 - 60, 1200 - 60)),
    0.001,
  );
});

test("ComplexResampler", () => {
  let input = iqAdd(
    iqSineTone(800, 8000, 10, 0.1),
    iqSineTone(800, 8000, 20, 0.2),
    iqSineTone(800, 8000, 35, 0.3),
  );

  let expected = iqAdd(
    iqSineTone(1200, 12000, 10, 0.1),
    iqSineTone(1200, 12000, 20, 0.2),
    iqSineTone(1200, 12000, 35, 0.3),
  );

  let upsampler = getIqResampler(8000, 12000, { taps: 120 });
  let output = iqPiecewise(input[0], input[1], 64, (x, y) =>
    upsampler.resample(x, y),
  );

  assert.approximately(upsampler.getDelay(), 60, 1e-4);
  assert.isAtMost(
    iqRmsd(
      iqSubarray(output, 600, 1200),
      iqSubarray(expected, 600 - 60, 1200 - 60),
    ),
    0.001,
  );
});
