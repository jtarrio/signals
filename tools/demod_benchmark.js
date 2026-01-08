import {
  getDemod,
  getMode,
  getSchemes,
  modeParameters,
} from "../dist/demod/modes.js";
import "../dist/demod/demodulator.js";

let mode = getMode("WBFM");

function getControls() {
  return {
    scheme: document.getElementById("scheme"),
    sampleRate: document.getElementById("sampleRate"),
    bandwidth: document.getElementById("bandwidth"),
    lblBandwidth: document.getElementById("lblBandwidth"),
    stereo: document.getElementById("stereo"),
    lblStereo: document.getElementById("lblStereo"),
    run: document.getElementById("run"),
    result: document.getElementById("result"),
  };
}

function initialize(controls) {
  for (let scheme of getSchemes()) {
    let option = document.createElement("option");
    option.value = scheme;
    option.textContent = scheme;
    option.selected = scheme === mode.scheme;
    controls.scheme.appendChild(option);
  }
  controls.scheme.addEventListener("change", (_) => {
    updateDemod(controls);
    updateVisibleControls(controls);
  });
  for (const c of Object.values(controls)) {
    c.addEventListener("change", (_) => updateDemod(controls));
  }
  controls.run.addEventListener("click", (_) => run(controls));
}

function updateVisibleControls(controls) {
  controls.bandwidth.hidden = controls.lblBandwidth.hidden = !modeParameters(
    mode
  ).hasBandwidth();
  controls.stereo.hidden = controls.lblStereo.hidden = !modeParameters(
    mode
  ).hasStereo();
}

function updateDemod(controls) {
  mode = modeParameters(controls.scheme.selectedOptions[0].value)
    .setBandwidth(Number(controls.bandwidth.value))
    .setStereo(Boolean(controls.stereo.checked)).mode;
  controls.bandwidth.value = String(modeParameters(mode).getBandwidth());
  controls.stereo.checked = modeParameters(mode).getStereo();
}

function run(controls) {
  const seconds = 10;
  controls.result.hidden = true;
  controls.run.disabled = true;
  setTimeout(() => {
    const sampleRate = Number(controls.sampleRate.value);
    let samplesI = new Float32Array(seconds * sampleRate);
    let samplesQ = new Float32Array(seconds * sampleRate);
    for (let i = 0; i < samplesI.length; ++i) {
      const w = 2 * Math.PI * Math.random();
      const u = Math.random() + Math.random();
      const r = u > 1 ? 2 - u : u;
      samplesI[i] = (Math.cos(w) * r) / 2;
      samplesQ[i] = (Math.sin(w) * r) / 2;
    }

    let scheme = makeScheme(mode, sampleRate);
    const samplesPerBuffer = sampleRate / 20;
    const start = performance.now();
    for (let i = 0; i < samplesI.length; i += samplesPerBuffer) {
      scheme.demodulate(
        samplesI.subarray(i, i + samplesPerBuffer),
        samplesQ.subarray(i, i + samplesPerBuffer),
        sampleRate * 0.1
      );
    }
    const elapsed = performance.now() - start;

    controls.run.disabled = false;
    controls.result.hidden = false;
    controls.result.textContent = `Result: ${twoDig(elapsed / seconds)} ms/s`;
  }, 0);
}

function makeScheme(mode, sampleRate) {
  const outRate = 48000;
  return getDemod(sampleRate, outRate, mode);
}

function twoDig(n) {
  return Math.floor(n * 100) / 100;
}

function main() {
  let controls = getControls();
  initialize(controls);
  updateDemod(controls);
  updateVisibleControls(controls);
}

window.addEventListener("load", main);
