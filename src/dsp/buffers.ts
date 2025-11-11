// Copyright 2024 Jacobo Tarrio Barreiro. All rights reserved.
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
 * A source of pre-allocated arrays of a given size.
 */
abstract class Buffer<T extends TypedArray<T>> {
  /**
   * @param make A function that returns an array of the given length.
   * @param count The number of buffers to keep around. Having more than 1 lets you modify one buffer while you use another.
   * @param length An optional initial length for the arrays.
   */
  constructor(
    private make: (length: number) => T,
    count: number,
    length?: number
  ) {
    this.buffers = [...Array(count).keys()].map(() => make(length || 0));
    this.current = 0;
  }

  private buffers: Array<T>;
  private current: number;

  /** Returns an array of the given size. You may need to clear it manually. */
  get(length: number): T {
    let out = this.buffers[this.current];
    if (out.length < length) {
      out = this.make(length);
      this.buffers[this.current] = out;
    }
    this.current = (this.current + 1) % this.buffers.length;
    if (out.length == length) return out;
    return out.subarray(0, length);
  }
}

/**
 * A source of pre-allocated Uint8Array buffers of a given size.
 */
export class U8Buffer extends Buffer<Uint8Array> {
  /**
   * @param count The number of buffers to keep around. Having more than 1 lets you modify one buffer while you use another.
   * @param length An optional initial size for the buffers.
   */
  constructor(count: number, length?: number) {
    super((l) => new Uint8Array(l), count, length);
  }
}

/**
 * A source of pre-allocated Float32Array buffers of a given size.
 */
export class Float32Buffer extends Buffer<Float32Array> {
  /**
   * @param count The number of buffers to keep around. Having more than 1 lets you modify one buffer while you use another.
   * @param length An optional initial size for the buffers.
   */
  constructor(count: number, length?: number) {
    super((l) => new Float32Array(l), count, length);
  }
}

/**
 * A source of pre-allocated [Float32Array, Float32Array] buffers of a given size.
 */
export class IqBuffer {
  /**
   * @param count The number of buffers to keep around. Having more than 1 lets you modify one buffer while you use another.
   * @param length An optional initial size for the buffers.
   */
  constructor(count: number, length?: number) {
    this.buffers = new Float32Buffer(count * 2, length);
  }

  private buffers: Float32Buffer;

  /** Returns a pair of arrays of the given size. You may need to clear them manually. */
  get(length: number): [Float32Array, Float32Array] {
    return [this.buffers.get(length), this.buffers.get(length)];
  }
}

interface TypedArray<T> {
    readonly BYTES_PER_ELEMENT: number;
    readonly buffer: ArrayBufferLike;
    readonly byteLength: number;
    readonly byteOffset: number;
    copyWithin(target: number, start: number, end?: number): this;
    every(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;
    fill(value: number, start?: number, end?: number): this;
    filter(predicate: (value: number, index: number, array: this) => any, thisArg?: any): T;
    find(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number | undefined;
    findIndex(predicate: (value: number, index: number, obj: this) => boolean, thisArg?: any): number;
    forEach(callbackfn: (value: number, index: number, array: this) => void, thisArg?: any): void;
    indexOf(searchElement: number, fromIndex?: number): number;
    join(separator?: string): string;
    lastIndexOf(searchElement: number, fromIndex?: number): number;
    readonly length: number;
    map(callbackfn: (value: number, index: number, array: this) => number, thisArg?: any): T;
    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;
    reduce(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;
    reduce<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;
    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number): number;
    reduceRight(callbackfn: (previousValue: number, currentValue: number, currentIndex: number, array: this) => number, initialValue: number): number;
    reduceRight<U>(callbackfn: (previousValue: U, currentValue: number, currentIndex: number, array: this) => U, initialValue: U): U;
    reverse(): this;
    set(array: ArrayLike<number>, offset?: number): void;
    slice(start?: number, end?: number): T;
    some(predicate: (value: number, index: number, array: this) => unknown, thisArg?: any): boolean;
    sort(compareFn?: (a: number, b: number) => number): this;
    subarray(begin?: number, end?: number): T;
    toLocaleString(): string;
    toString(): string;
    valueOf(): this;
    [index: number]: number;
}

/**
 * A variable-size ring buffer, where you can store data and then access up to the latest N values.
 */
class RingBuffer<T extends TypedArray<T>> {
  constructor(private buffer: T) {
    this.readPos = 0;
    this.writePos = 0;
    this.filled = 0;
  }

  private readPos: number;
  private writePos: number;
  private filled: number;

  /** Returns the ring buffer's capacity. */
  get capacity() {
    return this.buffer.length;
  }

  /** Returns the number of values that can be accessed using moveTo. */
  get available() {
    return this.filled;
  }

  /** Empties the ring buffer. */
  clear() {
    this.readPos = 0;
    this.writePos = 0;
    this.filled = 0;
  }

  /** Copies the provided data into the ring buffer. */
  store(data: T) {
    let count = Math.min(data.length, this.buffer.length);
    let { dstOffset } = this.doCopy(count, data, 0, this.buffer, this.writePos);
    this.writePos = dstOffset;
    this.filled = Math.min(this.buffer.length, this.filled + count);
    if (this.filled == this.buffer.length) {
      this.readPos = this.writePos;
    }
  }

  /**
   * Fills the provided array with values from the ring buffer,
   * consuming it in the same order as the values were written.
   * Returns the number of values copied.
   */
  moveTo(data: T): number {
    let count = Math.min(data.length, this.buffer.length, this.filled);
    if (count == 0) return 0;
    let { srcOffset } = this.doCopy(count, this.buffer, this.readPos, data, 0);
    this.readPos = srcOffset;
    this.filled -= count;
    return count;
  }

  /**
   * Fills the provided array with the latest values stored in the ring buffer,
   * without consuming it and without taking into account the values consumed
   * by moveTo.
   */
  copyTo(data: T) {
    let count = Math.min(data.length, this.buffer.length, this.filled);
    let srcOffset =
      (this.writePos + this.buffer.length - count) % this.buffer.length;
    this.doCopy(count, this.buffer, srcOffset, data, 0);
  }

  private doCopy<T extends TypedArray<T>>(
    count: number,
    src: T,
    srcOffset: number,
    dst: T,
    dstOffset: number
  ): { srcOffset: number; dstOffset: number } {
    while (count > 0) {
      const copyCount = Math.min(
        count,
        src.length - srcOffset,
        dst.length - dstOffset
      );
      dst.set(src.subarray(srcOffset, srcOffset + copyCount), dstOffset);
      srcOffset = (srcOffset + copyCount) % src.length;
      dstOffset = (dstOffset + copyCount) % dst.length;
      count -= copyCount;
    }
    return { srcOffset, dstOffset };
  }
}

/**
 * A Float32 variable-size ring buffer, where you can store data and then retrieve the latest N values.
 */
export class Float32RingBuffer extends RingBuffer<Float32Array> {
  constructor(size: number) {
    super(new Float32Array(size));
  }
}
