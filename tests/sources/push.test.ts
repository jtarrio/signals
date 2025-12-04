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
import { PushSource } from "../../src/sources/push";
import { iqRmsd, iqSineTone, iqSubarray } from "../testutil";

test("Push", async () => {
  const freq = 1_000_000;
  let signal = iqSineTone(3000, 48000, 1500, 1);

  let src = new PushSource();
  await src.setSampleRate(48000);
  await src.setCenterFrequency(freq);
  await src.startReceiving();
  let promises = [
    src.readSamples(1000),
    src.readSamples(1000),
    src.readSamples(1000),
  ];

  // Consolidate many pushed signals into a single promise
  for (let i = 0; i < 10; ++i) {
    src.pushSamples(...iqSubarray(signal, i * 100, (i + 1) * 100), freq);
  }
  let rcv = await promises[0];
  assert.isAtMost(iqRmsd([rcv.I, rcv.Q], iqSubarray(signal, 0, 1000)), 1e-7);

  // A big pushed signal is split into two promises
  src.pushSamples(...iqSubarray(signal, 1000, 3000), freq);
  rcv = await promises[1];
  assert.isAtMost(iqRmsd([rcv.I, rcv.Q], iqSubarray(signal, 1000, 2000)), 1e-7);
  rcv = await promises[2];
  assert.isAtMost(iqRmsd([rcv.I, rcv.Q], iqSubarray(signal, 2000, 3000)), 1e-7);
});
