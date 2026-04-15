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

import * as Wasm from "./wasm-bytes.js";

let convolverModule = new WebAssembly.Module(Wasm.CONVOLVER);

type ConvolverInterface = {
  memory: WebAssembly.Memory;
  coefsPtr: (num: number, groups: number) => number;
  dataPtr: (num: number) => number;
  convolve: (num: number) => number;
  convolveWithStride: (num: number, stride: number, offset: number) => number;
  convolveExpanding: (num: number) => number;
  convolveExpandingWithStride: (
    num: number,
    stride: number,
    offset: number,
  ) => number;
};

function checkPtr(ptr: number): number {
  if (ptr < 0) throw "could not reserve memory";
  return ptr;
}

export class Convolver {
  constructor(private wasm: ConvolverInterface) {}

  setCoefs(coefs: Float32Array) {
    const ptr = checkPtr(this.wasm.coefsPtr(coefs.length, 1));
    new Float32Array(this.wasm.memory.buffer, ptr, coefs.length).set(coefs);
  }

  setCoefArray(coefs: Float32Array[]) {
    const groupLen = coefs
      .map((e) => e.length)
      .reduce((a, b) => Math.min(a, b));
    const groups = coefs.length;
    const ptr = checkPtr(this.wasm.coefsPtr(groupLen, groups));
    let arr = new Float32Array(this.wasm.memory.buffer, ptr, groups * groupLen);
    for (let i = 0; i < groups; i++) {
      arr.set(coefs[i].subarray(0, groupLen), i * groupLen);
    }
  }

  convolve(data: Float32Array, num: number): Float32Array {
    const ptr = checkPtr(this.wasm.dataPtr(data.length));
    new Float32Array(this.wasm.memory.buffer, ptr, data.length).set(data);
    const outPtr = checkPtr(this.wasm.convolve(num));
    return new Float32Array(this.wasm.memory.buffer, outPtr, num);
  }

  convolveWithStride(
    data: Float32Array,
    num: number,
    stride: number,
    offset: number,
  ): Float32Array {
    const ptr = checkPtr(this.wasm.dataPtr(data.length));
    new Float32Array(this.wasm.memory.buffer, ptr, data.length).set(data);
    const outPtr = checkPtr(this.wasm.convolveWithStride(num, stride, offset));
    return new Float32Array(this.wasm.memory.buffer, outPtr, num);
  }

  convolveExpanding(
    data: Float32Array,
    num: number,
    ratio: number,
  ): Float32Array {
    const ptr = checkPtr(this.wasm.dataPtr(data.length));
    new Float32Array(this.wasm.memory.buffer, ptr, data.length).set(data);
    const outPtr = checkPtr(this.wasm.convolveExpanding(num));
    return new Float32Array(this.wasm.memory.buffer, outPtr, num * ratio);
  }

  convolveExpandingWithStride(
    data: Float32Array,
    num: number,
    stride: number,
    offset: number,
  ): Float32Array {
    const ptr = checkPtr(this.wasm.dataPtr(data.length));
    new Float32Array(this.wasm.memory.buffer, ptr, data.length).set(data);
    const outPtr = checkPtr(
      this.wasm.convolveExpandingWithStride(num, stride, offset),
    );
    return new Float32Array(this.wasm.memory.buffer, outPtr, num);
  }
}

export function getConvolver(): Convolver {
  return new Convolver(
    new WebAssembly.Instance(convolverModule)
      .exports as unknown as ConvolverInterface,
  );
}
