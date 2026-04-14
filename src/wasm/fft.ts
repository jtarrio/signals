import * as Wasm from "./wasm-bytes.js";

let fftModule = new WebAssembly.Module(Wasm.FFT);

type FftInterface = {
  memory: WebAssembly.Memory;
  getFftLength: () => number;
  coefsPtr: (numCoefs: number) => number;
  realDataPtr: () => number;
  imagDataPtr: () => number;
  expnCoefsPtr: () => number;
  expnRealDataPtr: () => number;
  expnImagDataPtr: () => number;
  fft: (reverse: boolean) => void;
  expandRealFft: () => void;
  collapseRealFft: () => void;
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

  setExpnCoefs(coefs: Float32Array) {
    const ptr = checkPtr(this.wasm.expnCoefsPtr());
    new Float32Array(this.wasm.memory.buffer, ptr, coefs.length).set(coefs);
  }

  fft(
    real: Float32Array,
    imag: Float32Array,
    reverse: boolean,
  ): [Float32Array, Float32Array] {
    const len = this.wasm.getFftLength();
    const realPtr = this.wasm.realDataPtr();
    const imagPtr = this.wasm.imagDataPtr();
    let r = new Float32Array(this.wasm.memory.buffer, realPtr, len);
    let i = new Float32Array(this.wasm.memory.buffer, imagPtr, len);
    r.set(real);
    i.set(imag);
    this.wasm.fft(reverse);
    return [r, i];
  }

  realFftPost(): [Float32Array, Float32Array] {
    let len = this.wasm.getFftLength();
    this.wasm.expandRealFft();
    const outRealPtr = this.wasm.expnRealDataPtr();
    const outImagPtr = this.wasm.expnImagDataPtr();
    let r = new Float32Array(this.wasm.memory.buffer, outRealPtr, len * 2);
    let i = new Float32Array(this.wasm.memory.buffer, outImagPtr, len * 2);
    return [r, i];
  }

  reverseRealFftPre(
    real: Float32Array,
    imag: Float32Array,
  ): [Float32Array, Float32Array] {
    let len = this.wasm.getFftLength();
    const realPtr = this.wasm.expnRealDataPtr();
    const imagPtr = this.wasm.expnImagDataPtr();
    new Float32Array(this.wasm.memory.buffer, realPtr, 2 * len).set(real);
    new Float32Array(this.wasm.memory.buffer, imagPtr, 2 * len).set(imag);
    this.wasm.collapseRealFft();
    const outEvenPtr = this.wasm.realDataPtr();
    const outOddPtr = this.wasm.imagDataPtr();
    let e = new Float32Array(this.wasm.memory.buffer, outEvenPtr, len);
    let o = new Float32Array(this.wasm.memory.buffer, outOddPtr, len);
    return [e, o];
  }
}

export function getWasmFft(): WasmFft {
  return new WasmFft(
    new WebAssembly.Instance(fftModule).exports as unknown as FftInterface,
  );
}
