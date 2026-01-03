// Copyright 2024 Jacobo Tarrio Barreiro. All rights reserved.
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

/**
 * A class to orchestrate the sample source, the demodulation process,
 * and the sample receiver, as a "radio" that can be started and stopped at will.
 */

import { RadioError, RadioErrorType } from "../errors.js";
import { SampleBlock } from "./sample_block.js";
import { SampleReceiver } from "./sample_receiver.js";
import { SignalSource, SignalSourceProvider } from "./signal_source.js";
import { SingleThread } from "./single_thread.js";

/** The information in a 'radio' event. */
export type RadioEventType =
  | { type: "started" }
  | { type: "stopped" }
  | { type: "error"; exception: any };

/** The type of 'radio' events. */
export class RadioEvent extends CustomEvent<RadioEventType> {
  constructor(e: RadioEventType) {
    super("radio", { detail: e });
  }
}

/** Current state. */
enum State {
  OFF,
  PLAYING,
}

/** Options for the Radio class. */
export type RadioOptions = {
  /**
   * The number of buffers to process per second.
   *
   * This number controls your processing latency: more buffers per second
   * implies smaller buffers, thus smaller latency. It also increases your
   * CPU requirements, though.
   *
   * The actual number of buffers per second may be slightly different to
   * account for hardware requirements.
   */
  buffersPerSecond?: number;
};

/**
 * Provides controls to play, stop, and tune the radio.
 *
 * The command functions (start, stop, setParameter, etc) return promises that resolve when the
 * corresponding command has been processed. Commands are processed one at a time and in the same order
 * in which they were sent.
 *
 * There is a ready() function that returns a promise that resolves when all the commands sent
 * before the ready() function have been processed. It is useful when a subclass of Radio() sends commands
 * in the constructor, because then the ready() function will only resolve when all those commands
 * have been processed.
 */
export class Radio<ParameterKey extends string = string> extends EventTarget {
  /** @param sampleReceiver the object that will receive the radio samples. */
  constructor(
    private sourceProvider: SignalSourceProvider,
    private sampleReceiver: SampleReceiver,
    private options?: RadioOptions
  ) {
    super();
    this.sampleRate = 1024000;
    this.state = State.OFF;
    this.frequency = 88500000;
    this.parameterValues = new Map();
    this.singleThread = new SingleThread();
  }

  /** Current sample rate. */
  private sampleRate: number;
  /** Current state. */
  private state: State;
  /** Currently tuned frequency. */
  private frequency: number;
  /** Current values of the properties. */
  private parameterValues: Map<ParameterKey, any>;
  /** Single thread to execute async functions. */
  private singleThread: SingleThread;
  /** Handler for in-flight data transfers. */
  private transfers?: Transfers;
  /** Current signal source. */
  private source?: SignalSource;

  /**
   * Starts playing the radio.
   *
   * @returns a promise that resolves after the command has been processed by the radio.
   */
  async start() {
    return this.singleThread.run(async () => {
      if (this.state != State.OFF) return;
      try {
        this.source = await this.sourceProvider.get();
        this.sampleRate = await this.source.setSampleRate(this.sampleRate);
        this.frequency = await this.source.setCenterFrequency(this.frequency);
        for (let [name, value] of this.parameterValues.entries()) {
          await this.source.setParameter(name, value);
        }
        await this.source.startReceiving();
        this.transfers = new Transfers(
          this.source,
          this.sampleReceiver,
          this,
          this.sampleRate,
          this.options
        );
        this.transfers.startStream();
        this.state = State.PLAYING;
        this.dispatchEvent(new RadioEvent({ type: "started" }));
      } catch (e) {
        this.dispatchEvent(new RadioEvent({ type: "error", exception: e }));
      }
    });
  }

  /**
   * Stops playing the radio.
   *
   * @returns a promise that resolves after the command has been processed by the radio.
   */
  async stop() {
    return this.singleThread.run(async () => {
      if (this.state != State.PLAYING) return;
      try {
        await this.transfers!.stopStream();
        await this.source!.close();
        this.state = State.OFF;
        this.dispatchEvent(new RadioEvent({ type: "stopped" }));
      } catch (e) {
        this.dispatchEvent(new RadioEvent({ type: "error", exception: e }));
      }
    });
  }

  /** Returns whether the radio is playing (or scanning). */
  isPlaying() {
    return this.state != State.OFF;
  }

