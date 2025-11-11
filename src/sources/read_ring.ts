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

import { RadioError, RadioErrorType } from "../errors.js";
import { SampleBlock } from "../radio/signal_source.js";

type ResolveFn = (block: SampleBlock) => void;
type RejectFn = (reason?: any) => void;
type PendingRead = { length: number; resolve: ResolveFn; reject: RejectFn };

export class PendingReadRing {
  constructor(length: number) {
    this.pending = new Array(length);
    this.writePtr = 0;
    this.readPtr = 0;
    this.size = 0;
  }

  private pending: PendingRead[];
  private writePtr: number;
  private readPtr: number;
  private size: number;

  add(length: number): Promise<SampleBlock> {
    if (this.size == this.pending.length) {
      throw new RadioError(
        "Too many simultaneous reads",
        RadioErrorType.TransferError
      );
    }
    const { promise, resolve, reject } = Promise.withResolvers<SampleBlock>();
    this.pending[this.writePtr] = { length, resolve, reject };
    this.writePtr = (this.writePtr + 1) % this.pending.length;
    this.size++;
    return promise;
  }

  resolve(block: SampleBlock) {
    if (this.size == 0) return;
    this.pending[this.readPtr].resolve(block);
    this.readPtr = (this.readPtr + 1) % this.pending.length;
    this.size--;
  }

  cancel() {
    while (this.size > 0) {
      this.pending[this.readPtr].reject(
        new RadioError(
          "Transfer has been canceled",
          RadioErrorType.TransferError
        )
      );
      this.readPtr = (this.readPtr + 1) % this.pending.length;
      this.size--;
    }
  }

  hasPendingRead(): boolean {
    return this.size > 0;
  }

  nextReadSize(): number {
    if (this.size == 0) return 0;
    return this.pending[this.readPtr].length;
  }
}
