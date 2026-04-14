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
  argument,
  iq,
  iqAdd,
  iqRmsd,
  iqSineTone,
  modulus,
  rmsd,
  sineTone,
} from "../testutil.js";
import { FFT, RealFFT } from "../../src/dsp/fft.js";

test("transform", () => {
  const sampleRate = 4096;
  let fft = FFT.ofLength(4096);
  let input = iqAdd(
    iqSineTone(fft.length, sampleRate, 300, 0.1, 1),
    iqSineTone(fft.length, sampleRate, -1300, 0.2, 1.1),
    iqSineTone(fft.length, sampleRate, 2300, 0.3, 1.2),
    iqSineTone(fft.length, sampleRate, -3300, 0.4, 1.3),
  );
  let output = fft.transform(input[0], input[1]);
  assert.approximately(modulus(output, 300), 0.1, 1e-7);
  assert.approximately(modulus(output, 4096 - 1300), 0.2, 1e-7);
  assert.approximately(modulus(output, 2300), 0.3, 1e-7);
  assert.approximately(modulus(output, 4096 - 3300), 0.4, 1e-7);
  assert.approximately(argument(output, 300), 1, 1e-7);
  assert.approximately(argument(output, 4096 - 1300), 1.1, 1e-7);
  assert.approximately(argument(output, 2300), 1.2, 1e-7);
  assert.approximately(argument(output, 4096 - 3300), 1.3, 1e-7);
});

test("reverse", () => {
  const sampleRate = 4096;
  let fft = FFT.ofLength(4096);
  let input = iq(fft.length);
  input[0][300] = 0.1 * Math.cos(1);
  input[1][300] = 0.1 * Math.sin(1);
  input[0][4096 - 1300] = 0.2 * Math.cos(1.1);
  input[1][4096 - 1300] = 0.2 * Math.sin(1.1);
  input[0][2300] = 0.3 * Math.cos(1.2);
  input[1][2300] = 0.3 * Math.sin(1.2);
  input[0][4096 - 3300] = 0.4 * Math.cos(1.3);
  input[1][4096 - 3300] = 0.4 * Math.sin(1.3);
  let output = fft.reverse(input[0], input[1]);

  let expected = iqAdd(
    iqSineTone(fft.length, sampleRate, 300, 0.1, 1),
    iqSineTone(fft.length, sampleRate, -1300, 0.2, 1.1),
    iqSineTone(fft.length, sampleRate, 2300, 0.3, 1.2),
    iqSineTone(fft.length, sampleRate, -3300, 0.4, 1.3),
  );
  assert.isAtMost(iqRmsd(output, expected), 1e-7);
});

test("transformReal", () => {
  const sampleRate = 4096;
  const fft = RealFFT.ofLength(4096);
  const real = add(
    sineTone(fft.length, sampleRate, 300, 0.3),
    sineTone(fft.length, sampleRate, 1300, 0.7),
  );
  const actual = fft.transform(real);
  assert.approximately(modulus(actual, 300), 0.15, 1e-7);
  assert.approximately(modulus(actual, 1300), 0.35, 1e-7);
  assert.approximately(modulus(actual, 4096 - 300), 0.15, 1e-7);
  assert.approximately(modulus(actual, 4096 - 1300), 0.35, 1e-7);
});

test("reverseReal", () => {
  const sampleRate = 4096;
  let fft = RealFFT.ofLength(4096);
  let input = iq(fft.length);
  input[0][300] = 0.15 * Math.cos(1);
  input[1][300] = 0.15 * Math.sin(1);
  input[0][1300] = 0.35 * Math.cos(1.1);
  input[1][1300] = 0.35 * Math.sin(1.1);
  let output = fft.reverse(input[0], input[1]);

  let expected = add(
    sineTone(fft.length, sampleRate, 300, 0.3, 1),
    sineTone(fft.length, sampleRate, 1300, 0.7, 1.1),
  );
  assert.isAtMost(rmsd(output, expected), 1e-7);
});

test("roundtrip", () => {
  const sampleRate = 4096;
  let fft = FFT.ofLength(sampleRate);
  let input = iq(fft.length);
  for (let f = 0; f < fft.length / 2; ++f) {
    input = iqAdd(
      input,
      iqSineTone(sampleRate, sampleRate, f, 1 / fft.length, f),
    );
  }

  let middle = fft.transform(input[0], input[1]);
  let output = fft.reverse(middle[0], middle[1]);

  assert.isAtMost(iqRmsd(output, input), 1e-7);
});


test("realRoundtrip", () => {
  const sampleRate = 4096;
  let fft = RealFFT.ofLength(sampleRate);
  let input = new Float32Array(fft.length) as Float32Array;
  for (let f = 0; f < fft.length / 2; ++f) {
    input = add(
      input,
      sineTone(sampleRate, sampleRate, f, 1 / fft.length, f),
    );
  }

  let middle = fft.transform(input);
  let output = fft.reverse(middle[0], middle[1]);

  assert.isAtMost(rmsd(output, input), 1e-7);
});
