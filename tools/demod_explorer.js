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

/** A page that shows the effect of different filters. */

import * as Coefficients from "../dist/dsp/coefficients.js";
import * as Filters from "../dist/dsp/filters.js";
import * as Resamplers from "../dist/dsp/resamplers.js";
import { FFT } from "../dist/dsp/fft.js";
import {
  getDemod,
  getMode,
  getSchemes,
  modeParameters,
} from "../dist/demod/modes.js";
import "../dist/demod/demodulator.js";
import { tone, modulateAM, modulateFM } from "../dist/sources/generators.js";

const inRate = 1024000;
const outRate = 48000;

function getControls() {
  return {
    scheme: document.getElementById("scheme"),
    input: {
      bandwidth: document.getElementById("bandwidth"),
    },
    responseView: document.getElementById("responseView"),
  };
}

var modes = new Map();

function attachEvents(controls) {
  for (let scheme of getSchemes()) {
    let option = document.createElement("option");
    option.value = scheme;
    option.text = scheme;
    controls.scheme.appendChild(option);
    modes.set(scheme, getMode(scheme));
  }
  updateControls(controls);

  controls.scheme.addEventListener("change", (_) => {
    updateControls(controls);
    updateMode(controls);
  });
  for (const c of Object.values(controls.input)) {
    c.addEventListener("change", (_) => updateMode(controls));
  }

  window.addEventListener("resize", (_) => updateMode(controls));
}

function updateControls(controls) {
  let mode = modes.get(controls.scheme.value);
  let params = modeParameters(mode);
  controls.input.bandwidth.value = params.getBandwidth();
  controls.input.bandwidth.disabled = !params.hasBandwidth();
}

function updateMode(controls) {
  let mode = modes.get(controls.scheme.value);
  let params = modeParameters(mode);
  params.setBandwidth(Number(controls.input.bandwidth.value));
  modes.set(mode.scheme, params.mode);

  drawMode(mode, controls);
}

function drawMode(mode, controls) {
  controls.responseView.width = controls.responseView.clientWidth;
  controls.responseView.height = controls.responseView.clientHeight;
  let width = controls.responseView.width;
  let height = controls.responseView.height;
  let ctx = controls.responseView.getContext("2d");
  ctx.clearRect(0, 0, width, height);
  let top = 20.5;
  let bottom = height - 20.5;
  let left = 0.5;
  let right = width - 0.5;
  const grid = getGrid(left, top, right, bottom, outRate, 80);
  drawAxes(ctx, grid);
  plotDemod(ctx, left, top, right, bottom, outRate, mode);
  drawGrid(ctx, grid);
}

function computeDivisionSize(range, width, minSize, maxSize, divisors) {
  if (!divisors) divisors = [10, 20, 25, 30, 40, 50, 60, 75, 80, 90];
  let maxd = Math.floor(Math.log10(divisors.reduce((p, n) => (p > n ? p : n))));
  const minDivs = Math.ceil(width / maxSize);
  const maxDivs = Math.floor(width / minSize);
  const minDivRange = range / maxDivs;
  const maxDivRange = range / minDivs;
  const wantedDivRange = (minDivRange + maxDivRange) / 2;
  let middlestRange = maxDivRange;
  let middlestDistance = maxDivRange - wantedDivRange;
  let middlestExact = range % maxDivRange == 0;
  for (
    let n = Math.floor(Math.log10(minDivRange)) - maxd;
    maxDivRange >= Math.pow(10, n);
    ++n
  ) {
    for (let mul of divisors) {
      const size = mul * Math.pow(10, n);
      if (size < minDivRange || size > maxDivRange) continue;
      const distance = Math.abs(size - wantedDivRange);
      const exact = range % size == 0;
      const betterFit = distance < middlestDistance;
      if (
        (betterFit && exact) ||
        (betterFit && !middlestExact) ||
        (exact && !middlestExact)
      ) {
        middlestRange = size;
        middlestDistance = distance;
        middlestExact = exact;
      }
    }
  }
  if (middlestRange < 1) middlestRange = 1;
  return { range: middlestRange, size: (width * middlestRange) / range };
}

function getGrid(left, top, right, bottom, sampleRate, range) {
  const mid = Math.floor((right + left) / 2) + 0.5;
  const { size: rangeDivSize, range: rangePerDiv } = computeDivisionSize(
    range,
    bottom - top,
    20,
    60,
  );
  const { size: freqDivSize, range: freqPerDiv } = computeDivisionSize(
    sampleRate / 2,
    Math.floor((right - left) / 2),
    30,
    70,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 16, 32, 64, 128, 256, 512, 1024],
  );
  let out = {
    left,
    right,
    mid,
    top,
    bottom,
    freqWidth: freqDivSize,
    rangeLines: [],
    freqLines: [],
  };
  for (let i = 1; i * rangePerDiv <= range; ++i) {
    let yp = Math.floor(top + i * rangeDivSize) + 0.5;
    let n = -i * rangePerDiv;
    out.rangeLines.push({ y: yp, range: n });
  }

  for (let i = 1; i * freqPerDiv <= sampleRate / 2; ++i) {
    let dx = i * freqDivSize;
    let xp = Math.floor(mid + dx) + 0.5;
    let xm = Math.floor(mid - dx) + 0.5;
    let n = i * freqPerDiv;
    out.freqLines.push({ x: xp, freq: n });
    out.freqLines.push({ x: xm, freq: n });
  }

  return out;
}

