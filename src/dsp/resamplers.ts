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
    this.delay = new FIRFilter(kernel).getDelay();
    if (kernel.length % ratio != 0) {
      const wantedLen = ratio * Math.ceil(kernel.length / ratio);
      const newKernel = new Float32Array(wantedLen);
      newKernel.subarray(wantedLen - kernel.length, wantedLen).set(kernel);
      kernel = newKernel;
    }
    this.filters = [];
    for (let i = 0; i < ratio; ++i) {
      const filterKernel = new Float32Array(kernel.length / ratio);
      for (let j = 0; j < filterKernel.length; ++j) {
        filterKernel[j] = kernel[(j + 1) * ratio - i - 1] * ratio;
      }
      this.filters[i] = new FIRFilter(filterKernel);
    }
    this.pool = new Float32Pool(2);
  }

  private delay: number;
  private filters: FIRFilter[];
  private pool: Float32Pool;

  resample(samples: Float32Array): Float32Array {
    const ratio = this.ratio;
    const outLen = samples.length * ratio;
    let output = this.pool.get(outLen);
    for (let j = 0; j < ratio; ++j) {
      this.filters[j].loadSamples(samples);
    }
    for (let i = 0; i < samples.length; ++i) {
      for (let j = 0; j < ratio; ++j) {
        output[i * ratio + j] = this.filters[j].get(i);
      }
    }
    return output;
  }

  getDelay(): number {
    return this.delay;
  }

  clone(): PureRealUpsampler {
    let out = new PureRealUpsampler(1, new Float32Array(1));
    out.ratio = this.ratio;
    out.filters = this.filters.map((f) => f.clone());
    out.delay = this.delay;
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

    this.delay = new FIRFilter(kernel).getDelay();
    if (kernel.length % upRatio != 0) {
      const wantedLen = upRatio * Math.ceil(kernel.length / upRatio);
      const newKernel = new Float32Array(wantedLen);
      newKernel.subarray(wantedLen - kernel.length, wantedLen).set(kernel);
      kernel = newKernel;
    }
    this.filters = [];
    for (let i = 0; i < upRatio; ++i) {
      const filterKernel = new Float32Array(kernel.length / upRatio);
      for (let j = 0; j < filterKernel.length; ++j) {
        filterKernel[j] = kernel[(j + 1) * upRatio - i - 1] * upRatio;
      }
      this.filters[i] = new FIRFilter(filterKernel);
    }
    this.pool = new Float32Pool(4);
    this.residual = 0;
  }

  private delay: number;
  private filters: FIRFilter[];
  private pool: Float32Pool;
  private residual: number;

  resample(samples: Float32Array): Float32Array {
    const upRatio = this.upRatio;
    const midLen = samples.length * upRatio;
    for (let j = 0; j < upRatio; ++j) {
      this.filters[j].loadSamples(samples);
    }
    const downRatio = this.downRatio;
    const skip = (downRatio - this.residual) % downRatio;
    const outLen =
      Math.floor((this.residual + midLen - 1) / downRatio) -
      Math.floor((this.residual - 1) / downRatio);
    let output = this.pool.get(outLen);
    for (let k = 0; k < outLen; ++k) {
      const ij = skip + k * downRatio;
      const i = Math.floor(ij / upRatio);
      const j = ij % upRatio;
      output[k] = this.filters[j].get(i);
    }
    this.residual = (this.residual + midLen) % downRatio;
    return output;
  }

  getDelay(): number {
    return this.delay / this.downRatio;
  }

  clone(): RealUpDownsampler {
    let out = new RealUpDownsampler(
      this.upRatio,
      this.downRatio,
      new Float32Array(1),
    );
    out.delay = this.delay;
    out.filters = this.filters.map((f) => f.clone());
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
   * The number of taps for the filter.
   * If unspecified, 101 taps are used.
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
};

/** Returns a RealResampler that converts signals from the input rate to the output rate. */
export function getRealResampler(
  inRate: number,
  outRate: number,
  options?: ResamplerOptions,
): RealResampler {
  if (inRate > outRate && inRate % outRate == 0) {
    // Pure downsampler
    let corner = options?.lowPassFrequency || outRate / 2;
    let taps = options?.taps || 101;
    let gain = options?.gain;
    let kernel =
      options?.kernel || makeLowPassKernel(inRate, corner, taps, gain);
    return new PureRealDownsampler(inRate / outRate, kernel);
  }
  if (inRate < outRate && outRate % inRate == 0) {
    // Pure upsampler
    let corner = options?.lowPassFrequency || inRate / 2;
    let taps = options?.taps || 101;
    let gain = options?.gain;
    let kernel =
      options?.kernel || makeLowPassKernel(outRate, corner, taps, gain);
    return new PureRealUpsampler(outRate / inRate, kernel);
  }
  // Resampler
  let gcd = greatestCommonDivisor(inRate, outRate);
  let corner = options?.lowPassFrequency || Math.min(inRate, outRate) / 2;
  let taps = options?.taps || 101;
  let gain = options?.gain;
  let kernel =
    options?.kernel ||
    makeLowPassKernel((inRate * outRate) / gcd, corner, taps, gain);
  return new RealUpDownsampler(outRate / gcd, inRate / gcd, kernel);
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
    let options =
      typeof filterSpec === "number"
        ? { taps: filterSpec }
        : { kernel: filterSpec };
    this.resampler = getRealResampler(inRate, outRate, options);
  }

  private resampler: RealResampler;

  /**
   * Returns a downsampled version of the given samples.
   * @param samples The sample block to downsample.
   * @returns The downsampled block.
   */
  downsample(samples: Float32Array): Float32Array {
    return this.resampler.resample(samples);
  }

  getDelay(): number {
    return this.resampler.getDelay();
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
    let options =
      typeof filterSpec === "number"
        ? { taps: filterSpec }
        : { kernel: filterSpec };
    this.resampler = getIqResampler(inRate, outRate, options);
  }

  private resampler: IqResampler;

  /**
   * @param I The signal's real component.
   * @param Q The signal's imaginary component.
   * @returns An array with the output's real and imaginary components.
   */
  downsample(I: Float32Array, Q: Float32Array): [Float32Array, Float32Array] {
    return this.resampler.resample(I, Q);
  }

  getDelay(): number {
    return this.resampler.getDelay();
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
