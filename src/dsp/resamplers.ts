// Copyright 2024 Jacobo Tarrio Barreiro. All rights reserved.
// Copyright 2013 Google Inc. All rights reserved.
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
import { Convolver, getConvolver } from "../wasm/convolver.js";
import { Float32Pool } from "./buffers.js";
import { makeLowPassKernel } from "./coefficients.js";
import { BaseWasmFirFilter, FIRFilter } from "./filters.js";

/** Interface for classes that convert real signals between sample rates. */
export interface RealResampler {
  resample(samples: Float32Array): Float32Array;
  getDelay(): number;
  clone(): RealResampler;
}

/** Interface for classes that convert I/Q signals between sample rates. */
export interface IqResampler {
  resample(I: Float32Array, Q: Float32Array): [Float32Array, Float32Array];
  getDelay(): number;
  clone(): IqResampler;
}

class PureRealDownsampler implements RealResampler {
  constructor(
    private ratio: number,
    kernel: Float32Array,
  ) {
    if (ratio != Math.floor(ratio))
      throw new RadioError(
        `Non-integer downsample ratio: ${ratio}`,
        RadioErrorType.DemodulationError,
      );
    this.filter = new DownsamplingFilter(kernel);
    this.pool = new Float32Pool(2);
    this.residual = 0;
  }

  private filter: DownsamplingFilter;
  private pool: Float32Pool;
  private residual: number;

  resample(samples: Float32Array): Float32Array {
    const ratio = this.ratio;
    const skip = (ratio - this.residual) % ratio;
    const outLen =
      Math.floor((this.residual + samples.length - 1) / ratio) -
      Math.floor((this.residual - 1) / ratio);
    let output = this.pool.get(outLen);
    output.set(this.filter.filter(samples, outLen, ratio, skip));
    this.residual = (this.residual + samples.length) % ratio;
    return output;
  }

  getDelay(): number {
    return this.filter.getDelay() / this.ratio;
  }

  clone(): PureRealDownsampler {
    let out = new PureRealDownsampler(this.ratio, new Float32Array(1));
    out.filter = this.filter.clone();
    return out;
  }
}

class PureRealUpsampler implements RealResampler {
  constructor(
    private ratio: number,
    kernel: Float32Array,
  ) {
    if (ratio != Math.floor(ratio))
      throw new RadioError(
        `Non-integer upsample ratio: ${ratio}`,
        RadioErrorType.DemodulationError,
      );
    this.filter = new UpsamplingFilter(kernel, ratio);
    this.pool = new Float32Pool(2);
  }

  private filter: UpsamplingFilter;
  private pool: Float32Pool;

  resample(samples: Float32Array): Float32Array {
    const ratio = this.ratio;
    const outLen = samples.length * ratio;
    let output = this.pool.get(outLen);
    output.set(this.filter.filter(samples));
    return output;
  }

  getDelay(): number {
    return this.filter.getDelay();
  }

  clone(): PureRealUpsampler {
    let out = new PureRealUpsampler(this.ratio, new Float32Array(this.ratio));
    out.filter = this.filter.clone();
    return out;
  }
}

class RealUpDownsampler implements RealResampler {
  constructor(
    private upRatio: number,
    private downRatio: number,
    kernel: Float32Array,
  ) {
    if (upRatio != Math.floor(upRatio))
      throw new RadioError(
        `Non-integer upsample ratio: ${upRatio}`,
        RadioErrorType.DemodulationError,
      );
    if (downRatio != Math.floor(downRatio))
      throw new RadioError(
        `Non-integer downsample ratio: ${downRatio}`,
        RadioErrorType.DemodulationError,
      );

    this.filter = new UpsamplingFilter(kernel, upRatio);
    this.pool = new Float32Pool(2);
    this.residual = 0;
  }

  private filter: UpsamplingFilter;
  private pool: Float32Pool;
  private residual: number;

  resample(samples: Float32Array): Float32Array {
    const upRatio = this.upRatio;
    const downRatio = this.downRatio;
    const skip = (downRatio - this.residual) % downRatio;
    const midLen = samples.length * upRatio;
    const outLen =
      Math.floor((this.residual + midLen - 1) / downRatio) -
      Math.floor((this.residual - 1) / downRatio);
    let output = this.pool.get(outLen);
    output.set(this.filter.filterWithStride(samples, outLen, downRatio, skip));
    this.residual = (this.residual + midLen) % downRatio;
    return output;
  }

