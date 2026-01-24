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

import { Float32Pool } from "./buffers.js";
import { makeLowPassKernel } from "./coefficients.js";
import { FFTFilter, FIRFilter } from "./filters.js";

/** Options for downsamplers. */
export type DownsamplerOptions = {
  /** Use a FFTFilter instead of a FIRFilter. */
  useFftFilter?: boolean;
};

/** A class to convert the input to a lower sample rate using a FIR filter. */
class FirDownsampler {
  /**
   * @param ratio The ratio of input/output sample rates.
   * @param kernel The coefficients for the low-pass filter.
   */
  constructor(
    private ratio: number,
    filter: FIRFilter,
  ) {
    this.filter = filter.clone();
    this.pool = new Float32Pool(2);
  }

  private filter: FIRFilter;
  private pool: Float32Pool;

  /**
   * Returns a downsampled version of the given samples.
   * @param samples The sample block to downsample.
   * @returns The downsampled block.
   */
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
    return this.filter.getDelay();
  }
}

/** A class to convert the input to a lower sample rate using a FFT filter. */
class FftDownsampler {
  /**
   * @param ratio The ratio of input/output sample rates.
   * @param kernel The coefficients for the low-pass filter.
   */
  constructor(
    private ratio: number,
    filter: FFTFilter,
  ) {
    this.filter = filter.clone();
    this.pool = new Float32Pool(4);
  }

  private filter: FFTFilter;
  private pool: Float32Pool;

  /**
   * Returns a downsampled version of the given samples.
   * @param samples The sample block to downsample.
   * @returns The downsampled block.
   */
  downsample(samples: Float32Array): Float32Array {
    const ratio = this.ratio;
    const len = Math.floor(samples.length / ratio);
    let input = this.pool.get(samples.length);
    input.set(samples);
    this.filter.inPlace(input);
    let output = this.pool.get(len);
    for (let i = 0; i < len; ++i) {
      output[i] = input[Math.floor(i * ratio)];
    }
    return output;
  }

  getDelay(): number {
    return this.filter.getDelay();
  }
}

function getDownsampler(
  inRate: number,
  outRate: number,
  filterSpec: number | Float32Array,
  options?: DownsamplerOptions,
): FirDownsampler | FftDownsampler {
  let ratio = inRate / outRate;
  let filter = filterSpec;
  if (typeof filter === "number")
    filter = makeLowPassKernel(inRate, outRate / 2, filter);
  if (options?.useFftFilter) {
    return new FftDownsampler(ratio, new FFTFilter(filter));
  }
  return new FirDownsampler(ratio, new FIRFilter(filter));
}

/** A class to convert a real input to a lower sample rate. */
export class RealDownsampler {
  /**
   * @param inRate The input sample rate.
   * @param outRate The output sample rate.
   * @param filterLen The size of the low-pass filter.
   * @param options Options for the downsampler.
   */
  constructor(
    inRate: number,
    outRate: number,
    filterLen: number,
    options?: DownsamplerOptions,
  );
  /**
   * @param inRate The input sample rate.
   * @param outRate The output sample rate.
   * @param kernel The kernel to apply to the signal before downsampling.
   * @param options Options for the downsampler.
   */
  constructor(
    inRate: number,
    outRate: number,
    kernel: Float32Array,
    options?: DownsamplerOptions,
  );
  constructor(
    inRate: number,
    outRate: number,
    filterSpec: number | Float32Array,
    options?: DownsamplerOptions,
  ) {
    this.downsampler = getDownsampler(inRate, outRate, filterSpec, options);
  }

  private downsampler: FirDownsampler | FftDownsampler;

  /**
   * @param input The signal in the original sample rate.
   * @returns The resampled signal.
   */
  downsample(input: Float32Array): Float32Array {
    return this.downsampler.downsample(input);
  }

  getDelay(): number {
    return this.downsampler.getDelay();
  }
}

/** A class to convert a complex input to a lower sample rate. */
export class ComplexDownsampler {
  /**
   * @param inRate The input sample rate.
   * @param outRate The output sample rate.
   * @param filterLen The size of the low-pass filter.
   * @param options Options for the downsampler.
   */
  constructor(
    inRate: number,
    outRate: number,
    filterLen: number,
    options?: DownsamplerOptions,
  );
  /**
   * @param inRate The input sample rate.
   * @param outRate The output sample rate.
   * @param kernel The kernel to apply to the signal before downsampling.
   * @param options Options for the downsampler.
   */
  constructor(
    inRate: number,
    outRate: number,
    kernel: Float32Array,
    options?: DownsamplerOptions,
  );
  constructor(
    inRate: number,
    outRate: number,
    filterSpec: number | Float32Array,
    options?: DownsamplerOptions,
  ) {
    this.downsamplerI = getDownsampler(inRate, outRate, filterSpec, options);
    this.downsamplerQ = getDownsampler(inRate, outRate, filterSpec, options);
  }

  private downsamplerI: FirDownsampler | FftDownsampler;
  private downsamplerQ: FirDownsampler | FftDownsampler;

  /**
   * @param I The signal's real component.
   * @param Q The signal's imaginary component.
   * @returns An array with the output's real and imaginary components.
   */
  downsample(I: Float32Array, Q: Float32Array): [Float32Array, Float32Array] {
    return [this.downsamplerI.downsample(I), this.downsamplerQ.downsample(Q)];
  }

  getDelay(): number {
    return this.downsamplerI.getDelay();
  }
}
