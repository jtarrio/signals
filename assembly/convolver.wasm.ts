const PAGESIZE = 65536;
const SAMPLESIZE = Float32Array.BYTES_PER_ELEMENT;
const VECSIZE = sizeof<v128>();
const SAMPLES_PER_VEC = VECSIZE / SAMPLESIZE;

var numCoefs: usize = 0;
var numSamples: usize = 0;

// Makes sure there's enough memory for coefficients and data.
function ensureSize(): usize {
  let end = __heap_base + (numCoefs + numSamples) * SAMPLESIZE;
  let pages = i32((end + PAGESIZE - 1) / PAGESIZE);
  if (memory.size() < pages) {
    return memory.grow(pages - memory.size());
  }
  return 0;
}

// Reserves space for `num` coefficients and returns the base address for coefficients.
export function coefsPtr(num: usize): usize {
  numCoefs = num;
  if (ensureSize() < 0) {
    return -1;
  }
  return __heap_base;
}

// Reserves space for `num` samples and returns the base address for sample data.
export function dataPtr(num: usize): usize {
  numSamples = num;
  if (ensureSize() < 0) {
    return -1;
  }
  return __heap_base + numCoefs * SAMPLESIZE;
}

// Executes a convolution of the samples in the data buffer, outputting `num` samples in the same buffer.
export function convolve(num: usize): void {
  let po = __heap_base + numCoefs * SAMPLESIZE;

  let numCoefsV = select(
    numCoefs - (SAMPLES_PER_VEC - 1),
    0,
    numCoefs >= SAMPLES_PER_VEC,
  );
  for (let s: usize = 0; s < num; ++s) {
    let pi = po;
    let pc = __heap_base;
    let out: f32 = 0;
    let i: usize = 0;
    if (i < numCoefsV) {
      let vo = v128.splat<f32>(0);
      do {
        vo = v128.relaxed_madd<f32>(v128.load(pc), v128.load(pi), vo);
        pc += VECSIZE;
        pi += VECSIZE;
        i += SAMPLES_PER_VEC;
      } while (i < numCoefsV);
      out +=
        v128.extract_lane<f32>(vo, 0) +
        v128.extract_lane<f32>(vo, 1) +
        v128.extract_lane<f32>(vo, 2) +
        v128.extract_lane<f32>(vo, 3);
    }
    while (i < numCoefs) {
      out += load<f32>(pc) * load<f32>(pi);
      pc += SAMPLESIZE;
      pi += SAMPLESIZE;
      i++;
    }
    store<f32>(po, out);
    po += SAMPLESIZE;
  }
}