  getDelay(): number {
    return this.filter.getDelay() / this.downRatio;
  }

  clone(): RealUpDownsampler {
    let out = new RealUpDownsampler(
      this.upRatio,
      this.downRatio,
      new Float32Array(this.upRatio),
    );
    out.filter = this.filter.clone();
    return out;
  }
}

class GenericIqResampler implements IqResampler {
  constructor(realResampler: RealResampler) {
    this.resampleI = realResampler.clone();
    this.resampleQ = realResampler.clone();
  }

  private resampleI: RealResampler;
  private resampleQ: RealResampler;

  resample(I: Float32Array, Q: Float32Array): [Float32Array, Float32Array] {
    return [this.resampleI.resample(I), this.resampleQ.resample(Q)];
  }

  getDelay(): number {
    return this.resampleI.getDelay();
  }

  clone(): IqResampler {
    return new GenericIqResampler(this.resampleI);
  }
}

/** Options for getRealResampler() and getIqResampler() */
export type ResamplerOptions = {
  /**
   * The low-pass cut-off frequency for the filter.
   * If unspecified, the lower of half the input or output sample rate is used.
   */
  lowPassFrequency?: number;
  /**
   * The number of effective output taps. This is the number of taps for a filter
   * that would produce a similar frequency response at the output sample rate.
   * If unspecified, 41 taps are used.
   */
  taps?: number;
  /**
   * A gain for the filter.
   * If unspecified, 1 is used.
   */
  gain?: number;
  /**
   * A FIR kernel to use for the filter.
   * If unspecified, a suitable kernel for the low pass frequency and number of pass is used.
   */
  kernel?: Float32Array;
  /**
   * The number of taps that you would have used in RealResampler/ComplexResampler to obtain
   * a similar frequency response.
   * Overrides outputTaps if specified.
   */
  legacyTaps?: number;
};

/** Returns a RealResampler that converts signals from the input rate to the output rate. */
export function getRealResampler(
  inRate: number,
  outRate: number,
  options?: ResamplerOptions,
): RealResampler {
  if (inRate > outRate && inRate % outRate == 0) {
    // Pure downsampler
    let downFactor = inRate / outRate;
    let corner = options?.lowPassFrequency || outRate / 2;
    let taps = options?.legacyTaps
      ? options?.legacyTaps
      : (options?.taps || 41) * downFactor;
    let gain = options?.gain;
    let kernel =
      options?.kernel || makeLowPassKernel(inRate, corner, taps, gain);
    return new PureRealDownsampler(inRate / outRate, kernel);
  }
  if (inRate < outRate && outRate % inRate == 0) {
    // Pure upsampler
    let upFactor = outRate / inRate;
    let corner = options?.lowPassFrequency || inRate / 2;
    let taps = options?.legacyTaps
      ? Math.round((options?.legacyTaps * outRate) / inRate)
      : options?.taps || 41;
    let gain = options?.gain;
    let kernel =
      options?.kernel || makeLowPassKernel(outRate, corner, taps, gain);
    return new PureRealUpsampler(upFactor, kernel);
  }
  // Resampler
  let gcd = greatestCommonDivisor(inRate, outRate);
  let upFactor = outRate / gcd;
  let downFactor = inRate / gcd;
  let interRate = (inRate * outRate) / gcd;
  let corner = options?.lowPassFrequency || Math.min(inRate, outRate) / 2;
  let taps = options?.legacyTaps
    ? Math.round((options?.legacyTaps * outRate) / gcd)
    : (options?.taps || 41) * downFactor;
  let gain = options?.gain;
  let kernel =
    options?.kernel || makeLowPassKernel(interRate, corner, taps, gain);
  return new RealUpDownsampler(upFactor, downFactor, kernel);
}

/** Returns an IqResampler that converts signals from the input rate to the output rate. */
export function getIqResampler(
  inRate: number,
  outRate: number,
  options?: ResamplerOptions,
): IqResampler {
  return new GenericIqResampler(getRealResampler(inRate, outRate, options));
}

/**
 * Computes an output sample rate that makes for the simplest rescaler.
 *
 * For example, to resample 1024000 to 336000 samples/sec,
 * the resampler has to upsample 21x and then downsample 64x.
 * However, with a tolerance of 50000 samples/sec, you could instead
 * resample to 384000 samples/sec, which only requires upsampling 3x and downsampling 8x.
 *
 * @param inRate The input sample rate.
 * @param outRate The desired output sample rate.
 * @param tolerance The variation that's allowed for the sample rate (over or under the outRate).
 * @returns The computed sample rate.
 */
