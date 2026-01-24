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
import {
  add,
  iqAdd,
  iqRmsd,
  iqSineTone,
  iqSubarray,
  rmsd,
  sineTone,
} from "../testutil.js";
import {
  ComplexDownsampler,
  RealDownsampler,
} from "../../src/dsp/resamplers.js";

describe("RealDownsampler", () => {
  let input = add(
    sineTone(800, 8000, 10, 0.1),
    sineTone(800, 8000, 20, 0.2),
    sineTone(800, 8000, 35, 0.3),
  );

  let expected = add(
    sineTone(80, 800, 10, 0.1),
    sineTone(80, 800, 20, 0.2),
    sineTone(80, 800, 35, 0.3),
  );

  test("FIR", () => {
    let downsampler = new RealDownsampler(8000, 800, 21);
    let output = downsampler.downsample(input);

    assert.approximately(downsampler.getDelay(), 1, 1e-4);
    assert.isAtMost(
      rmsd(output.subarray(40, 80), expected.subarray(39, 79)),
      0.001,
    );
  });

  test("FFT", () => {
    let downsampler = new RealDownsampler(8000, 800, 29, {
      useFftFilter: true,
    });
    let output = downsampler.downsample(input);

    assert.approximately(downsampler.getDelay(), 5, 1e-4);
    assert.isAtMost(
      rmsd(output.subarray(40, 80), expected.subarray(35, 75)),
      0.001,
    );
  });
});

describe("ComplexDownsampler", () => {
  const origSampleRate = 80000;
  const sampleRate = origSampleRate / 10;
  const origLen = origSampleRate / 10;
  const len = sampleRate / 10;
  let input = iqAdd(
    iqSineTone(origLen, origSampleRate, 10, 0.1),
    iqSineTone(origLen, origSampleRate, 20, 0.2),
    iqSineTone(origLen, origSampleRate, 35, 0.3),
  );
  let expected = iqAdd(
    iqSineTone(len, sampleRate, 10, 0.1),
    iqSineTone(len, sampleRate, 20, 0.2),
    iqSineTone(len, sampleRate, 35, 0.3),
  );

  test("FIR", () => {
    let downsampler = new ComplexDownsampler(origSampleRate, sampleRate, 21);
    let output = downsampler.downsample(input[0], input[1]);

    assert.approximately(downsampler.getDelay(), 1, 1e-4);
    assert.isAtMost(
      iqRmsd(
        iqSubarray(output, len / 2),
        iqSubarray(expected, len / 2 - 1, len - 1),
      ),
      0.0001,
    );
  });

  test("FFT", () => {
    let downsampler = new ComplexDownsampler(origSampleRate, sampleRate, 29, {useFftFilter: true});
    let output = downsampler.downsample(input[0], input[1]);

    assert.approximately(downsampler.getDelay(), 5, 1e-4);
    assert.isAtMost(
      iqRmsd(
        iqSubarray(output, len / 2),
        iqSubarray(expected, len / 2 - 5, len - 5),
      ),
      0.0001,
    );
  });
});
