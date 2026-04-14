import { dataPtr } from "./convolver.wasm";

const PAGESIZE: u32 = 65536;
const SAMPLESIZE: u32 = Float32Array.BYTES_PER_ELEMENT;
const VECSIZE: u32 = sizeof<v128>();
const SAMPLES_PER_VEC: u32 = VECSIZE / SAMPLESIZE;

var fftLength: u32 = 0;
var numCoefs: u32 = 0;
var expnFft: bool = false;

/*

Memory map:

__heap_base:
    4 real coefficients, 4 imaginary coefficients
__heap_base + 8 * SAMPLE_SIZE:
    8 real coefficients, 8 imaginary coefficients
__heap_base + 24 * SAMPLE_SIZE:
    16 real coefficients, 16 imaginary coefficients
__heap_base + 56 * SAMPLE_SIZE:
    32 real coefficients, 32 imaginary coefficients
    ...
__heap_base + (fftLength - 8) * SAMPLE_SIZE:
    fftLength/2 real coefficients, fftLength/2 imaginary coefficients
    (total of fftLength-4 real coefs, fftLength-4 imag coefs)
__heap_base + (2 * fftLength - 8) * SAMPLE_SIZE:
real_data_ptr:
    fftLength real samples
imag_data_ptr:
    fftLength imaginary samples
[if expnFft is true]
expn_coefs_ptr:
    fftLength real Coefficients, fftLength imaginary coefficients
expn_real_data_ptr:
    2 * fftLength real samples
expn_imag_data_ptr:
    2 * fftLength imaginary samples
*/

export function getFftLength(): i32 {
  return fftLength;
}

// Makes sure there's enough memory for coefficients and data.
function ensureSize(): i32 {
  let end = endOfData();
  let pages = i32((end + PAGESIZE - 1) / PAGESIZE);
  if (memory.size() < pages) {
    return memory.grow(pages - memory.size());
  }
  return 0;
}

// Returns a pointer to the coefficients.
// @inline()
function getCoefsPtr(): usize {
  return __heap_base;
}

// Reserves space for `num` coefficients.
export function coefsPtr(num: u32): isize {
  numCoefs = num;
  fftLength = num / 2 + 4;
  if (ensureSize() < 0) {
    return -1;
  }
  return getCoefsPtr();
}

// Returns a pointer to the real sample data.
// @inline()
export function realDataPtr(): usize {
  return getCoefsPtr() + numCoefs * SAMPLESIZE;
}

// Returns a pointer to the imaginary sample data.
// @inline()
export function imagDataPtr(): usize {
  return realDataPtr() + fftLength * SAMPLESIZE;
}

// Reserves space for the expanding coefficients.
export function expnCoefsPtr(): isize {
  expnFft = true;
  if (ensureSize() < 0) {
    return -1;
  }
  return getExpnCoefsPtr();
}

// Returns a pointer to the expanding coefficients.
// @inline()
function getExpnCoefsPtr(): usize {
  return imagDataPtr() + fftLength * SAMPLESIZE;
}

// Returns a pointer to the real expanded data.
// @inline()
export function expnRealDataPtr(): usize {
  return getExpnCoefsPtr() + select(2 * fftLength * SAMPLESIZE, 0, expnFft);
}

// Returns a pointer to the imaginary expanded data.
// @inline()
export function expnImagDataPtr(): usize {
  return expnRealDataPtr() + select(2 * fftLength * SAMPLESIZE, 0, expnFft);
}

// Returns a pointer to the end of data
// @inline()
function endOfData(): usize {
  return expnImagDataPtr() + select(2 * fftLength * SAMPLESIZE, 0, expnFft);
}

