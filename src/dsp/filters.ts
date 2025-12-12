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

import { atan2 } from "./math.js";

export interface Filter {
  /** Returns a newly initialized clone of this filter. */
  clone(): Filter;
  /** Returns this filter's delay, in samples. */
  getDelay(): number;
  /** Applies the filter to the input samples, in place. */
  inPlace(samples: Float32Array): void;
}

/** A class to apply a FIR filter to a sequence of samples. */
export class FIRFilter implements Filter {
  /** @param coefs The coefficients of the filter to apply. */
  constructor(private coefs: Float32Array) {
    this.offset = this.coefs.length - 1;
    this.center = Math.floor(this.coefs.length / 2);
    this.curSamples = new Float32Array(this.offset);
  }

  private offset: number;
  private center: number;
  private curSamples: Float32Array;

  setCoefficients(coefs: Float32Array) {
    const oldSamples = this.curSamples;
    this.coefs = coefs;
    this.offset = this.coefs.length - 1;
    this.center = Math.floor(this.coefs.length / 2);
    this.curSamples = new Float32Array(this.offset);
    this.loadSamples(oldSamples);
  }

  clone(): FIRFilter {
    return new FIRFilter(this.coefs);
  }

  getDelay(): number {
    return this.center;
  }

  inPlace(samples: Float32Array) {
    this.loadSamples(samples);
    for (let i = 0; i < samples.length; ++i) {
      samples[i] = this.get(i);
    }
  }

  delayInPlace(samples: Float32Array) {
    this.loadSamples(samples);
    for (let i = 0; i < samples.length; ++i) {
      samples[i] = this.getDelayed(i);
    }
  }

  /**
   * Loads a new block of samples to filter.
   * @param samples The samples to load.
   */
  loadSamples(samples: Float32Array) {
    const len = samples.length + this.offset;
    if (this.curSamples.length != len) {
      let newSamples = new Float32Array(len);
      newSamples.set(
        this.curSamples.subarray(this.curSamples.length - this.offset)
      );
      this.curSamples = newSamples;
    } else {
      this.curSamples.copyWithin(0, samples.length);
    }
    this.curSamples.set(samples, this.offset);
  }

  /**
   * Returns a filtered sample.
   * Be very careful when you modify this function. About 85% of the total execution
   * time is spent here, so performance is critical.
   * @param index The index of the sample to return, corresponding
   *     to the same index in the latest sample block loaded via loadSamples().
   */
  get(index: number) {
    let i = 0;
    let out = 0;
    let len = this.coefs.length;
    let len4 = 4 * Math.floor(len / 4);
    while (i < len4) {
      out +=
        this.coefs[i++] * this.curSamples[index++] +
        this.coefs[i++] * this.curSamples[index++] +
        this.coefs[i++] * this.curSamples[index++] +
        this.coefs[i++] * this.curSamples[index++];
    }
    let len2 = 2 * Math.floor(len / 2);
    while (i < len2) {
      out +=
        this.coefs[i++] * this.curSamples[index++] +
        this.coefs[i++] * this.curSamples[index++];
    }
    while (i < len) {
      out += this.coefs[i++] * this.curSamples[index++];
    }
    return out;
  }

  /**
   * Returns a delayed sample.
   * @param index The index of the relative sample to return.
   */
  getDelayed(index: number) {
    return this.curSamples[index + this.center];
  }
}

/** Automatic gain control for audio signals. */
export class AGC implements Filter {
  constructor(
    private sampleRate: number,
    timeConstantSeconds: number,
    maxGain?: number
  ) {
    this.dcBlocker = new DcBlocker(sampleRate);
    this.alpha = decay(sampleRate, timeConstantSeconds);
    this.counter = 0;
    this.maxPower = 0;
    this.maxGain = maxGain || 100;
  }

  private dcBlocker: DcBlocker;
  private alpha: number;
  private counter: number;
  private maxPower: number;
  private maxGain: number;

  clone(): AGC {
    let copy = new AGC(this.sampleRate, 1, this.maxGain);
    copy.alpha = this.alpha;
    return copy;
  }

  getDelay(): number {
    return 0;
  }