function drawGrid(ctx, grid) {
  ctx.beginPath();

  ctx.lineWidth = 1;
  ctx.strokeStyle = "black";
  ctx.fillStyle = "black";
  ctx.setLineDash([4, 4]);
  ctx.textAlign = "right";
  for (let line of grid.rangeLines) {
    ctx.moveTo(grid.left, line.y);
    ctx.lineTo(grid.right, line.y);
    ctx.fillText(line.range.toPrecision(3), grid.mid + 30, line.y - 2);
  }
  for (let line of grid.freqLines) {
    ctx.moveTo(line.x, grid.top);
    ctx.lineTo(line.x, grid.bottom);
  }
  ctx.stroke();
  ctx.beginPath();
  ctx.setLineDash([]);
  ctx.textAlign = "center";
  ctx.moveTo(grid.mid, grid.top - 5);
  ctx.lineTo(grid.mid, grid.top);
  ctx.fillText("DC", grid.mid, grid.top - 10, grid.freqWidth - 10);
  for (let line of grid.freqLines) {
    ctx.moveTo(line.x, grid.top - 5);
    ctx.lineTo(line.x, grid.top);
    ctx.textAlign = line.x < grid.mid ? "left" : "right";
    ctx.fillText(
      String(Math.round(line.freq)),
      line.x,
      grid.top - 10,
      grid.freqWidth - 10,
    );
  }
  ctx.stroke();
}

function drawAxes(ctx, grid) {
  ctx.beginPath();

  ctx.lineWidth = 1;
  ctx.strokeStyle = "black";
  ctx.moveTo(grid.mid, grid.top);
  ctx.lineTo(grid.mid, grid.bottom);

  ctx.moveTo(grid.left, grid.top);
  ctx.lineTo(grid.right, grid.top);
  ctx.stroke();
}

function plotDemod(ctx, left, top, right, bottom, sampleRate, mode) {
  ctx.save();
  ctx.rect(left, top - 200, 1 + right - left, 201 + bottom - top);
  ctx.clip();

  ctx.beginPath();
  ctx.strokeStyle = "#001f9f";
  ctx.lineWidth = 3;

  let spectrum = getSpectrum(mode);
  const xOffset = left - 1;
  const xDiv = 2 + right - left;
  let bins = spectrum.length;
  let binOffset = -bins / 2;
  for (let x = left; x <= right; ++x) {
    const bin =
      (Math.round((bins * (x - xOffset)) / xDiv + binOffset) + bins) % bins;
    const powerDb = spectrum[bin];
    let y = top + (powerDb / -80) * (bottom - top);
    if (x == left) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }

  ctx.stroke();
  ctx.restore();
}

function getSpectrum(mode) {
  switch (mode.scheme) {
    case "WBFM":
      return getSpectrumFor(mode, (signal, rate, I, Q) =>
        modulateFM(0, 75000, 1, signal)(0, rate, 0, I, Q),
      );
    case "NBFM":
      return getSpectrumFor(mode, (signal, rate, I, Q) =>
        modulateFM(0, mode.maxF, 1, signal)(0, rate, 0, I, Q),
      );
    case "AM":
      return getSpectrumFor(mode, (signal, rate, I, Q) =>
        modulateAM(0, 1, signal)(0, rate, 0, I, Q),
      );
    case "USB":
    case "LSB":
    case "CW":
      return getSpectrumFor(mode, (signal, rate, I, Q) =>
        signal(0, rate, 0, I, Q),
      );
    default:
      let o = new Float32Array(2048);
      o.fill(-140);
      return o;
  }
}

function getSpectrumFor(mode, modulate) {
  const bins = 1024;
  let demod = getDemod(inRate, outRate, mode);
  let out = new Float32Array(bins);
  let I = new Float32Array(inRate / 10);
  let Q = new Float32Array(inRate / 10);
  let maxf = mode.scheme === "WBFM" ? 75000 : mode.maxF;
  for (let i = 0; i < bins; ++i) {
    let freq = (i * outRate) / bins;
    if (freq >= outRate / 2) freq -= outRate;
    modulate(tone(freq, 1), inRate, I, Q);
    let d = demod.demodulate(I, Q, 0);
    out[i] = power(d.left);
  }
  return out;
}

function power(output) {
  let out = 0;
  for (let i = output.length / 2; i < output.length; ++i) {
    out += output[i] * output[i];
  }
  return 10 * Math.log10(out / (output.length / 2));
}

function main() {
  let controls = getControls();
  attachEvents(controls);
  updateMode(controls);
}

window.addEventListener("load", main);
