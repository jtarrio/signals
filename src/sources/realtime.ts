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
import { RadioError, RadioErrorType } from "../errors.js";
import { SampleBlock, SignalSource } from "../radio/signal_source.js";

/**
 * A function that generates samples.
 * @param startSample The first sample's number.
 * @param sampleRate The sample rate.
 * @param centerFrequency The signal's center frequency.
 * @param I An array to be populated with the I component values.
 * @param Q An array to be populated with the Q component values.
 */
export type SampleGenerator = (
  startSample: number,
  sampleRate: number,
  centerFrequency: number,
  I: Float32Array,
  Q: Float32Array
) => void;

/** A SignalSource that gets samples from a SampleGenerator function in real time. */
export class RealTimeSource implements SignalSource {
  constructor(private generator: SampleGenerator) {
    this.sampleRate = 1024000;
    this.centerFrequency = 0;
    this.I = new Float32RingBuffer(Math.max(65536, this.sampleRate / 10));
    this.Q = new Float32RingBuffer(this.I.capacity);
    this.lastSampleInBuffer = 0;
    this.inBuffer = new IqBuffer(1, 65536);
    this.outBuffer = new IqBuffer(16, 65536);
    this.pendingReads = new PendingReadRing(8);
    this.running = false;
    this.firstTs = null;
  }

  private sampleRate: number;
  private centerFrequency: number;
  private I: Float32RingBuffer;
  private Q: Float32RingBuffer;
  private lastSampleInBuffer: number;
  private inBuffer: IqBuffer;
  private outBuffer: IqBuffer;
  private pendingReads: PendingReadRing;
  private running: boolean;
  private firstTs: number | null;

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
      let [I, Q] = this.outBuffer.get(readSize);
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

    let [I, Q] = this.inBuffer.get(fillCount);
    this.generator(fillStart, this.sampleRate, this.centerFrequency, I, Q);
    this.I.store(I);
    this.Q.store(Q);
    this.lastSampleInBuffer = fillStart + fillCount;
  }
}

type ResolveFn = (block: SampleBlock) => void;
type RejectFn = (reason?: any) => void;
type PendingRead = { length: number; resolve: ResolveFn; reject: RejectFn };

class PendingReadRing {
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
