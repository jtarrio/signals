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
  modulateAM,
  modulateFM,
  product,
  sum,
  tone,
} from "../../src/sources/generators.js";
import { IQ, iqRmsd } from "../testutil.js";

describe("tone", () => {
  const len = 4800;
  const freq = 1_000_000;
  const ampl = 0.75;
  let outI = new Float32Array(len);
  let outQ = new Float32Array(len);
  let gen = tone(freq, ampl);

  const expected = (relFreq: number, sampleRate: number): IQ => {
    return [
      new Float32Array(len).map(
        (_, i) => ampl * Math.cos((2 * Math.PI * relFreq * i) / sampleRate)
      ),
      new Float32Array(len).map(
        (_, i) => ampl * Math.sin((2 * Math.PI * relFreq * i) / sampleRate)
      ),
    ];
  };

  test("On center", () => {
    const sampleRate = 48000;
    gen(0, sampleRate, freq, outI, outQ);
    assert.isAtMost(iqRmsd([outI, outQ], expected(0, sampleRate)), 1e-7);
  });

  test("1500 below", () => {
    const sampleRate = 48000;
    gen(0, sampleRate, freq - 1500, outI, outQ);
    assert.isAtMost(iqRmsd([outI, outQ], expected(+1500, sampleRate)), 1e-7);
  });

  test("2500 above", () => {
    const sampleRate = 48000;
    gen(0, sampleRate, freq + 2500, outI, outQ);
    assert.isAtMost(iqRmsd([outI, outQ], expected(-2500, sampleRate)), 1e-7);
  });

  test("out of band", () => {
    const sampleRate = 48000;
    gen(0, sampleRate, freq + 2 * sampleRate, outI, outQ);
    assert.isAtMost(
      iqRmsd([outI, outQ], [new Float32Array(len), new Float32Array(len)]),
      1e-7
    );
  });
});

test("sum", () => {
  const len = 4800;
  const sampleRate = 48000;
  let outI = new Float32Array(len);
  let outQ = new Float32Array(len);
  let gen = sum(
    tone(-10000, 0.2),
    tone(-3000, 0.12),
    tone(-500, 0.04),
    tone(1000, 0.08),
    tone(4500, 0.16),
    tone(15000, 0.24)
  );

  gen(0, sampleRate, 0, outI, outQ);

  let expI = new Float32Array(len).map(
    (_, i) =>
      0.2 * Math.cos((2 * Math.PI * -10000 * i) / sampleRate) +
      0.12 * Math.cos((2 * Math.PI * -3000 * i) / sampleRate) +
      0.04 * Math.cos((2 * Math.PI * -500 * i) / sampleRate) +
      0.08 * Math.cos((2 * Math.PI * 1000 * i) / sampleRate) +
      0.16 * Math.cos((2 * Math.PI * 4500 * i) / sampleRate) +
      0.24 * Math.cos((2 * Math.PI * 15000 * i) / sampleRate)
  );
  let expQ = new Float32Array(len).map(
    (_, i) =>
      0.2 * Math.sin((2 * Math.PI * -10000 * i) / sampleRate) +
      0.12 * Math.sin((2 * Math.PI * -3000 * i) / sampleRate) +
      0.04 * Math.sin((2 * Math.PI * -500 * i) / sampleRate) +
      0.08 * Math.sin((2 * Math.PI * 1000 * i) / sampleRate) +
      0.16 * Math.sin((2 * Math.PI * 4500 * i) / sampleRate) +
      0.24 * Math.sin((2 * Math.PI * 15000 * i) / sampleRate)
  );
  assert.isAtMost(iqRmsd([outI, outQ], [expI, expQ]), 1e-7);
});

test("product", () => {
  const len = 4096;
  const sampleRate = 40960;
  const carrierFreq = 1000000;
  let outI = new Float32Array(len);
  let outQ = new Float32Array(len);
  let gen = product(
    tone(carrierFreq, 1),
    sum(tone(1500, 0.5), tone(-1500, 0.5))
  );

  gen(0, sampleRate, carrierFreq - 2000, outI, outQ);

  let expI = new Float32Array(len).map(
    (_, i) =>
      0.5 * Math.cos((2 * Math.PI * 500 * i) / sampleRate) +
      0.5 * Math.cos((2 * Math.PI * 3500 * i) / sampleRate)
  );
  let expQ = new Float32Array(len).map(
    (_, i) =>
      0.5 * Math.sin((2 * Math.PI * 500 * i) / sampleRate) +
      0.5 * Math.sin((2 * Math.PI * 3500 * i) / sampleRate)
  );
  assert.isAtMost(iqRmsd([outI, outQ], [expI, expQ]), 1e-7);
});

test("modulateAM", () => {
  const len = 4096;
  const sampleRate = 40960;
  const carrierFreq = 1000000;
  let outI = new Float32Array(len);
  let outQ = new Float32Array(len);
  let gen = modulateAM(carrierFreq, 1, tone(1500, 1));

  gen(0, sampleRate, carrierFreq - 2000, outI, outQ);

  let expI = new Float32Array(len).map(
    (_, i) =>
      0.25 * Math.cos((2 * Math.PI * 500 * i) / sampleRate) +
      0.5 * Math.cos((2 * Math.PI * 2000 * i) / sampleRate) +
      0.25 * Math.cos((2 * Math.PI * 3500 * i) / sampleRate)
  );
  let expQ = new Float32Array(len).map(
    (_, i) =>
      0.25 * Math.sin((2 * Math.PI * 500 * i) / sampleRate) +
      0.5 * Math.sin((2 * Math.PI * 2000 * i) / sampleRate) +
      0.25 * Math.sin((2 * Math.PI * 3500 * i) / sampleRate)
  );
  assert.isAtMost(iqRmsd([outI, outQ], [expI, expQ]), 1e-7);
});

test("modulateFM", () => {
  const len = 19200;
  const sampleRate = 192000;
  const carrierFreq = 1000000;
  const maxDev = 5000;
  let outI = new Float32Array(len);
  let outQ = new Float32Array(len);
  let gen = modulateFM(carrierFreq, maxDev, 1, tone(1500, 1));

  gen(0, sampleRate, carrierFreq - 10000, outI, outQ);

  let signal = Array.from({ length: len }).map((_, i) =>
    Math.cos((2 * Math.PI * 1500 * i) / sampleRate)
  );
  let angle = new Array(len);
  angle[0] = 0;
  for (let i = 1; i < angle.length; ++i) {
    angle[i] =
      angle[i - 1] +
      (2 * Math.PI * 10000) / sampleRate +
      (2 * Math.PI * maxDev * signal[i - 1]) / sampleRate;
  }
  let expI = new Float32Array(angle.map((a) => Math.cos(a)));
  let expQ = new Float32Array(angle.map((a) => Math.sin(a)));

  assert.isAtMost(iqRmsd([outI, outQ], [expI, expQ]), 1e-7);
});
