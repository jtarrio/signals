import * as Wasm from "./wasm-bytes.js";

let convolverModule = new WebAssembly.Module(Wasm.CONVOLVER);

type ConvolverInterface = {
  memory: WebAssembly.Memory;
  coefsPtr: (num: number) => number;
  dataPtr: (num: number) => number;
  convolve: (num: number) => void;
};

export class Convolver {
  constructor(private wasm: ConvolverInterface) {}

  setCoefs(coefs: Float32Array) {
    const ptr = this.wasm.coefsPtr(coefs.length);
    if (ptr < 0) {
      throw "could not reserve memory";
    }
    new Float32Array(this.wasm.memory.buffer, ptr, coefs.length).set(coefs);
  }

  convolve(data: Float32Array, num: number): Float32Array {
    const ptr = this.wasm.dataPtr(data.length);
    if (ptr < 0) {
      throw "could not reserve memory";
    }

    new Float32Array(this.wasm.memory.buffer, ptr, data.length).set(data);
    this.wasm.convolve(num);
    return new Float32Array(this.wasm.memory.buffer, ptr, num);
  }
}

export function getConvolver(): Convolver {
  return new Convolver(
    new WebAssembly.Instance(convolverModule)
      .exports as unknown as ConvolverInterface,
  );
}