  inPlace(samples: Float32Array) {
    const alpha = this.alpha;
    let maxPower = this.maxPower;
    let counter = this.counter;
    let gain;
    this.dcBlocker.inPlace(samples);
    for (let i = 0; i < samples.length; ++i) {
      const v = samples[i];
      const power = v * v;
      if (power > 0.9 * maxPower) {
        counter = this.sampleRate;
        if (power > maxPower) {
          maxPower = power;
        }
      } else if (counter > 0) {
        --counter;
      } else {
        maxPower -= alpha * maxPower;
      }
      gain = Math.min(this.maxGain, 1 / Math.sqrt(maxPower));
      samples[i] *= gain;
    }
    this.maxPower = maxPower;
    this.counter = counter;
  }
}

/** A filter that blocks DC signals. */
export class DcBlocker implements Filter {
  constructor(sampleRate: number) {
    this.alpha = decay(sampleRate, 0.5);
    this.dc = 0;
  }

  private alpha: number;
  private dc: number;

  clone(): DcBlocker {
    let copy = new DcBlocker(1000);
    copy.alpha = this.alpha;
    copy.dc = this.dc;
    return copy;
  }

  getDelay(): number {
    return 0;
  }

  inPlace(samples: Float32Array) {
    const alpha = this.alpha;
    let dc = this.dc;
    for (let i = 0; i < samples.length; ++i) {
      dc += alpha * (samples[i] - dc);
      samples[i] -= dc;
    }
    this.dc = dc;
  }
}

/**
 * Returns the decay value to use in a single-pole low-pass or high-pass IIR filter
 * with the given time constant.
 * @param sampleRate The signal's sample rate.
 * @param timeConstant The time constant in seconds
 */
export function decay(sampleRate: number, timeConstant: number): number {
  return 1 - Math.exp(-1 / (sampleRate * timeConstant));
}

/* Returns the time constant corresponding to a -3dB frequency. */
export function frequencyToTimeConstant(freq: number) {
  return 1 / (2 * Math.PI * freq);
}

export interface IIRFilter extends Filter {
  /** Returns a newly initialized clone of this filter. */
  clone(): IIRFilter;

  /** Filters an individual sample. */
  add(sample: number): number;

  /** Returns the value currently held by the filter. */
  get value(): number;

  /** Returns the phase shift at the given frequency. */
  phaseShift(freq: number): number;
}

/** IIR filter with two 'b' coefficients and one 'a' coefficient. */
class IIRFilter21 implements IIRFilter {
  constructor(
    private sampleRate: number,
    private b0: number,
    private b1: number,
    private a1: number
  ) {
    this.prev = 0;
    this.val = 0;
  }

  private prev: number;
  private val: number;

  /** Returns a copy of this filter. */
  clone(): IIRFilter {
    return new IIRFilter21(this.sampleRate, this.b0, this.b1, this.a1);
  }

  getDelay(): number {
    return 0;
  }

  /**
   * Filters the given samples in place.
   * @param samples The samples to filter.
   */
  inPlace(samples: Float32Array) {
    let prev = this.prev;
    let val = this.val;
    for (let i = 0; i < samples.length; ++i) {
      val = this.b0 * samples[i] + this.b1 * prev + this.a1 * val;
      prev = samples[i];
      samples[i] = val;
    }
    this.prev = prev;
    this.val = val;
  }

  /** Filters an individual sample. */
  add(sample: number): number {
    this.val = this.b0 * sample + this.b1 * this.prev + this.a1 * this.val;
    this.prev = sample;
    return this.val;
  }

  /** Returns the value currently held by the filter. */
  get value() {
    return this.val;
  }

  /** Returns the phase shift at the given angular frequency. */
  phaseShift(freq: number): number {
    const w = (2 * Math.PI * freq) / this.sampleRate;
    const real =
      Math.cos(w) * (this.b1 - this.b0 * this.a1) + this.b0 - this.b1 * this.a1;
    const imag = Math.sin(w) * (this.b1 + this.b0 * this.a1);
    return atan2(imag, real);
  }
}

/** A FM de-emphasis filter. */
export class Deemphasis extends IIRFilter21 {
  /**
   * @param sampleRate The signal's sample rate.
   * @param timeConstant The filter's time constant, in seconds.
   */
  constructor(sampleRate: number, timeConstant: number) {
    const wd = 1 / (timeConstant * sampleRate);
    const wa = 2 * sampleRate * Math.tan(wd / 2);
    const tau = 1 / wa;
    let a = 1 + 2 * tau * sampleRate;
    let b = 1 - 2 * tau * sampleRate;

    super(sampleRate, 1 / a, 1 / a, -b / a);
  }
}

