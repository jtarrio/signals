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

import { IqBuffer } from "../dsp/buffers.js";
import { SampleGenerator } from "./realtime.js";

/** Returns a generator for a tone at the given frequency with the given amplitude. */
export function tone(freq: number, amplitude: number): SampleGenerator {
  return (
    sample: number,
    rate: number,
    centerFreq: number,
    I: Float32Array,
    Q: Float32Array
  ) => {
    const delta = (freq - centerFreq) / rate;
    if (delta >= 0.5 || -0.5 >= delta) {
      I.fill(0);
      Q.fill(0);
      return;
    }
    const p = 2 * Math.PI * delta * (sample % rate);
    let a = Math.cos(p);
    let b = Math.sin(p);
    const f = 2 * Math.PI * delta;
    const c = Math.cos(f);
    const d = Math.sin(f);
    for (let i = 0; i < I.length; ++i) {
      I[i] = a * amplitude;
      Q[i] = b * amplitude;
      const xa = a * c - b * d;
      const xb = b * c + a * d;
      a = xa;
      b = xb;
    }
  };
}

/** Returns a generator for noise with a given amplitude. */
export function noise(amplitude: number): SampleGenerator {
  return (
    _sample: number,
    _rate: number,
    _centerFreq: number,
    I: Float32Array,
    Q: Float32Array
  ) => {
    for (let i = 0; i < I.length; ++i) {
      let r = amplitude * Math.sqrt(Math.random());
      let t = Math.random() * 2 * Math.PI;
      I[i] = r * Math.cos(t);
      Q[i] = r * Math.sin(t);
    }
  };
}

/** Returns a generator that adds the outputs of all the provided generators together. */
export function sum(...generators: SampleGenerator[]): SampleGenerator {
  let buffer = new IqBuffer(1, 65536);
  return (
    sample: number,
    rate: number,
    centerFreq: number,
    I: Float32Array,
    Q: Float32Array
  ) => {
    I.fill(0);
    Q.fill(0);
    let [J, R] = buffer.get(I.length);
    for (let g of generators) {
      g(sample, rate, centerFreq, J, R);
      for (let i = 0; i < I.length; ++i) {
        I[i] += J[i];
        Q[i] += R[i];
      }
    }
  };
}

/**
 * Returns a generator that multiplies the output of the carrier generator
 * with the output of the signal generator.
 * The signal generator always receives a center frequency of 0 Hz.
 */
export function product(
  carrier: SampleGenerator,
  signal: SampleGenerator
): SampleGenerator {
  let buffer = new IqBuffer(1, 65536);
  return (
    sample: number,
    rate: number,
    centerFreq: number,
    I: Float32Array,
    Q: Float32Array
  ) => {
    let [J, R] = buffer.get(I.length);
    carrier(sample, rate, centerFreq, I, Q);
    signal(sample, rate, 0, J, R);
    for (let i = 0; i < I.length; ++i) {
      const a = I[i];
      const b = Q[i];
      const c = J[i];
      const d = R[i];
      I[i] = a * c - b * d;
      Q[i] = a * d + b * c;
    }
  };
}

/**
 * Returns a generator that amplitude-modulates the output
 * of the signal generator using a modulation factor of 2.
 * Only the I component of the signal is used as the input.
 * The signal generator always receives a center frequency of 0 Hz.
 */
export function modulateAM(
  carrierFreq: number,
  amplitude: number,
  signal: SampleGenerator
): SampleGenerator {
  let buffer = new IqBuffer(1, 65536);
  const carrier = tone(carrierFreq, amplitude);
  return (
    sample: number,
    rate: number,
    centerFreq: number,
    I: Float32Array,
    Q: Float32Array
  ) => {
    const delta = (carrierFreq - centerFreq) / rate;
    if (delta >= 0.5 || -0.5 >= delta) {
      I.fill(0);
      Q.fill(0);
      return;
    }
    let [J, R] = buffer.get(I.length);
    carrier(sample, rate, centerFreq, I, Q);
    signal(sample, rate, 0, J, R);
    for (let i = 0; i < I.length; ++i) {
      const c = (1 + J[i]) / 2;
      I[i] *= c;
      Q[i] *= c;
    }
  };
}

/**
 * Returns a generator that frequency-modulates the output
 * of the signal generator using the given maximum frequency deviation.
 * Only the I component of the signal is used as the input.
 * The signal generator always receives a center frequency of 0 Hz.
 */
export function modulateFM(
  carrierFreq: number,
  maximumDeviation: number,
  amplitude: number,
  signal: SampleGenerator
): SampleGenerator {
  let buffer = new IqBuffer(1, 65536);
  let phase = 0;
  return (
    sample: number,
    rate: number,
    centerFreq: number,
    I: Float32Array,
    Q: Float32Array
  ) => {
    const delta = (carrierFreq - centerFreq) / rate;
    if (delta >= 0.5 || -0.5 >= delta) {
      I.fill(0);
      Q.fill(0);
      return;
    }
    const maxF = maximumDeviation / rate;

    let [J, R] = buffer.get(I.length);
    signal(sample, rate, 0, J, R);
    let sigSum = 0;
    let p = phase;
    for (let i = 0; i < I.length; ++i) {
      const angle = 2 * Math.PI * p;
      I[i] = amplitude * Math.cos(angle);
      Q[i] = amplitude * Math.sin(angle);
      p += delta + maxF * J[i];
      sigSum += J[i];
    }
    phase += delta * I.length + maxF * sigSum;
    phase -= Math.floor(phase);
  };
}
