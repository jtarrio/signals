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

import { RealTimeSource } from "./realtime.js";

/**
 * A function that generates samples.
 * @param firstSample The first sample's number.
 * @param sampleRate The sample rate.
 * @param centerFrequency The signal's center frequency.
 * @param I An array to be populated with the I component values.
 * @param Q An array to be populated with the Q component values.
 */
export type SampleGenerator = (
  firstSample: number,
  sampleRate: number,
  centerFrequency: number,
  I: Float32Array,
  Q: Float32Array
) => void;

/** A SignalSource that gets samples from a SampleGenerator function in real time. */
export class GeneratedSource<ParameterKey extends string = string>  extends RealTimeSource<ParameterKey> {
  constructor(private generator: SampleGenerator) {
    super();
  }

  protected getSamples(
    firstSample: number,
    I: Float32Array,
    Q: Float32Array
  ): void {
    this.generator(firstSample, this.sampleRate, this.centerFrequency, I, Q);
  }
}
