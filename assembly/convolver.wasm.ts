const PAGESIZE: u32 = 65536;
const SAMPLESIZE: u32 = Float32Array.BYTES_PER_ELEMENT;
const VECSIZE: u32 = sizeof<v128>();
const SAMPLES_PER_VEC: u32 = VECSIZE / SAMPLESIZE;

var numCoefs: u32 = 0;
var numCoefsV: u32 = 0;
var coefGroups: u32 = 0;
var numInputSamples: u32 = 0;
var numOutputSamples: u32 = 0;

// Returns a pointer to the coefficients.
@inline()
function getCoefsPtr(): usize {
  return __heap_base;
}

// Returns a pointer to the input data.
@inline()
function getInDataPtr(): usize {
  return getCoefsPtr() + numCoefs * coefGroups * SAMPLESIZE;
}

// Returns a pointer to the output data.
@inline()
function getOutDataPtr(): usize {
  return getInDataPtr() + numInputSamples * SAMPLESIZE;
}

// Makes sure there's enough memory for coefficients and data.
function ensureSize(): i32 {
  let end = getOutDataPtr() + numOutputSamples * SAMPLESIZE;
  let pages = i32((end + PAGESIZE - 1) / PAGESIZE);
  if (memory.size() < pages) {
    return memory.grow(pages - memory.size());
  }
  return 0;
}

// Reserves space for several `groups` of `num` coefficients each and returns a pointer to the coefficients.
export function coefsPtr(num: u32, groups: u32): isize {
  numCoefs = num;
  numCoefsV = select(
    numCoefs - (SAMPLES_PER_VEC - 1),
    0,
    numCoefs >= SAMPLES_PER_VEC,
  );
  coefGroups = groups;
  if (ensureSize() < 0) {
    return -1;
  }
  return getCoefsPtr();
}

// Reserves space for `num` samples and returns a pointer to the sample data.
export function dataPtr(num: u32): isize {
  numInputSamples = num;
  if (ensureSize() < 0) {
    return -1;
  }
  return getInDataPtr();
}

// Reserves space for `num` samples and returns a pointer to the output data.
function outDataPtr(num: u32): isize {
  numOutputSamples = num;
  if (ensureSize() < 0) {
    return -1;
  }
  return getOutDataPtr();
}

// Executes a convolution of the first `num` samples in the data buffer.
export function convolve(num: u32): isize {
  let outPtr = outDataPtr(num);
  if (outPtr < 0) return -1;

  let pi: usize = getInDataPtr();
  let po = outPtr;
  let pc = getCoefsPtr();

  for (let s: u32 = 0; s < num; ++s) {
    convolveSample(pi, pc, po);
    po += SAMPLESIZE;
    pi += SAMPLESIZE;
  }
  return outPtr;
}

// Executes a convolution of samples in the data buffer.
// One sample is convolved every `stride` samples, starting on sample number `offset`,
// until `num` samples have been output.
export function convolveWithStride(num: u32, stride: u32, offset: u32): isize {
  let outPtr = outDataPtr(num);
  if (outPtr < 0) return -1;

  let pi: usize = getInDataPtr() + offset * SAMPLESIZE;
  let po = outPtr;
  let pc = getCoefsPtr();

  for (let s: u32 = 0; s < num; ++s) {
    convolveSample(pi, pc, po);
    po += SAMPLESIZE;
    pi += usize(SAMPLESIZE) * stride;
  }
  return outPtr;
}

// Executes a convolution of the first `num` samples in the data buffer,
// outputting one sample per coefficient group.
export function convolveExpanding(num: u32): isize {
  let outPtr = outDataPtr(num * coefGroups);
  if (outPtr < 0) return -1;

  let pi: usize = getInDataPtr();
  let po = outPtr;

  for (let s: u32 = 0; s < num; ++s) {
    convolveSampleExpanding(pi, po);
    po += SAMPLESIZE * coefGroups;
    pi += SAMPLESIZE;
  }
  return outPtr;
}

// Equivalent to executing `convolveExpanding` and then picking one output sample every `stride` samples,
// starting on sample number `offset`, until `num` samples have been output.
export function convolveExpandingWithStride(
  num: u32,
  stride: u32,
  offset: u32,
): isize {
  let outPtr = outDataPtr(num * coefGroups);
  if (outPtr < 0) return -1;

  let pi: usize = getInDataPtr();
  let po = outPtr;
  let pc = getCoefsPtr();
  let group = offset;

  while (group >= coefGroups) {
    group -= coefGroups;
    pi += SAMPLESIZE;
  }

  for (let s: u32 = 0; s < num; ++s) {
    convolveSample(pi, pc + numCoefs * group * SAMPLESIZE, po);
    po += SAMPLESIZE;
    group += stride;
    while (group >= coefGroups) {
      group -= coefGroups;
      pi += SAMPLESIZE;
    }
  }
  return outPtr;
}

@inline()
function convolveSample(inPtr: usize, coefPtr: usize, outPtr: usize): usize {
  let pc = coefPtr;
  let pi = inPtr;
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
  store<f32>(outPtr, out);
  return pc;
}

@inline()
function convolveSampleExpanding(inPtr: usize, outPtr: usize): void {
  let po = outPtr;
  let pc = getCoefsPtr();
  for (let g: u32 = 0; g < coefGroups; ++g) {
    pc = convolveSample(inPtr, pc, po);
    po += SAMPLESIZE;
  }
}
