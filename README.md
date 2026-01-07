# Signals

Demodulate radio signals in real time from your JavaScript or TypeScript application.

## What is this

This is a library that provides functions to receive or generate radio signals, demodulate them, and play the result through the computer's speakers or headphones.

<!-- This library powers Radio Receiver, my browser-based SDR application, which you can try at [radio.ea1iti.es](https://radio.ea1iti.es). -->

## How to install

```shell
npm install @jtarrio/signals
```

## How to use

See [the `docs` directory](docs/README.md) for the documentation, or check out the following example.

### Demodulate and play through the computer's speakers

This program generates an AM signal, demodulates it, and plays it through the computer's speakers.

```typescript
import { Demodulator } from "@jtarrio/signals/demod/demodulator.js";
import { getMode } from "@jtarrio/signals/demod/modes.js";
import { Radio } from "@jtarrio/signals/radio.js";
import { modulateAM, tone } from "@jtarrio/signals/sources/generators.js";
import { SimpleProvider } from "@jtarrio/signals/sources/provider.js";
import { GeneratedSource } from "@jtarrio/signals/sources/generated.js";

// Create the source, demodulator, and radio and connect them.
let source = new GeneratedSource(modulateAM(810000, 0.1, tone(600, 0.5)));
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

You can also see a full example at [`examples/radio`](examples/radio/script.js).

## Acknowledgements

This is a spinoff of https://github.com/jtarrio/webrtlsdr, itself a spinoff of https://github.com/jtarrio/radioreceiver, which is, in turn, a fork of https://github.com/google/radioreceiver, (of which I am the original author, but I was employed by Google at the time.)
