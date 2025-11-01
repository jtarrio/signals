# _Demodulator_

Demodulate radio signals from your JavaScript or TypeScript application.

## What is this

This is a library that provides functions to receive or generate radio signals, demodulate them, and play the result through the computer's speakers or headphones.

<!-- This library powers Radio Receiver, my browser-based SDR application, which you can try at [radio.ea1iti.es](https://radio.ea1iti.es). -->

## How to install

```shell
npm install @jtarrio/demodulator
```

## How to use

See [the `docs` directory](docs/README.md) for the documentation, or check out the following examples.

### The Radio API (demodulate and play through the computer's speakers)

This program generates an AM signal, demodulates it, and plays it through the computer's speakers.

```typescript
import { Demodulator } from "@jtarrio/demodulator/demod/demodulator.js";
import { getMode } from "@jtarrio/demodulator/demod/modes.js";
import { Radio } from "@jtarrio/demodulator/radio.js";
import { modulateAM, tone } from "@jtarrio/demodulator/sources/generators.js";
import { SimpleProvider } from "@jtarrio/demodulator/sources/provider.js";
import { RealTimeSource } from "@jtarrio/demodulator/sources/realtime.js";

// Create the source, demodulator, and radio and connect them.
let source = new RealTimeSource(modulateAM(810000, 0.1, tone(600, 0.5)));
let demodulator = new Demodulator();
let radio = new Radio(new SimpleProvider(source), demodulator);

radio.setFrequency(810000);
demodulator.setVolume(1);
demodulator.setMode(getMode("AM"));

document
  .getElementById("playButton")
  .addEventListener("click", () => radio.start());
document
  .getElementById("stopButton")
  .addEventListener("click", () => radio.stop());
```

You can also see a full example at [`examples/highlevel`](examples/highlevel/script.js).

## Acknowledgements

This is a spinoff of https://github.com/jtarrio/webrtlsdr, itself a spinoff of https://github.com/jtarrio/radioreceiver, which is, in turn, a fork of https://github.com/google/radioreceiver. (I am the original author, but I was employed by Google at the time.)
