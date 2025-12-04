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
 * A faster (~3x) and slightly less precise version of Math.atan2.
 * It's plenty good for Float32 (maximum error 4e-8).
 * Coefficients from "Approximations for digital computers",
 * by Cecil Hastings, Jr., assisted by Jeanne T. Hayward and James P. Wong, Jr.,
 * (Princeton University Press, 1955),
 * found through https://mazzo.li/posts/vectorized-atan2.html
 */
export function atan2(imag: number, real: number): number {
  let swap = Math.abs(real) < Math.abs(imag);
  let div = swap ? real / imag : imag / real;

  const divSq = div * div;
  let res =
    div *
    (0.9999993329 +
      divSq *
        (-0.3332985605 +
          divSq *
            (0.1994653599 +
              divSq *
                (-0.1390853351 +
                  divSq *
                    (0.0964200441 +
                      divSq *
                        (-0.0559098861 +
                          divSq * (0.0218612288 + divSq * -0.004054058)))))));

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
