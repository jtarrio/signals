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

import { Float32RingBuffer, IqBuffer } from "../dsp/buffers.js";
import { SampleBlock, SignalSource } from "../radio/signal_source.js";
import { PendingReadRing } from "./read_ring.js";

/**
 * A SignalSource that gets samples from a "push" source.
 *
 * You use PushSource when your signal comes in the form of events
 * or callbacks that arrive regularly (push events).
 *
 * Whenever you receive the push event or callback, you must call
 * newSamples(). This function will use the provided samples to resolve
 * pending reads, and then store the remainder in a buffer.
 *
 * The push source is expected to deliver its signals in real time.
 */
export class PushSource implements SignalSource {
  constructor() {
    this.sampleRate = 1024000;
    this.centerFrequency = 0;
    this.I = new Float32RingBuffer(Math.max(65536, this.sampleRate / 10));
    this.Q = new Float32RingBuffer(this.I.capacity);
    this.outBuffer = new IqBuffer(16, 65536);
    this.pendingReads = new PendingReadRing(8);
  }

  private sampleRate: number;
  private centerFrequency: number;
  private I: Float32RingBuffer;
  private Q: Float32RingBuffer;
  private outBuffer: IqBuffer;
  private pendingReads: PendingReadRing;

  async setParameter<V>(_property: string, _value: V): Promise<void | V> {}

  async setSampleRate(sampleRate: number) {
    this.sampleRate = sampleRate;
    this.I = new Float32RingBuffer(Math.max(65536, this.sampleRate / 10));
    this.Q = new Float32RingBuffer(this.I.capacity);
    return this.sampleRate;
  }

  async setCenterFrequency(freq: number): Promise<number> {
    this.centerFrequency = freq;
    return this.centerFrequency;
  }

  async startReceiving(): Promise<void> {
    this.I.clear();
    this.Q.clear();
  }

  protected newSamples(I: Float32Array, Q: Float32Array, frequency?: number) {
    if (frequency !== undefined) this.centerFrequency = frequency;

    let pos = 0;
    while (this.pendingReads.hasPendingRead() && pos < I.length) {
      const remaining = I.length - pos;
      const readSize = this.pendingReads.nextReadSize();

      if (readSize > this.I.available + remaining) break;

      let [oI, oQ] = this.outBuffer.get(readSize);
      let copied = this.I.moveTo(oI);
      if (copied > 0) this.Q.moveTo(oQ);
      if (copied < oI.length) {
        const end = pos + oI.length - copied;
        oI.set(I.subarray(pos, end), copied);
        oQ.set(Q.subarray(pos, end), copied);
        pos = end;
      }
      this.pendingReads.resolve({
        I: oI,
        Q: oQ,
        frequency: this.centerFrequency,
      });
    }

    if (pos < I.length) {
      this.I.store(I.subarray(pos));
      this.Q.store(Q.subarray(pos));
      return;
    }
  }

  readSamples(length: number): Promise<SampleBlock> {
    if (this.I.available < length || this.pendingReads.hasPendingRead()) {
      return this.pendingReads.add(length);
    }

    let [oI, oQ] = this.outBuffer.get(length);
    this.I.moveTo(oI);
    this.Q.moveTo(oQ);
    return Promise.resolve({
      I: oI,
      Q: oQ,
      frequency: this.centerFrequency,
    });
  }

  async close(): Promise<void> {
    this.pendingReads.cancel();
  }
}
