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

import { getWasmFft, WasmFft } from "../wasm/fft.js";
import { Float32Pool, Float32RingBuffer, IqPool } from "./buffers.js";

/** Fast Fourier Transform implementation. */

/**
 * Returns the length of the FFT for a given array length.
 *
 * This FFT implementation only works in power-of-2 lengths,
 * so this function returns the next available length.
 */
export function actualLength(minimumLength: number): number {
  if (minimumLength < 4) minimumLength = 4;
  if (((minimumLength - 1) & minimumLength) == 0) return minimumLength;
  let realLength = 1;
  while (realLength < minimumLength) realLength <<= 1;
  return realLength;
}

/**
 * The output of the transform functions.
 *
 * The first array contains the real parts, and the second array contains the imaginary parts.
 */
export type FFTOutput = [Float32Array, Float32Array];

/** Fast Fourier Transform and reverse transform with a given length. */
export class FFT {
  /**
   * Returns an FFT instance that fits the given length.
   *
   * The actual length may be greater than the given length if it
   * is not a power of 2.
   */
  static ofLength(minimumLength: number): FFT {
    return new FFT(actualLength(minimumLength));
  }

  private constructor(public length: number) {
    this.revIndex = reversedBitIndices(length);
    this.wasmFft = getWasmFft();
    this.wasmFft.setCoefs(makeFftCoefficients(length));
    this.copy = new IqPool(4, length);
    this.out = new IqPool(4, length);
    this.window = new Float32Array(length);
    this.window.fill(1);
  }

  private revIndex: Int32Array;
  private wasmFft: WasmFft;
  private copy: IqPool;
  private out: IqPool;
  private window: Float32Array;

  /** Sets the window function for this FFT. */
  setWindow(window: Float32Array) {
    this.window.set(window);
  }

  /**
   * Transforms the given time-domain input.
   * @param real An array of real parts.
   * @param imag An array of imaginary parts.
   * @return The output of the transform.
   */
  transform(real: Float32Array, imag?: Float32Array): FFTOutput;
  transform(real: number[], imag?: number[]): FFTOutput;
  transform<T extends Array<number>>(real: T, imag?: T): FFTOutput {
    const length = this.length;
    let [outReal, outImag] = this.out.get(length);
    outReal.fill(0);
    outImag.fill(0);
    if (imag === undefined) {
      for (let i = 0; i < length && i < real.length; ++i) {
        const ri = this.revIndex[i];
        outReal[ri] = (this.window[i] * real[i]) / length;
      }
    } else {
      for (let i = 0; i < length && i < real.length && i < imag.length; ++i) {
        const ri = this.revIndex[i];
        outReal[ri] = (this.window[i] * real[i]) / length;
        outImag[ri] = (this.window[i] * imag[i]) / length;
      }
    }
    let res = this.wasmFft.fft(outReal, outImag, false);
    outReal.set(res[0]);
    outImag.set(res[1]);
    return [outReal, outImag];
  }

  transformCircularBuffers(
    real: Float32RingBuffer,
    imag: Float32RingBuffer,
  ): FFTOutput {
    const length = this.length;
    let [copyReal, copyImag] = this.copy.get(length);
    real.copyTo(copyReal);
    imag.copyTo(copyImag);
    return this.transform(copyReal, copyImag);
  }

  /**
   * Does a reverse transform of the given frequency-domain input.
   * The input and output arrays must be the same length as the FFT.
   * @param real An array of real parts.
   * @param imag An array of imaginary parts.
   * @return The output of the reverse transform.
   */
  reverse(real: Float32Array, imag: Float32Array): FFTOutput;
  reverse(real: number[], imag: number[]): FFTOutput;
  reverse<T extends Array<number>>(real: T, imag: T): FFTOutput {
    const length = this.length;
    let [outReal, outImag] = this.out.get(length);
    outReal.fill(0);
    outImag.fill(0);
    for (let i = 0; i < length && i < real.length && i < imag.length; ++i) {
      const ri = this.revIndex[i];
      outReal[ri] = real[i];
      outImag[ri] = imag[i];
    }
    let res = this.wasmFft.fft(outReal, outImag, true);
    outReal.set(res[0]);
    outImag.set(res[1]);
    return [outReal, outImag];
  }
}

/** Fast Fourier Transform and reverse transform for real signals. */
export class RealFFT {
  static ofLength(minimumLength: number): RealFFT {
    return new RealFFT(actualLength(minimumLength));
  }