// Fast Fourier Transform core
export function fft(reverse: bool): void {
  const s = select<f32>(-1, 1, reverse);
  const vs = v128.splat<f32>(s);
  const real = realDataPtr();
  const imag = imagDataPtr();

  for (let dftStart: u32 = 0; dftStart < fftLength; dftStart += 4) {
    const n0 = dftStart;
    const n1 = dftStart + 1;
    const n2 = dftStart + 2;
    const n3 = dftStart + 3;
    const a0 = load<f32>(real + n0 * SAMPLESIZE);
    const a1 = load<f32>(real + n1 * SAMPLESIZE);
    const a2 = load<f32>(real + n2 * SAMPLESIZE);
    const a3 = load<f32>(real + n3 * SAMPLESIZE);
    const b0 = load<f32>(imag + n0 * SAMPLESIZE);
    const b1 = load<f32>(imag + n1 * SAMPLESIZE);
    const b2 = load<f32>(imag + n2 * SAMPLESIZE);
    const b3 = load<f32>(imag + n3 * SAMPLESIZE);
    store<f32>(real + n0 * SAMPLESIZE, a0 + a1 + a2 + a3);
    store<f32>(real + n1 * SAMPLESIZE, a0 - a1 - s * (b3 - b2));
    store<f32>(real + n2 * SAMPLESIZE, a0 + a1 - a2 - a3);
    store<f32>(real + n3 * SAMPLESIZE, a0 - a1 + s * (b3 - b2));
    store<f32>(imag + n0 * SAMPLESIZE, b0 + b1 + b2 + b3);
    store<f32>(imag + n1 * SAMPLESIZE, b0 - b1 - s * (a2 - a3));
    store<f32>(imag + n2 * SAMPLESIZE, b0 + b1 - b2 - b3);
    store<f32>(imag + n3 * SAMPLESIZE, b0 - b1 + s * (a2 - a3));
  }

  for (let dftSize: u32 = 8; dftSize <= fftLength; dftSize *= 2) {
    const halfDftSize = dftSize / 2;
    const realCoefPtr: usize = getCoefsPtr() + (dftSize - 8) * SAMPLESIZE;
    const imagCoefPtr: usize = realCoefPtr + halfDftSize * SAMPLESIZE;

    for (let dftStart: u32 = 0; dftStart < fftLength; dftStart += dftSize) {
      let realCoef = realCoefPtr;
      let imagCoef = imagCoefPtr;
      let realNear = real + dftStart * SAMPLESIZE;
      let imagNear = imag + dftStart * SAMPLESIZE;
      let realFar = realNear + halfDftSize * SAMPLESIZE;
      let imagFar = imagNear + halfDftSize * SAMPLESIZE;
      for (let i: u32 = 0; i < halfDftSize; i += SAMPLES_PER_VEC) {
        const cr = v128.load(realCoef);
        const ci = v128.mul<f32>(v128.load(imagCoef), vs);

        const evenReal = v128.load(realNear);
        const or = v128.load(realFar);
        const evenImag = v128.load(imagNear);
        const oi = v128.load(imagFar);
        const oddReal = v128.sub<f32>(
          v128.mul<f32>(cr, or),
          v128.mul<f32>(ci, oi),
        );
        const oddImag = v128.add<f32>(
          v128.mul<f32>(cr, oi),
          v128.mul<f32>(ci, or),
        );
        v128.store(realNear, v128.add<f32>(evenReal, oddReal));
        v128.store(realFar, v128.sub<f32>(evenReal, oddReal));
        v128.store(imagNear, v128.add<f32>(evenImag, oddImag));
        v128.store(imagFar, v128.sub<f32>(evenImag, oddImag));
        realCoef += VECSIZE;
        imagCoef += VECSIZE;
        realNear += VECSIZE;
        imagNear += VECSIZE;
        realFar += VECSIZE;
        imagFar += VECSIZE;
      }
    }
  }
}

