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
import { Float32Pool } from "./buffers.js";
import { makeLowPassKernel } from "./coefficients.js";
import { FIRFilter } from "./filters.js";

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
    this.filter = new FIRFilter(kernel);
    this.pool = new Float32Pool(2);
    this.residual = 0;
  }

  private filter: FIRFilter;
  private pool: Float32Pool;
  private residual: number;

  resample(samples: Float32Array): Float32Array {
    const ratio = this.ratio;
    const skip = (ratio - this.residual) % ratio;
    const outLen =
      Math.floor((this.residual + samples.length - 1) / ratio) -
      Math.floor((this.residual - 1) / ratio);
    let output = this.pool.get(outLen);
    this.filter.loadSamples(samples);
    for (let i = 0; i < outLen; ++i) {
      output[i] = this.filter.get(skip + i * ratio);
    }
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
    this.filter = new UpsamplingPolyfilter(kernel, ratio);
    this.pool = new Float32Pool(2);
  }

  private filter: UpsamplingPolyfilter;
  private pool: Float32Pool;

  resample(samples: Float32Array): Float32Array {
    const ratio = this.ratio;
    const outLen = samples.length * ratio;
    let output = this.pool.get(outLen);
    this.filter.loadSamples(samples);
    for (let i = 0; i < samples.length; ++i) {
      this.filter.getAll(i, output, i * ratio);
    }
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

    this.filter = new ResamplingPolyfilter(kernel, upRatio);
    this.pool = new Float32Pool(4);
    this.residual = 0;
    this.di = Math.floor(downRatio / upRatio);
    this.dj = downRatio % upRatio;
  }

  private filter: ResamplingPolyfilter;
  private pool: Float32Pool;
  private residual: number;
  private di: number;
  private dj: number;

  resample(samples: Float32Array): Float32Array {
    const di = this.di;
    const dj = this.dj;
    const upRatio = this.upRatio;
    const midLen = samples.length * upRatio;
    const downRatio = this.downRatio;
    const outLen =
      Math.floor((this.residual + midLen - 1) / downRatio) -
      Math.floor((this.residual - 1) / downRatio);
    const filter = this.filter;
    const skip = (this.downRatio - this.residual) % downRatio;
    let i = Math.floor(skip / upRatio);
    let j = skip % upRatio;
    let output = this.pool.get(outLen);
    this.filter.loadSamples(samples);
    for (let k = 0; k < outLen; ++k) {
      output[k] = filter.get(j, i);
      j += dj;
      i += di;
      if (j >= upRatio) {
        j -= upRatio;
        ++i;
      }
    }
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
 * A class to convert the input to a lower sample rate.
 * @deprecated Use getRealResampler() instead.
 */
export class RealDownsampler {
  constructor(
    private inRate: number,
    private outRate: number,
    filterSpec: number | Float32Array,
  ) {
    this.ratio = inRate / outRate;
    let kernel =
      typeof filterSpec === "number"
        ? makeLowPassKernel(inRate, outRate / 2, filterSpec)
        : filterSpec;
    this.filter = new FIRFilter(kernel);
    this.pool = new Float32Pool(2);
  }

  private ratio: number;
  private filter: FIRFilter;
  private pool: Float32Pool;

  downsample(samples: Float32Array): Float32Array {
    const ratio = this.ratio;
    const len = Math.floor(samples.length / ratio);
    let output = this.pool.get(len);
    this.filter.loadSamples(samples);
    for (let i = 0; i < len; ++i) {
      output[i] = this.filter.get(Math.floor(i * ratio));
    }
    return output;
  }

  getDelay(): number {
    return this.filter.getDelay() / this.ratio;
  }

  clone(): RealDownsampler {
    let out = new RealDownsampler(this.inRate, this.outRate, 1);
    out.filter = this.filter.clone();
    return out;
  }
}

/**
 * A class to convert a complex input to a lower sample rate.
 * @deprecated Use getIqResampler() instead.
 */
export class ComplexDownsampler {
  /**
   * @param inRate The input sample rate.
   * @param outRate The output sample rate.
   * @param filterSpec The size or kernel of the low-pass filter to apply to the signal before downsampling.
   */
  constructor(
    inRate: number,
    outRate: number,
    filterSpec: number | Float32Array,
  ) {
    this.downI = new RealDownsampler(inRate, outRate, filterSpec);
    this.downQ = this.downI.clone();
  }

  private downI: RealDownsampler;
  private downQ: RealDownsampler;

  /**
   * @param I The signal's real component.
   * @param Q The signal's imaginary component.
   * @returns An array with the output's real and imaginary components.
   */
  downsample(I: Float32Array, Q: Float32Array): [Float32Array, Float32Array] {
    return [this.downI.downsample(I), this.downQ.downsample(Q)];
  }

  getDelay(): number {
    return this.downI.getDelay();
  }
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

class BasePolyfilter {
  constructor(
    protected offset: number,
    protected delay: number,
  ) {
    this.pool = new Float32Pool(2, 2 * this.offset);
    this.curSamples = this.pool.get(this.offset);
  }

  protected pool: Float32Pool;
  protected curSamples: Float32Array;

  getDelay(): number {
    return this.delay;
  }

  /**
   * Loads a new block of samples to filter.
   * @param samples The samples to load.
   */
  loadSamples(samples: Float32Array) {
    const len = samples.length + this.offset;
    if (this.curSamples.length != len) {
      let newSamples = this.pool.get(len);
      newSamples.set(
        this.curSamples.subarray(this.curSamples.length - this.offset),
      );
      this.curSamples = newSamples;
    } else {
      this.curSamples.copyWithin(0, samples.length);
    }
    this.curSamples.set(samples, this.offset);
  }
}

/** A polyphase filter for upsampling. */
class UpsamplingPolyfilter extends BasePolyfilter {
  constructor(kernel: Float32Array, ratio: number) {
    const { delay, coefs } = splitKernel(kernel, ratio);
    super(coefs[0].length - 1, delay);
    this.ratio = ratio;
    // Change coefs[phase][i] to this.coefs[i * ratio + phase]
    this.coefs = new Float32Array(ratio * coefs[0].length);
    for (let i = 0; i < coefs[0].length; ++i) {
      for (let phase = 0; phase < ratio; ++phase) {
        this.coefs[i * ratio + phase] = coefs[phase][i];
      }
    }
  }

  private ratio: number;
  private coefs: Float32Array;

  clone(): UpsamplingPolyfilter {
    let out = new UpsamplingPolyfilter(
      new Float32Array(this.ratio),
      this.ratio,
    );
    out.delay = this.delay;
    out.coefs = this.coefs;
    out.offset = this.offset;
    out.pool = new Float32Pool(2, 2 * this.offset);
    out.curSamples = out.pool.get(this.offset);
    return out;
  }

  getAll(index: number, output: Float32Array, outOffset: number) {
    const allCoefs = this.coefs;
    const len = allCoefs.length;
    const samples = this.curSamples;
    const ratio = this.ratio;
    const ratio4 = ratio - 3;

    output.fill(0, outOffset, outOffset + ratio);
    let si = index;
    let pi = 0;
    while (pi < len) {
      const s = samples[si++];
      let phase = 0;
      while (phase < ratio4) {
        output[outOffset + phase++] += allCoefs[pi++] * s;
        output[outOffset + phase++] += allCoefs[pi++] * s;
        output[outOffset + phase++] += allCoefs[pi++] * s;
        output[outOffset + phase++] += allCoefs[pi++] * s;
      }
      if (phase < ratio - 1) {
        output[outOffset + phase++] += allCoefs[pi++] * s;
        output[outOffset + phase++] += allCoefs[pi++] * s;
      }
      if (phase < ratio) {
        output[outOffset + phase++] += allCoefs[pi++] * s;
      }
    }
  }
}

class ResamplingPolyfilter extends BasePolyfilter {
  constructor(kernel: Float32Array, ratio: number) {
    const { delay, coefs } = splitKernel(kernel, ratio);
    super(coefs[0].length - 1, delay);
    this.ratio = ratio;
    this.coefs = coefs;
  }

  private ratio: number;
  private coefs: Float32Array[];

  clone(): ResamplingPolyfilter {
    let out = new ResamplingPolyfilter(
      new Float32Array(this.ratio),
      this.ratio,
    );
    out.delay = this.delay;
    out.coefs = this.coefs;
    out.offset = this.offset;
    out.pool = new Float32Pool(2, 2 * this.offset);
    out.curSamples = out.pool.get(this.offset);
    return out;
  }

  /**
   * Returns a filtered sample.
   * @param phase The polyphase index.
   * @param index The index of the sample to return, corresponding
   *     to the same index in the latest sample block loaded via loadSamples().
   */
  get(phase: number, index: number): number {
    const coefs = this.coefs[phase];
    const samples = this.curSamples;
    let len = coefs.length;
    let i = 0;
    let out = 0;
    let len4 = len - 3;
    while (i < len4) {
      out +=
        coefs[i++] * samples[index++] +
        coefs[i++] * samples[index++] +
        coefs[i++] * samples[index++] +
        coefs[i++] * samples[index++];
    }
    if (i < len - 1) {
      out += coefs[i++] * samples[index++] + coefs[i++] * samples[index++];
    }
    if (i < len) {
      out += coefs[i++] * samples[index++];
    }
    return out;
  }
}
