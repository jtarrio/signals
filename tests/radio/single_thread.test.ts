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
import { SingleThread } from "../../src/radio/single_thread.js";

test("Execute", async () => {
  let st = new SingleThread();
  let actual = false;
  await st.run(async () => {
    actual = true;
  });
  assert.isTrue(actual);
});

test("Execute in sequence", async () => {
  let st = new SingleThread();
  let actual = 1;
  st.run(async () => {
    await wait();
    actual += 1;
  });
  st.run(async () => {
    actual *= 10;
  });
  let p3 = st.run(async () => {
    await wait();
    actual += 2;
  });
  assert.equal(actual, 1);
  await p3;
  assert.equal(actual, 22);
});

test("Await in sequence", async () => {
  let st = new SingleThread();
  let actual = 1;
  let p1 = st.run(async () => {
    await wait();
    actual += 1;
  });
  let p2 = st.run(async () => {
    await wait();
    actual *= 10;
  });
  let p3 = st.run(async () => {
    await wait();
    actual += 2;
  });
  assert.equal(actual, 1);
  await p1;
  assert.equal(actual, 2);
  await p2;
  assert.equal(actual, 20);
  await p3;
  assert.equal(actual, 22);
});

test("Return values", async () => {
  let st = new SingleThread();
  let p1 = st.run(async () => 1);
  let p2 = st.run(async () => 2);
  let p3 = st.run(async () => 3);
  assert.equal(await p1, 1);
  assert.equal(await p2, 2);
  assert.equal(await p3, 3);
});

function wait(): Promise<void> {
  let { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(() => resolve(), 25);
  return promise;
}