  /**
   * Tunes the radio to this frequency.
   *
   * @returns a promise that resolves after the command has been processed by the radio.
   */
  async setFrequency(freq: number) {
    return this.singleThread.run(async () => {
      if (this.state == State.OFF) {
        this.frequency = freq;
      } else if (this.frequency != freq) {
        try {
          this.frequency = await this.source!.setCenterFrequency(freq);
        } catch (e) {
          this.dispatchEvent(new RadioEvent({ type: "error", exception: e }));
        }
      }
    });
  }

  /** Returns the tuned frequency. */
  getFrequency(): number {
    return this.frequency;
  }

  /**
   * Changes the sample rate. This change only takes effect when the radio is started.
   *
   * @returns a promise that resolves after the command has been processed by the radio.
   */
  async setSampleRate(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /** Returns the current sample rate. */
  getSampleRate(): number {
    return this.sampleRate;
  }

  /**
   * Sets the value of a parameter.
   *
   * @returns a promise that resolves after the command has been processed by the radio.
   */
  async setParameter<V>(parameter: ParameterKey, value: V) {
    return this.singleThread.run(async () => {
      if (this.state == State.OFF) {
        this.parameterValues.set(parameter, value);
      } else {
        try {
          this.parameterValues.set(
            parameter,
            await this.source!.setParameter(parameter, value)
          );
        } catch (e) {
          this.dispatchEvent(new RadioEvent({ type: "error", exception: e }));
        }
      }
    });
  }

  /** Returns the value of a parameter. */
  getParameter(parameter: ParameterKey): any {
    return this.parameterValues.get(parameter);
  }

  /** Override this function to do something when a sample block is received. */
  onReceiveSamples(block: SampleBlock) {}

  addEventListener(
    type: "radio",
    callback: (e: RadioEvent) => void | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void;
  addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions | undefined
  ): void;
  addEventListener(
    type: string,
    callback: any,
    options?: boolean | AddEventListenerOptions | undefined
  ): void {
    super.addEventListener(
      type,
      callback as EventListenerOrEventListenerObject | null,
      options
    );
  }
}

/**
 * Transfer controller.
 *
 * Maintains 2 active transfers. When a transfer ends, it calls
 * the sample receiver's 'receiveSamples' function and starts a new
 * transfer. In this way, there is always a stream of samples coming in.
 */
class Transfers {
  /** Receive this many buffers per second by default. */
  private static DEFAULT_BUFS_PER_SEC = 20;

  constructor(
    private source: SignalSource,
    private sampleReceiver: SampleReceiver,
    private radio: Radio<any>,
    private sampleRate: number,
    options?: RadioOptions
  ) {
    let buffersPerSecond = options?.buffersPerSecond;
    if (buffersPerSecond === undefined || buffersPerSecond <= 0)
      buffersPerSecond = Transfers.DEFAULT_BUFS_PER_SEC;
    this.samplesPerBuf = 512 * Math.ceil(sampleRate / buffersPerSecond / 512);
    this.buffersWanted = 0;
    this.buffersRunning = 0;
    this.stopCallback = Transfers.nilCallback;
  }

  private samplesPerBuf: number;
  private buffersWanted: number;
  private buffersRunning: number;
  private stopCallback: () => void;

  static PARALLEL_BUFFERS = 2;

  /** Starts the transfers as a stream. */
  async startStream() {
    this.sampleReceiver.setSampleRate(this.sampleRate);
    await this.source.startReceiving();
    this.buffersWanted = Transfers.PARALLEL_BUFFERS;
    while (this.buffersRunning < this.buffersWanted) {
      ++this.buffersRunning;
      this.readStream();
    }
  }

  /**
   * Stops the transfer stream.
   * @returns a promise that resolves when the stream is stopped.
   */
  async stopStream(): Promise<void> {
    if (this.buffersRunning == 0 && this.buffersWanted == 0) return;
    let promise = new Promise<void>((r) => {
      this.stopCallback = r;
    });
    this.buffersWanted = 0;
    return promise;
  }

  /** Runs the transfer stream. */
  private async readStream(): Promise<void> {
    try {
      while (this.buffersRunning <= this.buffersWanted) {
        const b = await this.source.readSamples(this.samplesPerBuf);
        this.radio.onReceiveSamples(b);
        this.sampleReceiver.receiveSamples(b);
      }
    } catch (e) {
      let error = new RadioError(
        "Sample transfer was interrupted. Did you unplug your device?",
        RadioErrorType.TransferError,
        { cause: e }
      );
      let event = new RadioEvent({ type: "error", exception: error });
      this.radio.dispatchEvent(event);
    }
    --this.buffersRunning;
    if (this.buffersRunning == 0) {
      this.stopCallback();
      this.stopCallback = Transfers.nilCallback;
    }
  }

  static nilCallback() {}
}