/** A FM pre-emphasis filter. */
export class Preemphasis extends IIRFilter21 {
  /**
   * @param sampleRate The signal's sample rate.
   * @param timeConstant The filter's time constant, in seconds.
   */
  constructor(sampleRate: number, timeConstant: number) {
    const wdl = 1 / (timeConstant * sampleRate);
    const wdh = Math.PI * 0.9;
    const wal = Math.tan(wdl / 2);
    const wah = Math.tan(wdh / 2);
    const a = wal + 1;
    const b = wal - 1;
    const c = wah + 1;
    const d = wah - 1;
    const zg = wal / wah;
    super(sampleRate, a / (c * zg), b / (c * zg), -d / c);
  }
}

/** A single-pole IIR low-pass filter. */
export class IIRLowPass extends Deemphasis {
  /**
   * @param sampleRate The signal's sample rate.
   * @param freq The filter's corner frequency.
   */
  constructor(sampleRate: number, freq: number) {
    super(sampleRate, frequencyToTimeConstant(freq));
  }
}

class IIRFilterChain implements IIRFilter {
  constructor(private filters: IIRFilter[]) {}

  /** Returns a copy of this filter. */
  clone(): IIRFilter {
    return new IIRFilterChain(this.filters.map((f) => f.clone()));
  }

  getDelay(): number {
    return 0;
  }

  /**
   * Filters the given samples in place.
   * @param samples The samples to filter.
   */
  inPlace(samples: Float32Array) {
    for (let f of this.filters) {
      f.inPlace(samples);
    }
  }

  /** Filters an individual sample. */
  add(sample: number): number {
    for (let f of this.filters) {
      sample = f.add(sample);
    }
    return sample;
  }

  /** Returns the value currently held by the filter. */
  get value() {
    return this.filters[this.filters.length - 1].value;
  }

  /** Returns the phase shift at the given frequency. */
  phaseShift(freq: number): number {
    let lag = 0;
    for (let f of this.filters) {
      lag += f.phaseShift(freq);
    }
    return ((lag + Math.PI) % (2 * Math.PI)) - Math.PI;
  }
}

/** A chain of single-pole IIR low-pass filters. */
export class IIRLowPassChain extends IIRFilterChain {
  /**
   * @param count Number of filters in the chain.
   * @param sampleRate The signal's sample rate.
   * @param freq The corner frequency for the whole chain.
   */
  constructor(count: number, sampleRate: number, freq: number) {
    const cf = freq / Math.sqrt(Math.pow(2, 1 / count) - 1);
    let filters = Array.from({ length: count }).map(
      (_) => new IIRLowPass(sampleRate, cf)
    );
    super(filters);
  }
}

/**
 * Shifts IQ samples by a given frequency.
 */
export class FrequencyShifter {
  constructor(private sampleRate: number) {
    this.cosine = 1;
    this.sine = 0;
  }

  private cosine: number;
  private sine: number;

  inPlace(I: Float32Array, Q: Float32Array, freq: number) {
    let cosine = this.cosine;
    let sine = this.sine;
    const deltaCos = Math.cos((2 * Math.PI * freq) / this.sampleRate);
    const deltaSin = Math.sin((2 * Math.PI * freq) / this.sampleRate);
    for (let i = 0; i < I.length; ++i) {
      const newI = I[i] * cosine - Q[i] * sine;
      Q[i] = I[i] * sine + Q[i] * cosine;
      I[i] = newI;
      const newSine = cosine * deltaSin + sine * deltaCos;
      cosine = cosine * deltaCos - sine * deltaSin;
      sine = newSine;
    }
    this.cosine = cosine;
    this.sine = sine;
  }
}

