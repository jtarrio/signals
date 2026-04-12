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
