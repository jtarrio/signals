// Copyright 2024 Jacobo Tarrio Barreiro. All rights reserved.
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

/** A block of samples returned by SignalSource.readSamples() */
export type SampleBlock = {
  /**
   * The I components of the samples.
   * Each element of I matches a corresponding element of Q, and I and Q have the same lengths.
   */
  I: Float32Array;
  /**
   * The Q components of the samples.
   * Each element of Q matches a corresponding element of I, and I and Q have the same lengths.
   */
  Q: Float32Array;
  /** The center frequency the source listened on when these samples were captured. */
  frequency: number;
};

/** Interface for a sample source. */
export interface SignalSource<ParameterKey extends string = string> {
  /**
   * Sets the wanted sample rate for the source.
   * Returns the actual sample rate, which may differ.
   * This function should be called before start.
   */
  setSampleRate(sampleRate: number): Promise<number>;
  /**
   * Sets the center frequency the source listens on.
   * Returns the actual center frequency, which may differ.
   */
  setCenterFrequency(freq: number): Promise<number>;
  /** Sets the value of a parameter. */
  setParameter<V>(parameter: ParameterKey, value: V): Promise<V | void>;
  /**
   * Prepares the source to start streaming samples.
   * You must call this function before you start reading samples.
   */
  startReceiving(): Promise<void>;
  /**
   * Reads the given number of samples.
   *
   * You may have several readSamples calls in flight,
   * and their promises will be resolved in the same order that they were issued.
   */
  readSamples(length: number): Promise<SampleBlock>;
  /** Shuts down the signal source. */
  close(): Promise<void>;
}

/** Interface for classes that return SignalSource instances. */
export interface SignalSourceProvider {
  /** Returns a signal source. */
  get(): Promise<SignalSource>;
}
