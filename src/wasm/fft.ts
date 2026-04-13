import * as Wasm from "./wasm-bytes.js";

let fftModule = new WebAssembly.Module(Wasm.FFT);

type FftInterface = {
  memory: WebAssembly.Memory;
  coefsPtr: (numCoefs: number) => number;
  realDataPtr: () => number;
  imagDataPtr: () => number;
  fft: (reverse: boolean) => void;
  postRealFft: () => void;
};

function checkPtr(ptr: number): number {
  if (ptr < 0) throw "could not reserve memory";
  return ptr;
}

export class WasmFft {
  constructor(private wasm: FftInterface) {}

  setCoefs(coefs: Float32Array) {
    const ptr = checkPtr(this.wasm.coefsPtr(coefs.length));
    new Float32Array(this.wasm.memory.buffer, ptr, coefs.length).set(coefs);
  }

  fft(
    real: Float32Array,
    imag: Float32Array,
    reverse: boolean,
  ): [Float32Array, Float32Array] {
    const realPtr = this.wasm.realDataPtr();
    const imagPtr = this.wasm.imagDataPtr();
    let r = new Float32Array(this.wasm.memory.buffer, realPtr, real.length);
    let i = new Float32Array(this.wasm.memory.buffer, imagPtr, imag.length);
    r.set(real);
    i.set(imag);
    this.wasm.fft(reverse);
    return [r, i];
  }

  postRealFft() {
    this.wasm.postRealFft();
  }
}

export function getWasmFft(): WasmFft {
  return new WasmFft(
    new WebAssembly.Instance(fftModule).exports as unknown as FftInterface,
  );
}
