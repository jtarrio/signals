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

import { test, assert, describe } from "vitest";
import {
  add,
  addDc,
  count,
  iqAdd,
  iqRealSineTone,
  iqRmsd,
  iqSineTone,
  noise,
  power,
  rmsd,
  sineTone,
} from "../testutil.js";
import {
  AGC,
  DcBlocker,
  Deemphasis,
  DelayFilter,
  FIRFilter,
  FrequencyShifter,
  IIRLowPass,
  IIRLowPass2,
  PilotDetector,
  Preemphasis,
} from "../../src/dsp/filters.js";

test("DelayFilter", () => {
  let filter = new DelayFilter(2);

  // Using inPlace
  let signal = count(10, 15);
  filter.inPlace(signal);
  assert.deepEqual(signal, new Float32Array([0, 0, 10, 11, 12]));
  signal = count(20, 25);
  filter.inPlace(signal);
  assert.deepEqual(signal, new Float32Array([13, 14, 20, 21, 22]));
  signal = count(30, 40);
  filter.inPlace(signal);
  assert.deepEqual(
    signal,
    new Float32Array([23, 24, 30, 31, 32, 33, 34, 35, 36, 37])
  );
  signal = count(40, 43);
  filter.inPlace(signal);
  assert.deepEqual(signal, new Float32Array([38, 39, 40]));
});

test("FIRFilter", () => {
  let coefs = new Float32Array([1, 2, 5, 9, 16]);
  const conv = (signal: Float32Array) => {
    let filter = new FIRFilter(coefs);
    filter.inPlace(signal);
    return signal;
  };

  assert.deepEqual(
    conv(new Float32Array([1, 0, 0, 0, 0, 0])),
    new Float32Array([16, 9, 5, 2, 1, 0])
  );
  assert.deepEqual(
    conv(new Float32Array([0, 1, 0, 0, 0, 0])),
    new Float32Array([0, 16, 9, 5, 2, 1])
  );
  assert.deepEqual(
    conv(new Float32Array([0, 0, 1, 0, 0, 0])),
    new Float32Array([0, 0, 16, 9, 5, 2])
  );
  assert.deepEqual(
    conv(new Float32Array([0, 0, 0, 1, 0, 0])),
    new Float32Array([0, 0, 0, 16, 9, 5])
  );
  assert.deepEqual(
    conv(new Float32Array([0, 0, 0, 0, 1, 0])),
    new Float32Array([0, 0, 0, 0, 16, 9])
  );
  assert.deepEqual(
    conv(new Float32Array([0, 0, 0, 0, 0, 1])),
    new Float32Array([0, 0, 0, 0, 0, 16])
  );
  assert.deepEqual(
    conv(new Float32Array([0, 1, 0, 0, 1, 0])),
    new Float32Array([0, 16, 9, 5, 18, 10])
  );
});

test("AGC", () => {
  let agc = new AGC(8000, 0.5, 10);
  // Runs 0.25 seconds on the AGC
  const agcPower = (amplitude: number) => {
    let tone = sineTone(2000, 8000, 1000, amplitude);
    agc.inPlace(tone);
    return power(tone);
  };
  // Saturate the AGC with a full-power tone.
  assert.isAtLeast(agcPower(1), 0.499);
  // Reduce the amplitude, the AGC takes 1 second to start raising the gain.
  assert.approximately(agcPower(0.1), 0.005, 0.0001);
  assert.approximately(agcPower(0.1), 0.005, 0.0001);
  assert.approximately(agcPower(0.1), 0.005, 0.0001);
  assert.approximately(agcPower(0.1), 0.005, 0.0001);
  // AGC ramps up to 90% of power within 5 TC
  assert.approximately(agcPower(0.1), 0.006, 0.0005);
  assert.approximately(agcPower(0.1), 0.011, 0.0005);
  assert.approximately(agcPower(0.1), 0.018, 0.0005);
  assert.approximately(agcPower(0.1), 0.029, 0.0005);
  assert.approximately(agcPower(0.1), 0.048, 0.0005);
  assert.approximately(agcPower(0.1), 0.079, 0.0005);
  assert.approximately(agcPower(0.1), 0.13, 0.0005);
  assert.approximately(agcPower(0.1), 0.215, 0.0005);
  assert.approximately(agcPower(0.1), 0.354, 0.0005);
  assert.approximately(agcPower(0.1), 0.45, 0.0005);
  // We can increase the input power by 10% without changing the gain
  assert.approximately(agcPower(0.105), 0.496, 0.0005);
  // But if we increase it more, the AGC cuts the gain
  assert.approximately(agcPower(0.2), 0.5, 0.005);
});

