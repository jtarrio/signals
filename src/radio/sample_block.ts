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
  /** Extra data provided by the source. */
  data?: any;
};
