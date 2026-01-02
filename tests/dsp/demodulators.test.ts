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

import { test, assert } from "vitest";
import {
  add,
  argument,
  iqAdd,
  iqRealSineTone,
  iqSineTone,
  modulus,
  multiply,
  power,
  rmsd,
  sineTone,
} from "../testutil.js";
import {
  AMDemodulator,
  FMDemodulator,
  Sideband,
  SSBDemodulator,
  StereoSeparator,
} from "../../src/dsp/demodulators.js";
import { FFT } from "../../src/dsp/fft.js";

test("SSBDemodulator USB", () => {
  let demod = new SSBDemodulator(Sideband.Upper, 151);

  const powerForFreq = (freq: number) => {
    let input = iqAdd(iqSineTone(4800, 48000, freq, 1));
    let output = new Float32Array(4800);
    demod.demodulate(input[0], input[1], output);
    return power(output.subarray(2400));
  };

  // We receive strong positive frequencies but very weak negative frequencies
  assert.isAtMost(powerForFreq(-1000), 0.0005);
  assert.isAtMost(powerForFreq(-100), 0.03);
  assert.isAtLeast(powerForFreq(100), 0.3);
  assert.isAtLeast(powerForFreq(1000), 0.49);
});

test("SSBDemodulator LSB", () => {
  let demod = new SSBDemodulator(Sideband.Lower, 151);

  const powerForFreq = (freq: number) => {
    let input = iqAdd(iqSineTone(4800, 48000, freq, 1));
    let output = new Float32Array(4800);
    demod.demodulate(input[0], input[1], output);
    return power(output.subarray(2400));
  };

  // We receive strong negative frequencies but very weak positive frequencies
  assert.isAtLeast(powerForFreq(-1000), 0.49);
  assert.isAtLeast(powerForFreq(-100), 0.3);
  assert.isAtMost(powerForFreq(100), 0.03);
  assert.isAtMost(powerForFreq(1000), 0.0005);
});

test("AMDemodulator", () => {
  const sampleRate = 4096;
  const len = sampleRate * 4;
  let demod = new AMDemodulator(sampleRate);
  const amplitude = (
    carrierFreq: number,
    carrierAmplitude: number,
    freq: number,
    amplitude: number
  ) => {
    let signal = iqRealSineTone(len, sampleRate, freq, amplitude);
    let input = iqSineTone(len, sampleRate, carrierFreq, carrierAmplitude);
    for (let c = 0; c < 2; ++c) {
      for (let i = 0; i < len; ++i) {
        input[c][i] *= (1 + signal[0][i]) / 2;
      }
    }
    let output = new Float32Array(len);
    demod.demodulate(input[0], input[1], output);
    let fft = FFT.ofLength(sampleRate);
    let transformed = fft.transform(
      output.subarray(sampleRate * 3),
      new Float32Array(sampleRate)
    );

    return modulus(transformed, freq) * 2;
  };

  // For different carrier offsets and carrier/signal amplitudes,
  // we verify that the received signal amplitude matches the sent amplitude.
  for (let cf = -1000; cf <= 1000; cf += 200) {
    for (let a = 0.1; a <= 1; a += 0.1) {
      assert.approximately(
        amplitude(cf, a, 1000, 0.25),
        0.25,
        0.005,
        `Mismatch in received amplitude for carrier amplitude ${a} and frequency ${cf}`
      );

      assert.approximately(
        amplitude(cf, 0.25, 1000, a),
        a,
        0.005,
        `Mismatch in received amplitude for signal amplitude ${a} and carrier frequency ${cf}`
      );
    }
  }
});

test("FMDemodulator", () => {
  const sampleRate = 336000;
  const len = sampleRate / 10;
  const maxDev = 75000;
  let demod = new FMDemodulator(maxDev / sampleRate);

  for (let f = -maxDev; f <= maxDev; f += maxDev / 20) {
    let input = iqSineTone(len, sampleRate, f, 1);
    let output = new Float32Array(len);
    demod.demodulate(input[0], input[1], output);

    let expected = new Float32Array(len);
    expected.fill(f / maxDev);
    assert.isAtMost(
      rmsd(expected.subarray(len / 2), output.subarray(len / 2)),
      1e-7,
      `Mismatch in received value for deviation ${f}`
    );
  }

  let signal = Array.from({ length: len }).map(
    (_, i) =>
      (Math.cos((2 * Math.PI * 2543 * i) / sampleRate) +
        Math.cos((2 * Math.PI * 19000 * i) / sampleRate + 0.1234) +
        Math.sin((2 * Math.PI * 42345 * i) / sampleRate)) /
      3
  );
  let angle = new Array(len);
  angle[0] = 0;
  for (let i = 1; i < angle.length; ++i) {
    angle[i] =
      angle[i - 1] + (2 * Math.PI * maxDev * signal[i - 1]) / sampleRate;
  }
  let I = new Float32Array(angle.map((a) => Math.cos(a)));
  let Q = new Float32Array(angle.map((a) => Math.sin(a)));

  let expected = new Float32Array(len);
  expected[0] = 1;
  expected.subarray(1).set(new Float32Array(signal.slice(0, len - 1)));

  let out = new Float32Array(len);
  demod.demodulate(I, Q, out);
  assert.isAtMost(rmsd(out, expected), 1e-7);
});

test("StereoSeparator - with stereo signal", () => {
  const sampleRate = 336000;
  const len = sampleRate / 10;
  const pilotFreq = 19000;
  let separator = new StereoSeparator(sampleRate, pilotFreq);
  let input = add(
    sineTone(len, sampleRate, pilotFreq, 0.1, -Math.PI / 2), // sin(2πPt)
    multiply(
      sineTone(len, sampleRate, pilotFreq * 2, 1, -Math.PI / 2), // sin(4πPt)
      sineTone(len, sampleRate, 2625, 0.45)
    )
  );
  let { found, diff: output } = separator.separate(input);
  assert.isTrue(found);

  let fft = FFT.ofLength(4096);
  let transformed = fft.transform(
    output.subarray(output.length - fft.length, output.length),
    new Float32Array(fft.length)
  );
  const bin = (2625 * fft.length) / sampleRate;
  assert.approximately(modulus(transformed, bin), 0.225, 0.0005);
  assert.approximately(argument(transformed, bin), 0, 2e-4);
});