test("DcBlocker", () => {
  let blocker = new DcBlocker(8000);
  const blockerDiff = () => {
    let tone = sineTone(2000, 8000, 1000, 0.1);
    let signal = addDc(new Float32Array(tone), 0.1);
    blocker.inPlace(signal);
    return rmsd(signal, tone);
  };

  // -45dB in 3 seconds (the original value is 0.1)
  assert.approximately(blockerDiff(), 0.079, 0.0005);
  assert.approximately(blockerDiff(), 0.048, 0.0005);
  assert.approximately(blockerDiff(), 0.029, 0.0005);
  assert.approximately(blockerDiff(), 0.018, 0.0005);
  assert.approximately(blockerDiff(), 0.011, 0.0005);
  assert.approximately(blockerDiff(), 0.007, 0.0005);
  assert.approximately(blockerDiff(), 0.004, 0.0005);
  assert.approximately(blockerDiff(), 0.002, 0.0005);
  assert.approximately(blockerDiff(), 0.001, 0.0005);
  assert.approximately(blockerDiff(), 0.001, 0.0005);
  assert.approximately(blockerDiff(), 0.001, 0.0005);
  assert.approximately(blockerDiff(), 0.0, 0.0005);
});

test("IIRLowPass", () => {
  const sampleRate = 192000;
  for (const cornerFrequency of [1000, 15000]) {
    const filterPower = (freq: number) => {
      let filter = new IIRLowPass(sampleRate, cornerFrequency);
      let tone = sineTone(sampleRate, sampleRate, freq, 1);
      filter.inPlace(tone);
      return power(tone.subarray(sampleRate * 0.75));
    };

    const expectedPower = (freq: number) => {
      const timeConstant = 1 / (2 * Math.PI * cornerFrequency);
      let xr = Math.sqrt(timeConstant);
      let xc = 1 / (2 * Math.PI * freq * xr);
      let o = xc / Math.hypot(xr, xc);
      return (o * o) / 2;
    };

    assert.approximately(filterPower(cornerFrequency), 0.25, 0.005);

    for (let i = 300; i < 19000; i += 1000) {
      assert.approximately(
        filterPower(i),
        expectedPower(i),
        0.005,
        `Mismatch in frequency response for ${i} Hz with corner frequency ${cornerFrequency} Hz`
      );
    }
  }
});

test("IIRLowPass2", () => {
  const sampleRate = 192000;
  let cornerFreq = 5000;

  const filterPower = (freq: number) => {
    let filter = new IIRLowPass2(sampleRate, cornerFreq, 0.5);
    let tone = sineTone(sampleRate, sampleRate, freq, 1);
    filter.inPlace(tone);
    return power(tone.subarray(sampleRate * 0.75));
  };

  const maxExpectedPower = (freq: number) => {
    let timeConstant = Math.sqrt(Math.sqrt(2) - 1) / (2 * Math.PI * cornerFreq);
    let xr = Math.sqrt(timeConstant);
    let xc = 1 / (2 * Math.PI * freq * xr);
    let o = xc / Math.hypot(xr, xc);
    return Math.pow(o * o, 2) / 2;
  };

  assert.approximately(filterPower(cornerFreq), 0.125, 0.005);

  for (let i = 300; i < 19000; i += 1000) {
    assert.isAtMost(
      filterPower(i),
      maxExpectedPower(i),
      `Mismatch in frequency response for ${i} Hz`
    );
  }
});

test("Deemphasis", () => {
  const sampleRate = 192000;
  for (const timeConstant of [50, 75]) {
    const filterPower = (freq: number) => {
      let filter = new Deemphasis(sampleRate, timeConstant * 1e-6);
      let tone = sineTone(sampleRate, sampleRate, freq, 1);
      filter.inPlace(tone);
      return power(tone.subarray(sampleRate * 0.75));
    };

    const expectedPower = (freq: number) => {
      let xr = Math.sqrt(timeConstant * 1e-6);
      let xc = 1 / (2 * Math.PI * freq * xr);
      let o = xc / Math.hypot(xr, xc);
      return (o * o) / 2;
    };

    let cf = 1 / (2 * Math.PI * timeConstant * 1e-6);
    assert.approximately(filterPower(cf), 0.25, 0.005);

    for (let i = 300; i < 19000; i += 1000) {
      assert.approximately(
        filterPower(i),
        expectedPower(i),
        0.001,
        `Mismatch in frequency response for ${i} Hz with time constant ${timeConstant} µs`
      );
    }
  }
});

