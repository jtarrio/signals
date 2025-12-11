// Copyright 2013 Google Inc. All rights reserved.
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

import { Float32Pool } from "../dsp/buffers.js";
import { makeLowPassKernel } from "../dsp/coefficients.js";
import { FMDemodulator, StereoSeparator } from "../dsp/demodulators.js";
import { Deemphasis, FIRFilter, FrequencyShifter } from "../dsp/filters.js";
import { getPower } from "../dsp/power.js";
import { ComplexDownsampler, RealDownsampler } from "../dsp/resamplers.js";
import { Configurator, Demod, Demodulated } from "./modes.js";

/** Mode parameters for WBFM. */
export type ModeWBFM = { scheme: "WBFM"; stereo: boolean };

/** Mode options for WBFM. */
export type OptionsWBFM = {
  /**
   * The time constant for the deemphasizer, in microseconds. 50 by default.
   *
   * This should be 75 for the US and South Korea, 50 everywhere else.
   */
  deemphasizerTc?: number;
};

/** A demodulator for wideband FM signals. */
export class DemodWBFM implements Demod<ModeWBFM> {
  /**
   * @param inRate The sample rate of the input samples.
   * @param outRate The sample rate of the output samples.
   * @param mode The mode to use initially.
   * @param options Options for the demodulator.
   */
  constructor(
    inRate: number,
    outRate: number,
    private mode: ModeWBFM,
    options?: OptionsWBFM
  ) {
    let interRate = Math.min(inRate, 336000);
    this.stage1 = new DemodWBFMStage1(inRate, interRate, mode);
    this.stage2 = new DemodWBFMStage2(interRate, outRate, mode, options);
  }

  private stage1: DemodWBFMStage1;
  private stage2: DemodWBFMStage2;

  getMode(): ModeWBFM {
    return this.mode;
  }

  setMode(mode: ModeWBFM) {
    this.mode = mode;
    this.stage1.setMode(mode);
    this.stage2.setMode(mode);
  }

  /**
   * Demodulates the signal.
   * @param samplesI The I components of the samples.
   * @param samplesQ The Q components of the samples.
   * @param freqOffset The offset of the signal in the samples.
   * @returns The demodulated audio signal.
   */
  demodulate(
    samplesI: Float32Array,
    samplesQ: Float32Array,
    freqOffset: number
  ): Demodulated {
    let o1 = this.stage1.demodulate(samplesI, samplesQ, freqOffset);
    let o2 = this.stage2.demodulate(o1.left);

    o2.snr = o1.snr;
    return o2;
  }
}

/**
 * First stage demodulator for wideband FM signals.
 * Returns the raw demodulated FM signal, with stereo pilot, difference signal and RDS, if they exist.
 * The output is duplicated in the left and right channels.
 */
export class DemodWBFMStage1 implements Demod<ModeWBFM> {
  /**
   * @param inRate The sample rate of the input samples.
   * @param outRate The sample rate of the output audio.
   * @param mode The mode to use initially.
   */
  constructor(inRate: number, private outRate: number, private mode: ModeWBFM) {
    const maxF = 75000;
    this.shifter = new FrequencyShifter(inRate);
    if (inRate != outRate) {
      this.downsampler = new ComplexDownsampler(inRate, outRate, 151);
    }
    const kernel = makeLowPassKernel(outRate, maxF, 151);
    this.filterI = new FIRFilter(kernel);
    this.filterQ = new FIRFilter(kernel);
    this.demodulator = new FMDemodulator(maxF / outRate);
  }

  private shifter: FrequencyShifter;
  private downsampler?: ComplexDownsampler;
  private filterI: FIRFilter;
  private filterQ: FIRFilter;
  private demodulator: FMDemodulator;

  getMode(): ModeWBFM {
    return this.mode;
  }

  setMode(mode: ModeWBFM) {
    this.mode = mode;
  }