  private constructor(public length: number) {
    const halfLen = length / 2;
    this.revIndex = reversedBitIndices(halfLen);
    this.wasmFft = getWasmFft();
    this.wasmFft.setCoefs(makeFftCoefficients(halfLen));
    this.wasmFft.setExpnCoefs(makeExpnFftCoefficients(halfLen));
    this.copyEven = new Float32Array(halfLen);
    this.copyOdd = new Float32Array(halfLen);
    this.out = new IqPool(2, halfLen);
    this.outReal = new Float32Pool(2, length);
  }

  private revIndex: Int32Array;
  private wasmFft: WasmFft;
  private out: IqPool;
  private outReal: Float32Pool;
  private copyEven: Float32Array;
  private copyOdd: Float32Array;

  /**
   * Transforms the given real time-domain input.
   * @param real An array of real numbers.
   * @return The output of the transform.
   */
  transform(real: Float32Array): FFTOutput {
    const len = this.length;
    const hlen = len / 2;
    for (let i = 0; i < hlen; ++i) {
      const ri = this.revIndex[i];
      this.copyEven[ri] = real[2 * i] / hlen;
      this.copyOdd[ri] = real[2 * i + 1] / hlen;
    }
    this.wasmFft.fft(this.copyEven, this.copyOdd, false);
    const res = this.wasmFft.realFftPost();
    const out = this.out.get(len);
    out[0].set(res[0]);
    out[1].set(res[1]);
    return out;
  }

  /**
   * Does a reverse transform of the given frequency-domain input.
   * The input and output arrays must be at least half the FFT's length.
   * @param real An array of real parts.
   * @param imag An array of imaginary parts.
   * @return The real output of the reverse transform.
   */
  reverse(real: Float32Array, imag: Float32Array): Float32Array {
    const len = this.length;
    const hlen = len / 2;
    const [preEven, preOdd] = this.wasmFft.reverseRealFftPre(real, imag);
    for (let i = 0; i < hlen; ++i) {
      const ri = this.revIndex[i];
      this.copyEven[ri] = preEven[i];
      this.copyOdd[ri] = preOdd[i];
    }
    const [outEven, outOdd] = this.wasmFft.fft(this.copyEven, this.copyOdd, true);
    const out = this.outReal.get(len);
    for (let i = 0; i < hlen; ++i) {
      out[2 * i] = outEven[i];
      out[2 * i + 1] = outOdd[i];
    }
    return out;
  }
}

/**
 * Builds a triangle of direct and reverse FFT coefficients for the given length.
 *
 * The coefficients are organized like this:
 *
 * - 4 real coefficients, 4 imaginary coefficients (8 so far) for the length=8 FFTs
 * - 8 real coefficients, 8 imaginary coefficients (24 so far) for the length=16 FFTs
 * - 16 real coefficients, 16 imaginary coefficients (32 so far) for the length=32 FFTs
 * - ...
 * - fftLength/2 real coefficients, fftLength/2 imaginary coefficients (2 * fftLength - 8 in total)
 */
function makeFftCoefficients(length: number): Float32Array {
  let numBits = getNumBits(length);
  let coefsLen = 2 * length - 8;
  let coefs = new Float32Array(coefsLen);
  let offset = 0;

  for (let bin = 0, halfSize = 4; bin < numBits - 2; ++bin, halfSize *= 2) {
    for (let i = 0; i < halfSize; ++i) {
      coefs[offset++] = Math.cos((-Math.PI * i) / halfSize);
    }
    for (let i = 0; i < halfSize; ++i) {
      coefs[offset++] = Math.sin((-Math.PI * i) / halfSize);
    }
  }

  return coefs;
}

/** Builds an array of expanding/collapsing coefficients for the real FFT. */
function makeExpnFftCoefficients(halfLen: number): Float32Array {
  let coefs = new Float32Array(2 * (halfLen + 1));
  let offset = 0;
  for (let k = 0; k < halfLen; ++k) {
    coefs[offset++] = Math.cos((-Math.PI * k) / halfLen);
  }
  for (let k = 0; k < halfLen; ++k) {
    coefs[offset++] = Math.sin((-Math.PI * k) / halfLen);
  }
  return coefs;
}

/** Builds an array of numbers with their bits reversed. */
function reversedBitIndices(length: number): Int32Array {
  const numBits = getNumBits(length);
  let output = new Int32Array(length);
  for (let i = 0; i < length; ++i) {
    output[i] = reverseBits(i, numBits);
  }
  return output;
}

/** Returns how many bits we need to fit 'length' distinct values. */
function getNumBits(length: number): number {
  let numBits = 0;
  for (let shifted = length - 1; shifted > 0; shifted >>= 1) ++numBits;
  return numBits;
}

/** Reverses the bits in a number. */
function reverseBits(num: number, bits: number): number {
  let output = 0;
  for (let b = 0; b < bits; ++b) {
    output <<= 1;
    output |= num & 1;
    num >>= 1;
  }
  return output;
}
