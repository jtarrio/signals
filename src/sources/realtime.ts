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

import { Float32RingBuffer, IqPool } from "../dsp/buffers.js";
import { SampleBlock } from "../radio/sample_block.js";
import { SignalSource } from "../radio/signal_source.js";
import { PendingReadRing } from "./read_ring.js";

/**
 * A SignalSource that outputs samples in real time.
 *
 * This source holds a small buffer that it feeds by calling the getSamples() method.
 * Then, at periodic intervals, it checks if there are any pending reads and resolves
 * them with the contents of the buffer, refilling it as needed.
 */
export class RealTimeSource<ParameterKey extends string = string> implements SignalSource<ParameterKey> {
  constructor() {
    this.sampleRate = 1024000;
    this.centerFrequency = 0;
    this.I = new Float32RingBuffer(Math.max(65536, this.sampleRate / 10));
    this.Q = new Float32RingBuffer(this.I.capacity);
    this.lastSampleInBuffer = 0;
    this.inPool = new IqPool(1, 65536);
    this.outPool = new IqPool(16, 65536);
    this.pendingReads = new PendingReadRing(8);
    this.running = false;
    this.firstTs = null;
  }

  /** The source's sample rate. */
  protected sampleRate: number;
  /** The source's center frequency. */
  protected centerFrequency: number;
  
  private I: Float32RingBuffer;
  private Q: Float32RingBuffer;
  private lastSampleInBuffer: number;
  private inPool: IqPool;
  private outPool: IqPool;
  private pendingReads: PendingReadRing;
  private running: boolean;
  private firstTs: number | null;

  /**
   * Fills the provided I and Q arrays with samples starting at the given firstSample number. */
  protected getSamples(firstSample: number, I: Float32Array, Q: Float32Array) {
    I.fill(0);
    Q.fill(0);
  }

  async setParameter<V>(_property: ParameterKey, _value: V): Promise<void | V> {}

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
    this.firstTs = null;
    this.lastSampleInBuffer = 0;
    this.running = true;
    this.schedule();
  }

  readSamples(length: number): Promise<SampleBlock> {
    return this.pendingReads.add(length);
  }

  async close(): Promise<void> {
    this.running = false;
    this.pendingReads.cancel();
  }

  /** Schedules the next frame. */
  private schedule() {
    requestAnimationFrame((ts) => this.frame(ts));
  }

  /** Fills the buffer and resolves promises for samples that become available in this frame. */
  private frame(ts: number) {
    if (!this.running) return;

    if (this.firstTs === null) this.firstTs = ts;

    const curSample = Math.floor(
      ((ts - this.firstTs) * this.sampleRate) / 1000
    );

    // We always try to fill the buffer when there are no pending reads.
    if (
      this.I.capacity > this.I.available &&
      !this.pendingReads.hasPendingRead()
    ) {
      this.fillBuffer(curSample);
    }

    while (this.pendingReads.hasPendingRead()) {
      const firstSampleInBuffer = this.lastSampleInBuffer - this.I.available;
      const canRead = curSample - firstSampleInBuffer;
      const readSize = this.pendingReads.nextReadSize();
      if (readSize > canRead) {
        break;
      }
      if (canRead > this.I.available) {
        // We ran out of data while resolving pending reads, so fill the buffer.
        // This is not desireable, because now we will have jitter.
        this.fillBuffer(curSample);
        continue;
      }
      let [I, Q] = this.outPool.get(readSize);
      this.I.moveTo(I);
      this.Q.moveTo(Q);
      this.pendingReads.resolve({ I, Q, frequency: this.centerFrequency });
    }

    this.schedule();
  }

  /** Fills the buffer with samples to satisfy future reads. */
  private fillBuffer(curSample: number) {
    let startWant = curSample - this.pendingReads.nextReadSize();

    const firstSampleInBuffer = this.lastSampleInBuffer - this.I.available;
    const endSampleInBuffer = firstSampleInBuffer + this.I.capacity;
    let fillStart;
    let fillCount;
    if (startWant >= endSampleInBuffer) {
      fillStart = startWant;
      fillCount = this.I.capacity;
    } else if (curSample >= endSampleInBuffer) {
      fillStart = this.lastSampleInBuffer;
      fillCount = curSample - this.lastSampleInBuffer;
    } else {
      fillStart = this.lastSampleInBuffer;
      fillCount = this.I.capacity - this.I.available;
    }
    if (fillCount == 0) return;

    let [I, Q] = this.inPool.get(fillCount);
    this.getSamples(fillStart, I, Q);
    this.I.store(I);
    this.Q.store(Q);
    this.lastSampleInBuffer = fillStart + fillCount;
  }
}