export function getGoodResampleRate(
  inRate: number,
  outRate: number,
  tolerance: number,
): number {
  if (inRate == outRate) return inRate;

  let left = outRate - tolerance;
  let right = outRate + tolerance;

  if (left <= inRate && inRate <= right) return inRate;

  if (inRate > outRate) {
    for (let d = 2; ; ++d) {
      let best = -1;
      let bestDist = outRate;
      const minM = Math.ceil((left * d) / inRate);
      const maxM = Math.floor((right * d) / inRate);
      for (let m = minM; m <= maxM; ++m) {
        let target = (inRate * m) / d;
        if (Number.isInteger(target)) {
          let dist = Math.abs(target - outRate);
          if (dist < bestDist || best < 0) {
            best = target;
            bestDist = dist;
          }
        }
      }
      if (best > 0) return best;
    }
  }

  for (let m = 2; ; ++m) {
    let best = -1;
    let bestDist = outRate;
    const minD = Math.ceil((m * inRate) / right);
    const maxD = Math.floor((m * inRate) / left);
    for (let d = minD; d <= maxD; ++d) {
      let target = (inRate * m) / d;
      if (Number.isInteger(target)) {
        let dist = Math.abs(target - outRate);
        if (dist < bestDist || best < 0) {
          best = target;
          bestDist = dist;
        }
      }
    }
    if (best > 0) return best;
  }
}

function greatestCommonDivisor(a: number, b: number): number {
  if (a < b) {
    [a, b] = [b, a];
  }
  while (b != 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function splitKernel(
  kernel: Float32Array,
  ratio: number,
): { delay: number; coefs: Float32Array[] } {
  let delay = Math.floor(kernel.length / 2);
  if (kernel.length % ratio != 0) {
    const wantedLen = ratio * Math.ceil(kernel.length / ratio);
    const newKernel = new Float32Array(wantedLen);
    newKernel.subarray(wantedLen - kernel.length, wantedLen).set(kernel);
    kernel = newKernel;
  }
  const coefLen = kernel.length / ratio;
  let coefs = [];
  for (let i = 0; i < ratio; ++i) {
    const filterKernel = new Float32Array(coefLen);
    for (let j = 0; j < coefLen; ++j) {
      filterKernel[j] = kernel[(j + 1) * ratio - i - 1] * ratio;
    }
    coefs[i] = filterKernel;
  }
  return { delay, coefs };
}

/** A specialized filter for downsampling. */
class DownsamplingFilter extends BaseWasmFirFilter {
  constructor(private coefs: Float32Array) {
    super(coefs.length - 1, Math.floor(coefs.length / 2));
    this.convolver.setCoefs(coefs);
  }

  setCoefficients(coefs: Float32Array) {
    this.convolver.setCoefs(coefs);
    const oldSamples = this.curSamples;
    this.coefs = coefs;
    this.offset = this.coefs.length - 1;
    this.delay = Math.floor(this.coefs.length / 2);
    this.curSamples = this.pool.get(this.offset);
    this.loadSamples(oldSamples);
  }

  clone(): DownsamplingFilter {
    return new DownsamplingFilter(this.coefs);
  }

  getDelay(): number {
    return this.delay;
  }

  filter(
    samples: Float32Array,
    num: number,
    stride: number,
    offset: number,
  ): Float32Array {
    this.loadSamples(samples);
    return this.convolver.convolveWithStride(
      this.curSamples,
      num,
      stride,
      offset,
    );
  }
}

/** A specialized filter for upsampling and resampling. */
class UpsamplingFilter extends BaseWasmFirFilter {
  constructor(
    private kernel: Float32Array,
    private ratio: number,
  ) {
    const { delay, coefs } = splitKernel(kernel, ratio);
    super(coefs[0].length - 1, delay);
    this.convolver.setCoefArray(coefs);
  }

  clone(): UpsamplingFilter {
    return new UpsamplingFilter(this.kernel, this.ratio);
  }

  filter(samples: Float32Array): Float32Array {
    this.loadSamples(samples);
    return this.convolver.convolveExpanding(
      this.curSamples,
      samples.length,
      this.ratio,
    );
  }

  filterWithStride(
    samples: Float32Array,
    num: number,
    stride: number,
    offset: number,
  ): Float32Array {
    this.loadSamples(samples);
    return this.convolver.convolveExpandingWithStride(
      this.curSamples,
      num,
      stride,
      offset,
    );
  }
}