  /**
   * Demodulates the signal.
   * @param samplesI The I components of the samples.
   * @param samplesQ The Q components of the samples.
   * @param freqOffset The offset of the signal in the samples.
   * @returns The demodulated audio signal.
   */
  demodulate(
    samplesI: Float32Array,
    samplesQ: Float32Array,
    freqOffset: number
  ): Demodulated {
    this.shifter.inPlace(samplesI, samplesQ, -freqOffset);
    let [I, Q] = this.downsampler
      ? this.downsampler.downsample(samplesI, samplesQ)
      : [samplesI, samplesQ];
    let allPower = getPower(I, Q);
    this.filterI.inPlace(I);
    this.filterQ.inPlace(Q);
    let signalPower = (getPower(I, Q) * this.outRate) / 150000;
    this.demodulator.demodulate(I, Q, I);
    return {
      left: I,
      right: new Float32Array(I),
      stereo: false,
      snr: signalPower / allPower,
    };
  }
}

/**
 * Second stage demodulator for wideband FM signals.
 * Takes the output of stage 1 and does stereo extraction.
 * Only the I channel is used; Q channel is ignored.
 * */
export class DemodWBFMStage2 implements Demod<ModeWBFM> {
  /**
   * @param inRate The sample rate of the input samples.
   * @param outRate The sample rate of the output audio.
   * @param mode The mode to use initially.
   * @param options Options for the demodulator.
   */
  constructor(
    inRate: number,
    outRate: number,
    private mode: ModeWBFM,
    options?: OptionsWBFM
  ) {
    const pilotF = 19000;
    const deemphTc =
      (options?.deemphasizerTc === undefined ? 50 : options.deemphasizerTc) /
      1e6;
    const filterF = Math.min(15000, outRate / 2);
    const kernel = makeLowPassKernel(inRate, filterF, 41, 1 / 0.45);
    this.monoSampler = new RealDownsampler(inRate, outRate, kernel);
    this.stereoSampler = new RealDownsampler(inRate, outRate, kernel);
    this.stereoSeparator = new StereoSeparator(inRate, pilotF);
    this.leftDeemph = new Deemphasis(outRate, deemphTc);
    this.rightDeemph = new Deemphasis(outRate, deemphTc);
    this.outPool = new Float32Pool(2, 1024);
  }

  private monoSampler: RealDownsampler;
  private stereoSampler: RealDownsampler;
  private stereoSeparator: StereoSeparator;
  private leftDeemph: Deemphasis;
  private rightDeemph: Deemphasis;
  private outPool: Float32Pool;

  getMode(): ModeWBFM {
    return this.mode;
  }

  setMode(mode: ModeWBFM) {
    this.mode = mode;
  }

  /**
   * Demodulates the signal.
   * @param samplesI The I components of the samples.
   * @returns The demodulated audio signal.
   */
  demodulate(samplesI: Float32Array): Demodulated {
    let audio = this.monoSampler.downsample(samplesI);

    if (this.mode.stereo) {
      const stereo = this.stereoSeparator.separate(samplesI);
      if (stereo.found) {
        const diffAudio = this.stereoSampler.downsample(stereo.diff);
        let leftAudio = this.outPool.get(audio.length);
        let rightAudio = audio;
        for (let i = 0; i < diffAudio.length; ++i) {
          leftAudio[i] = (audio[i] - diffAudio[i]) / 2;
          rightAudio[i] = (audio[i] + diffAudio[i]) / 2;
        }
        this.leftDeemph.inPlace(leftAudio);
        this.rightDeemph.inPlace(rightAudio);
        return {
          left: leftAudio,
          right: rightAudio,
          stereo: true,
          snr: 1,
        };
      }
    }

    this.leftDeemph.inPlace(audio);
    return {
      left: audio,
      right: new Float32Array(audio),
      stereo: false,
      snr: 1,
    };
  }
}

/** Configurator for the WBFM mode. */
export class ConfigWBFM extends Configurator<ModeWBFM> {
  constructor(mode: ModeWBFM | string) {
    super(mode);
  }
  protected create(): ModeWBFM {
    return { scheme: "WBFM", stereo: true };
  }
  hasStereo(): boolean {
    return true;
  }
  getStereo(): boolean {
    return this.mode.stereo;
  }
  setStereo(stereo: boolean): ConfigWBFM {
    this.mode = { ...this.mode, stereo: stereo };
    return this;
  }
  getBandwidth(): number {
    return 150000;
  }
}
