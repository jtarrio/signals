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

// Type for I/Q signals.
export type IQ = [Float32Array, Float32Array];

export function iq(length: number): IQ {
  return [new Float32Array(length), new Float32Array(length)];
}

// Computes the root-mean-square difference of two arrays
export function rmsd<T extends ArrayLike<any>>(a: T, b: T): number {
  const num = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < num; ++i) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum / num);
}

// Computes the root-mean-square difference of two I/Q signals.
export function iqRmsd(a: IQ, b: IQ): number {
  const num = Math.min(a.length, b.length);
  let sum = 0;
  for (let c = 0; c < 2; ++c) {
    for (let i = 0; i < num; ++i) {
      const d = a[c][i] - b[c][i];
      sum += d * d;
    }
  }
  return Math.sqrt(sum / num);
}

// Returns an array that counts `length` elements starting from 0.
export function count(length: number): Float32Array;
// Returns an array that counts from `start` to `end` (the `end` is excluded.)
export function count(start: number, end: number): Float32Array;
export function count(startOrLength: number, end?: number): Float32Array {
  if (end === undefined) {
    return new Float32Array(startOrLength).map((_, i) => i);
  }
  return new Float32Array(end - startOrLength).map((_, i) => i + startOrLength);
}

// Returns a signal's average power.
export function power(s: Float32Array): number {
  const num = s.length;
  let sum = 0;
  for (let i = 0; i < num; ++i) {
    sum += s[i] * s[i];
  }
  return sum / num;
}

// Returns a sine tone
export function sineTone(
  length: number,
  sampleRate: number,
  frequency: number,
  amplitude: number,
  phase?: number
): Float32Array {
  phase = phase || 0;
  let out = new Float32Array(length);
  for (let i = 0; i < length; ++i) {
    out[i] =
      amplitude * Math.cos((2 * Math.PI * frequency * i) / sampleRate + phase);
  }
  return out;
}

// Returns an I/Q sine tone
export function iqSineTone(
  length: number,
  sampleRate: number,
  frequency: number,
  amplitude: number,
  phase?: number
): IQ {
  phase = phase || 0;
  let outI = new Float32Array(length);
  let outQ = new Float32Array(length);
  for (let i = 0; i < length; ++i) {
    outI[i] =
      amplitude * Math.cos((2 * Math.PI * frequency * i) / sampleRate + phase);
    outQ[i] =
      amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate + phase);
  }
  return [outI, outQ];
}

// Returns an I/Q real sine tone
export function iqRealSineTone(
  length: number,
  sampleRate: number,
  frequency: number,
  amplitude: number,
  phase?: number
): IQ {
  return [
    sineTone(length, sampleRate, frequency, amplitude, phase),
    new Float32Array(length),
  ];
}

// Returns white noise of the given amplitude.
// Uses a PRNG with a fixed seed so the noise is always the same.
export function noise(length: number, amplitude: number): Float32Array {
  let rnd = new PRNG(0x1234_5678_abcd_ef01n);
  return new Float32Array(length).map((_) => amplitude * rnd.next());
  // return new Float32Array(length).map(_ => amplitude * Math.random());
}

// PRNG from Widynski, Bernard (2020). "Squares: A Fast Counter-Based RNG". https://doi.org/10.48550/arXiv.2004.06278
export class PRNG {
  constructor(seed: bigint) {
    this.counter = BigInt(1);
    this.key = seed;
  }

  private counter: bigint;
  private key: bigint;

  next(): number {
    let x = this.counter * this.key;
    let y = x;
    let z = y + this.key;
    x = x * x + y;
    x = ((x & 0xffffffff00000000n) >> 32n) | ((x & 0xffffffffn) << 32n);
    x = x * x + z;
    x = ((x & 0xffffffff00000000n) >> 32n) | ((x & 0xffffffffn) << 32n);
    x = x * x + y;
    x = ((x & 0xffffffff00000000n) >> 32n) | ((x & 0xffffffffn) << 32n);
    let n = Number(((x * x + z) & 0xffff_ffff_0000_0000n) >> BigInt(32));
    this.counter++;
    return n / 2 ** 32;
  }
}

// Adds some DC to a signal
export function addDc(signal: Float32Array, value: number): Float32Array {
  for (let i = 0; i < signal.length; ++i) {
    signal[i] += value;
  }
  return signal;
}

// Adds several signals
export function add(a: Float32Array, ...rest: Float32Array[]): Float32Array {
  for (let i = 0; i < rest.length; ++i) {
    const r = rest[i];
    for (let j = 0; j < r.length && j < a.length; ++j) {
      a[j] += r[j];
    }
  }
  return a;
}

// Multiplies several signals
export function multiply(
  a: Float32Array,
  ...rest: Float32Array[]
): Float32Array {
  for (let i = 0; i < rest.length; ++i) {
    const r = rest[i];
    for (let j = 0; j < r.length && j < a.length; ++j) {
      a[j] *= r[j];
    }
  }
  return a;
}

// Adds several I/Q signals
export function iqAdd(a: IQ, ...rest: IQ[]): IQ {
  for (let i = 0; i < rest.length; ++i) {
    const r = rest[i];
    for (let c = 0; c < 2; ++c) {
      for (let j = 0; j < r[c].length && j < a[c].length; ++j) {
        a[c][j] += r[c][j];
      }
    }
  }
  return a;
}

// Returns a piece of an I/Q signal
export function iqSubarray(a: IQ, start: number, end?: number): IQ {
  return [a[0].subarray(start, end), a[1].subarray(start, end)];
}

// Returns the modulus of an I/Q signal or one of its elements
export function modulus(a: IQ, i: number): number;
export function modulus(a: IQ): Float32Array;
export function modulus(a: IQ, i?: number): number | Float32Array {
  if (i !== undefined) return Math.hypot(a[0][i], a[1][i]);
  return a[0].map((_, i) => Math.hypot(a[0][i], a[1][i]));
}

// Returns the argument of an I/Q signal or one of its elements
export function argument(a: IQ, i: number): number;
export function argument(a: IQ): Float32Array;
export function argument(a: IQ, i?: number): number | Float32Array {
  if (i !== undefined) return Math.atan2(a[1][i], a[0][i]);
  return a[0].map((_, i) => Math.atan2(a[1][i], a[0][i]));
}

// Generates an "ascii art" representation of an FFT spectrum for a real signal.
export function fftSpectrum(fft: IQ, width: number, lines: number): string {
  let m = modulus(fft);
  let maxm = Math.max(...m);
  let maxPower = maxm * maxm;
  let powPerLine = maxPower / lines;
  let binsPerChar = (m.length / 2) / width;
  let out = Array.from({length: lines}).map(_ => '');
    for (let c = 0; c < width; ++c) {
      let h = 0;
      for (let b = Math.floor(binsPerChar * c); b < Math.floor(binsPerChar * (c + 1)); ++b) {
        h = Math.max(h, m[b]);
      }
      h = Math.round((h * h) / powPerLine);
      for (let lr = 0; lr < lines; ++lr) {
        let l = lines - lr - 1;
        out[l] += h >= lr ? 'X' : ' ';
      }
  }
  return out.join('\n');
}