test("Preemphasis", () => {
  const sampleRate = 192000;
  for (const timeConstant of [50, 75]) {
    const filterPower = (freq: number) => {
      let filter = new Preemphasis(sampleRate, timeConstant * 1e-6);
      let deemph = new Deemphasis(sampleRate, timeConstant * 1e-6);
      let tone = sineTone(sampleRate, sampleRate, freq, 1);
      filter.inPlace(tone);
      deemph.inPlace(tone);
      return power(tone.subarray(sampleRate * 0.75));
    };

    for (let i = 300; i < 19000; i += 1000) {
      assert.approximately(
        filterPower(i),
        0.5,
        0.002,
        `Mismatch in frequency response for ${i} Hz with time constant ${timeConstant} µs`
      );
    }
  }
});

test("FrequencyShifter", () => {
  // One real 1000 Hz sinetone
  let input = iqRealSineTone(80, 8000, 1000, 0.5);

  // Shift up 300 Hz
  let shifter = new FrequencyShifter(8000);
  shifter.inPlace(input[0], input[1], 300);

  // We expect to see one complex sinetone at -700 Hz and another at 1300 Hz
  let expected = iqAdd(
    iqSineTone(80, 8000, -700, 0.25),
    iqSineTone(80, 8000, 1300, 0.25)
  );
  assert.isAtMost(iqRmsd(input, expected), 0.0005);
});

describe("PilotDetector", () => {
  const sampleRate = 192000;
  const len = sampleRate / 2;

  // Freq, amplitude, phase, noise, expectedRMSD
  const lockedCases = [
    [19000, 0.1, 0, 0, 1.1e-6],
    [19002, 0.1, 0, 0, 7.1e-4],
    [18998, 0.1, 0, 0, 7.1e-4],
    [19000, 0.1, Math.PI / 2, 0, 1.1e-6],
    [19002, 0.1, Math.PI / 2, 0, 7.1e-4],
    [18998, 0.1, Math.PI / 2, 0, 7.1e-4],
    [19000, 0.1, Math.PI - 0.01, 0, 1.1e-6],
    [19002, 0.1, Math.PI - 0.01, 0, 7.1e-4],
    [18998, 0.1, Math.PI - 0.01, 0, 7.1e-4],
    [19000, 0.08, 0, 0.1, 2.2e-3],
    [19002, 0.08, 0, 0.1, 2.4e-3],
    [18998, 0.08, 0, 0.1, 2.4e-3],
    [19000, 0.08, Math.PI / 2, 0.1, 2.1e-3],
    [19002, 0.08, Math.PI / 2, 0.1, 2e-3],
    [18998, 0.08, Math.PI / 2, 0.1, 2.4e-3],
  ];

  for (const [
    toneFreq,
    toneAmpl,
    tonePhase,
    noiseAmpl,
    expected,
  ] of lockedCases) {
    test(`Locked for ${toneFreq}Hz phase=${tonePhase} ampl=${toneAmpl} noise=${noiseAmpl}`, () => {
      let tone = sineTone(len, sampleRate, toneFreq, toneAmpl, tonePhase);
      let input = add(noise(len, noiseAmpl), tone);

      let detector = new PilotDetector(sampleRate, 19000, 2);
      let output = detector.extract(input);
      for (let i = 0; i < output[0].length; ++i) {
        output[0][i] *= toneAmpl;
      }

      assert.isTrue(detector.locked);
      assert.isAtMost(
        rmsd(tone.subarray(len - 5000), output[0].subarray(len - 5000)),
        expected
      );
    });
  }

  const noLockCases = [
    [10, 0, 0],
    [10, 0, 1],
    [10, 1, 0],
    [10, 0, 1],
    [10000, 1, 0],
    [10000, 0.5, 1],
    [18000, 1, 0],
    [18000, 0.5, 1],
    [18900, 1, 0],
    [18950, 1, 0],
    [19050, 1, 0],
    [19100, 1, 0],
    [20000, 1, 0],
    [20000, 0.5, 1],
  ];

  for (const [freq, ampl, noiseAmpl] of noLockCases) {
    test(`No lock for ${freq}Hz ampl=${ampl} noise=${noiseAmpl}`, () => {
      let tone = sineTone(len, sampleRate, freq, ampl);
      let input = add(noise(len, noiseAmpl), tone);

      let detector = new PilotDetector(sampleRate, 19000, 2);
      let output = detector.extract(input);
      for (let i = 0; i < output[0].length; ++i) {
        output[0][i] *= ampl;
      }

      assert.isFalse(detector.locked);
    });
  }
});
