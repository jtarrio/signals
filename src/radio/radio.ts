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
 * State machine to orchestrate the sample source, the demodulation process,
 * and the sample receiver, as a "radio" that can be started and stopped.
 */

import { RadioError, RadioErrorType } from "../errors.js";
import { Channel } from "./msgqueue.js";
import { SampleReceiver } from "./sample_receiver.js";
import {
  SampleBlock,
  SignalSource,
  SignalSourceProvider,
} from "./signal_source.js";

/** A message sent to the state machine. */
type Message<ParameterKey extends string> =
  | { type: "start" }
  | { type: "stop" }
  | { type: "frequency"; value: number }
  | { type: "parameter"; name: ParameterKey; value: any };

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

/** Provides controls to play, stop, and tune the radio. */
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
    this.channel = new Channel<Message<ParameterKey>>();
    this.parameterValues = new Map();
    this.runLoop();
  }

  /** Current sample rate. */
  private sampleRate: number;
  /** Current state. */
  private state: State;
  /** Currently tuned frequency. */
  private frequency: number;
  /** Channel to send messages to the state machine. */
  private channel: Channel<Message<ParameterKey>>;
  /** Current values of the properties. */
  private parameterValues: Map<ParameterKey, any>;

  /** Starts playing the radio. */
  start() {
    this.channel.send({ type: "start" });
  }

  /** Stops playing the radio. */
  stop() {
    this.channel.send({ type: "stop" });
  }

  /** Returns whether the radio is playing (or scanning). */
  isPlaying() {
    return this.state != State.OFF;
  }

  /** Tunes the radio to this frequency. */
  setFrequency(freq: number) {
    this.channel.send({ type: "frequency", value: freq });
  }

  /** Returns the tuned frequency. */
  getFrequency(): number {
    return this.frequency;
  }

  /** Changes the sample rate. This change only takes effect when the radio is started. */
  setSampleRate(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  /** Returns the current sample rate. */
  getSampleRate(): number {
    return this.sampleRate;
  }

  /** Sets the value of a parameter. */
  setParameter<V>(parameter: ParameterKey, value: V) {
    this.channel.send({ type: "parameter", name: parameter, value: value });
  }

  /** Returns the value of a parameter. */
  getParameter(parameter: ParameterKey): any {
    return this.parameterValues.get(parameter);
  }

  /** Override this function to do something when a sample block is received. */
  onReceiveSamples(block: SampleBlock) {}

  /** Runs the state machine. */
  private async runLoop() {
    let transfers: Transfers;
    let source: SignalSource;
    while (true) {
      let msg = await this.channel.receive();
      try {
        switch (this.state) {
          case State.OFF: {
            if (msg.type == "frequency") this.frequency = msg.value;
            if (msg.type == "parameter")
              this.parameterValues.set(msg.name, msg.value);
            if (msg.type != "start") continue;
            source = await this.sourceProvider.get();
            this.sampleRate = await source.setSampleRate(this.sampleRate);
            this.frequency = await source.setCenterFrequency(this.frequency);
            for (let [name, value] of this.parameterValues.entries()) {
              await source.setParameter(name, value);
            }
            await source.startReceiving();
            transfers = new Transfers(
              source,
              this.sampleReceiver,
              this,
              this.sampleRate,
              this.options
            );
            transfers.startStream();
            this.state = State.PLAYING;
            this.dispatchEvent(new RadioEvent({ type: "started" }));
            break;
          }
          case State.PLAYING: {
            switch (msg.type) {
              case "frequency":
                if (this.frequency != msg.value) {
                  this.frequency = await source!.setCenterFrequency(msg.value);
                }
                break;
              case "parameter":
                this.parameterValues.set(
                  msg.name,
                  await source!.setParameter(msg.name, msg.value)
                );
                break;
              case "stop":
                await transfers!.stopStream();
                await source!.close();
                this.state = State.OFF;
                this.dispatchEvent(new RadioEvent({ type: "stopped" }));
                break;
              default:
              // do nothing.
            }
            break;
          }
        }
      } catch (e) {
        this.dispatchEvent(new RadioEvent({ type: "error", exception: e }));
      }
    }
  }

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
        this.sampleReceiver.receiveSamples(b.I, b.Q, b.frequency, b.data);
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
