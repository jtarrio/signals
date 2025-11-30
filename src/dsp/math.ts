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

/**
 * A faster (~3x) and slightly less precise version of Math.atan2. It's still good to 1/6000 of a degree.
 *
 * Adapted from https://mazzo.li/posts/vectorized-atan2.html
 */
export function atan2(imag: number, real: number): number {
  let swap = Math.abs(real) < Math.abs(imag);
  let div = swap ? real / imag : imag / real;

  const divSq = div * div;
  let res =
    div *
    (0.99997726 +
      divSq *
        (-0.33262347 +
          divSq *
            (0.19354346 +
              divSq *
                (-0.11643287 + divSq * (0.05265332 + divSq * -0.0117212)))));

  if (swap) {
    if (div >= 0) {
      res = Math.PI / 2 - res;
    } else {
      res = -Math.PI / 2 - res;
    }
  }
  if (real >= 0) return res;
  if (imag >= 0) return res + Math.PI;
  return res - Math.PI;
}
