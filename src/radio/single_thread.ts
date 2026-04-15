// Copyright 2026 Jacobo Tarrio Barreiro. All rights reserved.
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

/**
 * A class that lets you execute multiple async functions in a single 'thread'.
 *
 * Functions passed to the `run()` function will be executed in strict sequence.
 */
export class SingleThread {
  constructor() {
    this.promise = Promise.resolve();
  }

  private promise: Promise<any>;

  /**
   * Executes the provided async function.
   *
   * Functions passed to `run()` are executed in strict sequence: each function only starts after the previous one ends.
   *
   * Make sure your function doesn't throw, because then the behavior is undefined.
   */
  async run<T>(fn: () => Promise<T>) {
    this.promise = this.promise.then(() => fn());
    return this.promise;
  }
}