/** A phase-locked loop that can detect a signal with a given frequency. */
export class PLL {
  /**
   * @param sampleRate The sample rate for the input signal.
   * @param freq The frequency of the signal to detect, in Hz.
   * @param tolerance The frequency tolerance for the signal, in Hz.
   */
  constructor(private sampleRate: number, freq: number, tolerance: number) {
    this.phase = 0;
    this.speed = (2 * Math.PI * freq) / sampleRate;
    this.maxSpeedCorr = (2 * Math.PI * tolerance) / sampleRate;
    this.speedCorrection = 0;
    this.phaseCorrection = 0;
    this.biFlt = new IIRLowPassChain(4, sampleRate, tolerance);
    this.bqFlt = new IIRLowPassChain(4, sampleRate, tolerance);
    this.siFlt = new IIRLowPassChain(4, sampleRate, 7);
    this.sqFlt = new IIRLowPassChain(4, sampleRate, 7);
    this.piFlt = new IIRLowPassChain(4, sampleRate, 250);
    this.pqFlt = new IIRLowPassChain(4, sampleRate, 250);
    this.lbI = 0;
    this.lbQ = 0;
    this.iMagFlt = new IIRLowPass(sampleRate, 7);
    this.bMagFlt = new IIRLowPass(sampleRate, 7);
    this.cos = 1;
    this.sin = 0;
    this.locked = true;
  }

  private phase: number;
  private speed: number;
  private maxSpeedCorr: number;
  private speedCorrection: number;
  private phaseCorrection: number;
  private biFlt: IIRFilter;
  private bqFlt: IIRFilter;
  private siFlt: IIRFilter;
  private sqFlt: IIRFilter;
  private piFlt: IIRFilter;
  private pqFlt: IIRFilter;
  private lbI: number;
  private lbQ: number;
  private iMagFlt: IIRFilter;
  private bMagFlt: IIRFilter;
  public cos: number;
  public sin: number;
  public locked: boolean;

  add(sample: number): void {
    let phase = this.phase;
    // Generate outputs with last computed parameters
    this.cos = Math.cos(phase);
    this.sin = Math.sin(phase);

    // Compute I+jQ, the difference between the input and our internal oscillator
    this.lbI = this.biFlt.add(Math.cos(-phase) * sample);
    this.lbQ = this.bqFlt.add(Math.sin(-phase) * sample);
    this.phase += this.speed;

    this.add = this.addRemaining;
  }

  addRemaining(sample: number) {
    let phase = this.phase;

    // Generate outputs with last computed parameters
    let angle = phase + this.speedCorrection + this.phaseCorrection;
    this.cos = Math.cos(angle);
    this.sin = Math.sin(angle);

    // Compute (bI, bQ), the beat (difference) between the input and our reference oscillator
    const rawI = Math.cos(-phase) * sample;
    const rawQ = Math.sin(-phase) * sample;
    const bI = this.biFlt.add(rawI);
    const bQ = this.bqFlt.add(rawQ);
    this.phase = this.phase + this.speed;

    // The beat is going to lag or advance wrt the input because of the input filter chain

    // Compute (sI, sQ), the average phase speed of (bI, bQ). That's the difference in frequency.
    // rs = b * conj(lb)
    const rsI = this.lbI * bI + this.lbQ * bQ;
    const rsQ = this.lbI * bQ - bI * this.lbQ;
    const sI = this.siFlt.add(rsI);
    const sQ = this.sqFlt.add(rsQ);
    this.lbI = bI;
    this.lbQ = bQ;
    const beatSpeed = atan2(sQ, sI);
    const speedCorr = Math.max(
      -this.maxSpeedCorr,
      Math.min(beatSpeed, this.maxSpeedCorr)
    );
    this.speedCorrection += speedCorr;

    // Compute (dI, dQ), the difference between the beat (bI, bQ) and our speed correction (cI, cQ)
    // That's the difference in phase.
    const cI = Math.cos(this.speedCorrection);
    const cQ = Math.sin(this.speedCorrection);
    // rd = b * conj(c)
    const rdI = bI * cI + bQ * cQ;
    const rdQ = cI * bQ - bI * cQ;
    const dI = this.piFlt.add(rdI);
    const dQ = this.pqFlt.add(rdQ);
    // But the biFlt/bqFlt are going to shift the phase of (bI, bQ), so compensate for that.
    const freqCorrectionHz = (speedCorr * this.sampleRate) / (2 * Math.PI);
    const shift = this.biFlt.phaseShift(freqCorrectionHz);
    const phaseDiff = atan2(dQ, dI) + shift;
    this.phaseCorrection = phaseDiff;

    // Check if we are locked
    let mag = this.iMagFlt.add(Math.abs(sample));
    let bimag = this.bMagFlt.add(Math.hypot(bI, bQ) * 2);
    this.locked = bimag > mag / 15;
  }
}
