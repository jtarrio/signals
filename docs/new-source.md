# Creating new signal sources

The Radio API uses an implementation of [`SignalSource`](../src/radio/signal_source.ts) to receive the radio signals that need to be demodulated.

If there isn't a [`SignalSource`](../src/radio/signal_source.ts) implementation for the source you want to use, you will need to write one.

## The `SignalSource` interface

Implementations of [`SignalSource`](../src/radio/signal_source.ts) must have the following characteristics:

- Samples are captured at a given _sample rate_. The Radio API always asks the signal source to use a particular sample rate, but the signal source can decide to use a different rate. (For example, a signal source that replays a recorded file will always use the file's sample rate.)
- The signal source is tuned on a particular _center frequency_ and receives samples on a band of frequencies that is centered on that frequency. The Radio API can ask the signal source to tune to a different center frequency, but the signal source can decide which frequency to tune into. (For example, if the source uses channelized frequencies, it could choose to use the closest valid frequency. As another example, if the source is replaying a recorded file, it may always use the original frequency.)
- The signal source may have one or more _parameters_, which control source-specific settings. (For example, a radio receiver may have a "gain" parameter.)
- The signal source is a _pull source_: the Radio API calls its `readSamples()` method periodically to get a new block of samples. (The opposite would be a "push source", where the Radio API would subscribe to an event and the signal source would trigger that event automatically whenever new samples became available.)

The [`SignalSource`](../src/radio/signal_source.ts) interface contains the following methods:

- `setSampleRate(sampleRate: number): Promise<number>` --- sets the wanted sample rate for the source and returns the actual sample rate, which may be different. This function will always be called before `startReceiving()`.
- `setCenterFrequency(freq: number): Promise<number>` --- sets the center frequency that the source is tuned into and returns the actual center frequency, which may be different.
- `setParameter<V>(name: string, value: any): Promise<V>` --- sets the value of a parameter, returning the actual value or undefined if the parameter is not settable.
- `startReceiving(): Promise<void>` --- prepares the source to start streaming samples. This function must be called before the first call to `readSamples()`.
- `readSamples(length: number): Promise<SampleBlock>` --- requests a block with the given number of samples, and returns the block when ready. There may be several reads in flight, and they will be resolved in the same order that they were issued.
- `close()` --- stops receiving samples and shuts down the signal source.

A [`SampleBlock`](../src/radio/sample_block.ts) is an object with the following fields:

- `I` (`Float32Array`) --- the I components of the samples.
- `Q` (`Float32Array`) --- the Q components of the samples.
- `frequency` (`number`) --- the center frequency that the source was tuned into when these samples were received.
- `data` (`object`) --- optional extra data provided by the source.

The arrays stored in the `I` and `Q` must have the same length, and each element of `I`, together with the element of `Q` with the same index, form an I/Q sample.

If your [`SignalSource`](../src/radio/signal_source.ts) implementation requires special initialization, you may also need to implement the [`SignalSourceProvider`](../src/radio/signal_source.ts) interface, which contains a `get()` method that returns a [`SignalSource`](../src/radio/signal_source.ts) instance.

## Implementing `SignalSource`

Your implementation of [`SignalSource`](../src/radio/signal_source.ts) is an intermediary between the Radio API and your actual source.

There are three general strategies for building an implementation, and the strategy you choose will depend on how your actual source works:

- For a "pull" source that works in real time (for example, an RTL-SDR dongle), you would generally build a straight implementation of `SignalSource`.
- For a "pull" source that does not work in real time (for example, reading from a file), you would generally use the [`RealTimeSource`](../src/sources/realtime.ts) class to help you build your `SignalSource`.
- For a "push" source (for example, receiving audio samples via the Web Audio API), you would generally use the [`PushSource`](../src/sources/push.ts) class to help you build your `SignalSource`.

### Straight implementation of the `SignalSource` interface

You would do this when your original source is a "pull" source that works in real time. In other words: there is a method you can call to request a block of samples, and you get blocks of samples at the speed of the sample rate.

The following example shows a minimal implementation of `SignalSource` for an RTL-SDR dongle:

```typescript
/** SignalSource that reads from an RTL-SDR device. */
export class RtlSource implements SignalSource {
  constructor(private rtl: RtlDevice) {
    this.converter = new U8ToFloat32();
  }

  private converter: U8ToFloat32;

  setSampleRate(sampleRate: number): Promise<number> {
    return this.rtl.setSampleRate(sampleRate);
  }

  setCenterFrequency(freq: number): Promise<number> {
    return this.rtl.setCenterFrequency(freq);
  }

  setParameter<V>(parameter: string, value: V): Promise<void | V> {
    switch (parameter) {
      case "bias_tee":
        return this.rtl.enableBiasTee(value as boolean);
      case "direct_sampling_method":
        return this.rtl.setDirectSamplingMethod(value as DirectSampling);
      case "frequency_correction":
        return this.rtl.setFrequencyCorrection(value as number);
      case "gain":
        return this.rtl.setGain(value as number | null);
    }
  }

  startReceiving(): Promise<void> {
    return this.rtl.resetBuffer();
  }

  async readSamples(length: number): Promise<SampleBlock> {
    let block = await this.rtl.readSamples(length);
    let iq = this.converter.convert(block.data);
    return {
      I: iq[0],
      Q: iq[1],
      frequency: block.frequency,
      data: { directSampling: block.directSampling },
    };
  }

  close(): Promise<void> {
    return this.rtl.close();
  }
}
```

### Using the `RealTimeSource` class

If your source is a "pull" source but it returns samples faster than the sample rate (for example, it reads them from a file), the previous approach wouldn't work, because the calls to `readSamples()` would return immediately and would create a huge backlog of samples in a very short time.

The [`RealTimeSource`](../src/sources/realtime.ts) class can solve this. Its constructor takes a "generator" function that returns a block of samples, and then the class calls the `getSamples()` method at the appropriate rate.

This method takes the following arguments:

- `firstSample` (`number`): the index of the first sample to generate
- `I` (`Float32Array`): the I array to fill
- `Q` (`Float32Array`): the Q array to fill

In the following example, we build a `SignalSource` that returns samples stored in two arrays:

```typescript
class ArraySource extends RealTimeSource {
  constructor(
    private sampleRate: number,
    private srcI: Float32Array,
    private srcQ: Float32Array
  ) {}

  setSampleRate(sampleRate: number): Promise<number> {
    // The sample rate is fixed
    return super.setSampleRate(this.sampleRate);
  }

  getSamples(firstSample: number, I: Float32Array, Q: Float32Array) {
    // Copy from this.srcI to I and this.srcQ to Q
    // starting at `firstSample` until I and Q are full
    let readPos = firstSample % this.srcI.length;
    let writePos = 0;
    let count = I.length;
    while (count > 0) {
      let copy = Math.min(
        count,
        I.length - writePos,
        this.srcI.length - readPos
      );
      I.subarray(writePos, writePos + copy).set(
        this.srcI.subarray(readPos, readPos + copy)
      );
      Q.subarray(writePos, writePos + copy).set(
        this.srcQ.subarray(readPos, readPos + copy)
      );
      readPos = (readPos + copy) % this.srcI.length;
      writePos += copy;
      count -= copy;
    }
  }
}
```

### Using the `PushSource` class

Finally, if your source is a "push" source (which sends samples on its own schedule, not when you request them), you can use the [`PushSource`](../src/sources/push.ts) class to adapt it.

This source has a `pushSamples()` method that you can call whenever you receive new samples from your push source. Those samples will be buffered and used to resolve the promises returned by `readSamples()` calls.

In this example, we build a `SignalSource` that receives data from a WebSocket:

```typescript
export class WebsocketSource extends PushSource {
  constructor(socket: WebSocket) {
    super();
    this.pool = new Float32Pool(2);
    socket.addEventListener("message", (e) => this.receiveData(e.data));
  }

  receiveData(data: ArrayBuffer) {
    let iq = new Float32Array(data);
    let length = iq.length / 2;
    let I = this.pool.get(length);
    let Q = this.pool.get(length);

    for (let i = 0; i < length; ++i) {
      I[i] = iq[i * 2];
      Q[i] = iq[i * 2 + 1];
    }
    this.pushSamples(I, Q);
  }
}
```
