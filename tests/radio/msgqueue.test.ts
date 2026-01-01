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
import { Channel } from "../../src/radio/msgqueue.js";

test("Send before receive", async () => {
  let ch = new Channel<number, number>();
  const sent = 1234;
  let sendPromise = ch.send(sent);
  let received = await ch.receive();
  assert.equal(received.msg, sent);
  received.ack(received.msg + 1);
  assert.equal(await sendPromise, sent + 1);
});

test("Receive before send", async () => {
  let ch = new Channel<number, number>();
  const sent = 1234;
  let rcvPromise = ch.receive();
  let sendPromise = ch.send(sent);
  let received = await rcvPromise;
  assert.equal(received.msg, sent);
  received.ack(received.msg + 1);
  assert.equal(await sendPromise, sent + 1);
});

