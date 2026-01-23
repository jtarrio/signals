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

import { Float32RingBuffer, IqPool } from "./buffers.js";

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
    this.coefs = makeFftCoefficients(length);
    this.copy = new IqPool(4, length);
    this.out = new IqPool(4, length);
    this.window = new Float32Array(length);
    this.window.fill(1);
  }

  private revIndex: Int32Array;
  private coefs: ComplexArray[];
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
    doFastTransform(this.length, false, this.coefs, outReal, outImag);
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
    doFastTransform(this.length, true, this.coefs, outReal, outImag);
    return [outReal, outImag];
  }
}

/** Performs a fast direct or reverse transform in place. */
function doFastTransform(
  length: number,
  reverse: boolean,
  coefs: ComplexArray[],
  real: Float32Array,
  imag: Float32Array,
) {
  const s = reverse ? -1 : 1;

  for (let dftStart = 0; dftStart < length; dftStart += 4) {
    const n0 = dftStart;
    const n1 = dftStart + 1;
    const n2 = dftStart + 2;
    const n3 = dftStart + 3;
    const a0 = real[n0];
    const a1 = real[n1];
    const a2 = real[n2];
    const a3 = real[n3];
    const b0 = imag[n0];
    const b1 = imag[n1];
    const b2 = imag[n2];
    const b3 = imag[n3];
    real[n0] = a0 + a1 + a2 + a3;
    real[n1] = a0 - a1 - s * (b3 - b2);
    real[n2] = a0 + a1 - a2 - a3;
    real[n3] = a0 - a1 + s * (b3 - b2);
    imag[n0] = b0 + b1 + b2 + b3;
    imag[n1] = b0 - b1 - s * (a2 - a3);
    imag[n2] = b0 + b1 - b2 - b3;
    imag[n3] = b0 - b1 + s * (a2 - a3);
  }

  for (
    let dftSize = 8, coeffBin = 0;
    dftSize <= length;
    dftSize *= 2, ++coeffBin
  ) {
    const binCoefficients = coefs[coeffBin];
    const halfDftSize = dftSize / 2;
    for (let dftStart = 0; dftStart < length; dftStart += dftSize) {
      for (let i = 0; i < halfDftSize; i += 4) {
        {
          const cr0 = binCoefficients.real[i];
          const ci0 = binCoefficients.imag[i] * s;
          const cr1 = binCoefficients.real[i + 1];
          const ci1 = binCoefficients.imag[i + 1] * s;
          const cr2 = binCoefficients.real[i + 2];
          const ci2 = binCoefficients.imag[i + 2] * s;
          const cr3 = binCoefficients.real[i + 3];
          const ci3 = binCoefficients.imag[i + 3] * s;

          const near0 = dftStart + i;
          const far0 = near0 + halfDftSize;
          const evenReal0 = real[near0];
          const or0 = real[far0];
          const evenImag0 = imag[near0];
          const oi0 = imag[far0];
          const oddReal0 = cr0 * or0 - ci0 * oi0;
          const oddImag0 = cr0 * oi0 + ci0 * or0;
          real[near0] = evenReal0 + oddReal0;
          real[far0] = evenReal0 - oddReal0;
          imag[near0] = evenImag0 + oddImag0;
          imag[far0] = evenImag0 - oddImag0;

          const near1 = dftStart + i + 1;
          const far1 = near1 + halfDftSize;
          const evenReal1 = real[near1];
          const or1 = real[far1];
          const evenImag1 = imag[near1];
          const oi1 = imag[far1];
          const oddReal1 = cr1 * or1 - ci1 * oi1;
          const oddImag1 = cr1 * oi1 + ci1 * or1;
          real[near1] = evenReal1 + oddReal1;
          real[far1] = evenReal1 - oddReal1;
          imag[near1] = evenImag1 + oddImag1;
          imag[far1] = evenImag1 - oddImag1;

          const near2 = dftStart + i + 2;
          const far2 = near2 + halfDftSize;
          const evenReal2 = real[near2];
          const or2 = real[far2];
          const evenImag2 = imag[near2];
          const oi2 = imag[far2];
          const oddReal2 = cr2 * or2 - ci2 * oi2;
          const oddImag2 = cr2 * oi2 + ci2 * or2;
          real[near2] = evenReal2 + oddReal2;
          real[far2] = evenReal2 - oddReal2;
          imag[near2] = evenImag2 + oddImag2;
          imag[far2] = evenImag2 - oddImag2;

          const near3 = dftStart + i + 3;
          const far3 = near3 + halfDftSize;
          const evenReal3 = real[near3];
          const or3 = real[far3];
          const evenImag3 = imag[near3];
          const oi3 = imag[far3];
          const oddReal3 = cr3 * or3 - ci3 * oi3;
          const oddImag3 = cr3 * oi3 + ci3 * or3;
          real[near3] = evenReal3 + oddReal3;
          real[far3] = evenReal3 - oddReal3;
          imag[near3] = evenImag3 + oddImag3;
          imag[far3] = evenImag3 - oddImag3;
        }
      }
    }
  }
}

/** Array of complex numbers. Real and imaginary parts are separate. */
type ComplexArray = { real: Float32Array; imag: Float32Array };

/** Builds a triangle of direct and reverse FFT coefficients for the given length. */
function makeFftCoefficients(length: number): ComplexArray[] {
  let numBits = getNumBits(length);
  let coefs: ComplexArray[] = [];

  for (let bin = 0, halfSize = 4; bin < numBits; ++bin, halfSize *= 2) {
    coefs.push({
      real: new Float32Array(halfSize),
      imag: new Float32Array(halfSize),
    });
    for (let i = 0; i < halfSize; ++i) {
      const fwdAngle = (-1 * Math.PI * i) / halfSize;
      coefs[bin].real[i] = Math.cos(fwdAngle);
      coefs[bin].imag[i] = Math.sin(fwdAngle);
    }
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