// After an even/odd real FFT, expands the result into a full FFT.
export function expandRealFft(): void {
  const len = 2 * fftLength;
  const hlen = fftLength;
  let pcr = getExpnCoefsPtr();
  let pci = pcr + fftLength * SAMPLESIZE;
  let ilr = realDataPtr();
  let ihr = ilr + (hlen - 1) * SAMPLESIZE;
  let ili = imagDataPtr();
  let ihi = ili + (hlen - 1) * SAMPLESIZE;
  let olr = expnRealDataPtr();
  let ohr = olr + (len - 1) * SAMPLESIZE;
  let oli = expnImagDataPtr();
  let ohi = oli + (len - 1) * SAMPLESIZE;

  const lr = load<f32>(ilr);
  const li = load<f32>(ili);
  store<f32>(olr, (lr + li) * 0.5);
  store<f32>(oli, 0);
  store<f32>(olr + hlen * SAMPLESIZE, (lr - li) * 0.5);
  store<f32>(oli + hlen * SAMPLESIZE, 0);
  pcr += SAMPLESIZE;
  pci += SAMPLESIZE;
  ilr += SAMPLESIZE;
  ili += SAMPLESIZE;
  olr += SAMPLESIZE;
  oli += SAMPLESIZE;

  for (let i: u32 = 1; i < hlen; ++i) {
    const cr = load<f32>(pcr);
    const ci = load<f32>(pci);
    const lr = load<f32>(ilr);
    const hr = load<f32>(ihr);
    const li = load<f32>(ili);
    const hi = load<f32>(ihi);
    const sr = lr + hr;
    const si = li - hi;
    const dr = lr - hr;
    const di = li + hi;
    const xr = (sr + cr * di + ci * dr) * 0.25;
    const xi = (si - cr * dr + ci * di) * 0.25;
    store<f32>(olr, xr);
    store<f32>(oli, xi);
    store<f32>(ohr, xr);
    store<f32>(ohi, -xi);
    pcr += SAMPLESIZE;
    pci += SAMPLESIZE;
    ilr += SAMPLESIZE;
    ili += SAMPLESIZE;
    ihr -= SAMPLESIZE;
    ihi -= SAMPLESIZE;
    olr += SAMPLESIZE;
    oli += SAMPLESIZE;
    ohr -= SAMPLESIZE;
    ohi -= SAMPLESIZE;
  }
}

// Collapses an FFT of a real signal into an even/odd FFT.
export function collapseRealFft(): void {
  const hlen = fftLength;
  let pcr = getExpnCoefsPtr();
  let pci = pcr + fftLength * SAMPLESIZE;
  let ilr = expnRealDataPtr();
  let ihr = ilr + (hlen - 1) * SAMPLESIZE;
  let ili = expnImagDataPtr();
  let ihi = ili + (hlen - 1) * SAMPLESIZE;
  let olr = realDataPtr();
  let oli = imagDataPtr();

  const lr = load<f32>(ilr);
  const hr = load<f32>(ilr + hlen * SAMPLESIZE);
  store<f32>(olr, lr + hr);
  store<f32>(oli, lr - hr);
  pcr += SAMPLESIZE;
  pci += SAMPLESIZE;
  ilr += SAMPLESIZE;
  ili += SAMPLESIZE;
  olr += SAMPLESIZE;
  oli += SAMPLESIZE;

  for (let i: u32 = 1; i < hlen; ++i) {
    const cr = load<f32>(pcr);
    const ci = load<f32>(pci);
    const lr = load<f32>(ilr);
    const hr = load<f32>(ihr);
    const li = load<f32>(ili);
    const hi = load<f32>(ihi);
    const sr = lr + hr;
    const si = li - hi;
    const dr = lr - hr;
    const di = li + hi;
    store<f32>(olr, sr - cr * di + ci * dr);
    store<f32>(oli, si + cr * dr + ci * di);
    pcr += SAMPLESIZE;
    pci += SAMPLESIZE;
    ilr += SAMPLESIZE;
    ili += SAMPLESIZE;
    ihr -= SAMPLESIZE;
    ihi -= SAMPLESIZE;
    olr += SAMPLESIZE;
    oli += SAMPLESIZE;
  }
}
