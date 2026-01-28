// Copyright 2026 Jacobo Tarrio Barreiro. All rights reserved.
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

import { bench, describe } from "vitest";
import {
  ConfigWBFM,
  DemodWBFM,
  ModeWBFM,
  OptionsWBFM,
} from "../../src/demod/demod-wbfm.js";
import { registerDemod, getMode } from "../../src/demod/modes.js";

describe("WBFM demodulation", () => {
  registerDemod("WBFM", DemodWBFM, ConfigWBFM);
  for (let sampleRate of [1024000, 2048000, 2800000]) {
    describe(`${sampleRate} samples/sec`, () => {
      const I = new Float32Array(sampleRate).map((_) => Math.random());
      const Q = new Float32Array(sampleRate).map((_) => Math.random());

      const run = (options?: OptionsWBFM) => {
        let demod = new DemodWBFM(
          sampleRate,
          48000,
          getMode("WBFM") as ModeWBFM,
          options,
        );
        return () => {
          demod.demodulate(I, Q, 15000);
        };
      };

      bench("Defaults", run());
      bench("Use FFT", run({ useFftFilter: true }));
      bench("Use FFT more taps", run({ useFftFilter: true, rfTaps: 257 }));
      bench(
        "Low taps",
        run({ downsamplerTaps: 75, rfTaps: 75, audioTaps: 41 }),
      );
    });
  }
});
