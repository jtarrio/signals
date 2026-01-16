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

import { makeHilbertKernel } from "./coefficients.js";
import { decay, DelayFilter, FIRFilter, PilotDetector } from "./filters.js";
import { Float32Pool } from "./buffers.js";
import { atan2 } from "./math.js";

/** The sideband to demodulate. */
export enum Sideband {
  Upper,
  Lower,
}

/** A class to demodulate a USB or LSB signal. */
export class SSBDemodulator {
  /**
   * @param sideband The sideband to demodulate.
   * @param kernelLen The length of the Hilbert filter kernel to use.
   */
  constructor(sideband: Sideband, kernelLen: number) {
    let hilbert = makeHilbertKernel(kernelLen);
    this.filterHilbert = new FIRFilter(hilbert);
    this.filterDelay = new DelayFilter(this.filterHilbert.getDelay());
    this.hilbertMul = sideband == Sideband.Upper ? -1 : 1;
  }

  private filterHilbert: FIRFilter;
  private filterDelay: DelayFilter;
  private hilbertMul: number;

  /** Switches the demodulator's sideband on the fly. */
  setSideband(sideband: Sideband) {
    this.hilbertMul = sideband == Sideband.Upper ? -1 : 1;
  }

  /** Demodulates the given I/Q samples into the real output. */
  demodulate(I: Float32Array, Q: Float32Array, out: Float32Array) {
    this.filterDelay.inPlace(I);
    this.filterHilbert.inPlace(Q);
    for (let i = 0; i < out.length; ++i) {
      out[i] = (I[i] + Q[i] * this.hilbertMul) / 2;
    }
  }
}

/** A class to demodulate an AM signal. */
export class AMDemodulator {
  /**
   * @param sampleRate The signal's sample rate.
   */
  constructor(sampleRate: number) {
    this.alpha = decay(sampleRate, 0.5);
    this.carrierAmplitude = 0;
  }

  private alpha: number;
  private carrierAmplitude: number;

  /** Demodulates the given I/Q samples into the real output. */
  demodulate(I: Float32Array, Q: Float32Array, out: Float32Array) {
    const alpha = this.alpha;
    let carrierAmplitude = this.carrierAmplitude;
    for (let i = 0; i < out.length; ++i) {
      const vI = I[i];
      const vQ = Q[i];
      const power = vI * vI + vQ * vQ;
      const amplitude = Math.sqrt(power);
      carrierAmplitude += alpha * (amplitude - carrierAmplitude);
      out[i] = carrierAmplitude == 0 ? 0 : amplitude / carrierAmplitude - 1;
    }
    this.carrierAmplitude = carrierAmplitude;
  }
}

/** A class to demodulate an FM signal. */
export class FMDemodulator {
  /**
   * @param maxDeviation The maximum deviation for the signal, as a fraction of the sample rate.
   */
  constructor(maxDeviation: number) {
    this.mul = 1 / (2 * Math.PI * maxDeviation);
    this.lI = 0;
    this.lQ = 0;
  }

  private mul: number;
  private lI: number;
  private lQ: number;

  /** Changes the maximum deviation. */
  setMaxDeviation(maxDeviation: number) {
    this.mul = 1 / (2 * Math.PI * maxDeviation);
  }

  /** Demodulates the given I/Q samples into the real output. */
  demodulate(I: Float32Array, Q: Float32Array, out: Float32Array) {
    const mul = this.mul;
    let lI = this.lI;
    let lQ = this.lQ;
    for (let i = 0; i < I.length; ++i) {
      // s = s * conj(l)
      let real = lI * I[i] + lQ * Q[i];
      let imag = lI * Q[i] - I[i] * lQ;
      lI = I[i];
      lQ = Q[i];
      out[i] = atan2(imag, real) * mul;
    }
    this.lI = lI;
    this.lQ = lQ;
  }
}

/** A class to demodulate the stereo signal in a demodulated FM signal. */
export class StereoSeparator {
  /**
   * @param sampleRate The sample rate for the input signal.
   * @param pilotFreq The frequency of the pilot tone.
   */
  constructor(sampleRate: number, pilotFreq: number) {
    this.pool = new Float32Pool(4);
    this.detector = new PilotDetector(sampleRate, pilotFreq, 2);
  }

  private pool: Float32Pool;
  private detector: PilotDetector;

  /**
   * Locks on to the pilot tone and uses it to demodulate the stereo audio.
   * @param samples The original audio stream.
   * @returns An object with a key 'found' that tells whether a
   *     consistent stereo pilot tone was detected and a key 'diff'
   *     that contains the original stream demodulated with the
   *     reconstructed stereo carrier.
   */
  separate(samples: Float32Array): { found: boolean; diff: Float32Array } {
    let out = this.pool.get(samples.length);
    const pilot = this.detector.extract(samples);
    const I = pilot[0];
    const Q = pilot[1];
    for (let i = 0; i < samples.length; ++i) {
      // Multiply by 4 instead of 2 so 'out' has the same level as the input samples.
      out[i] = samples[i] * I[i] * Q[i] * 4;
    }

    return {
      found: this.detector.locked,
      diff: out,
    };
  }
}
