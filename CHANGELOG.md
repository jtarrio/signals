# Change log

## 0.10.2

* `Radio`: Added the ability to change the sample rate and the options while the radio is playing.
* `Radio`: Automatically stop the radio and emit a `stopped` event when a sample transfer error occurs.
* Single thread executor: functions can now throw exceptions.
* `RealTimeSource`: use `setTimeout` instead of `requestAnimationFrame` to schedule new samples.
* Thanks to [diddy](https://github.com/diddy-boy) for the notes!

## 0.10.1

* Added a tool to explore demodulator frequency responses in the browser.
* Fixed the bandwidth for the SSB demodulator (it was using half of the requested bandwidth.)
* Increased the number of taps for the Hilbert filter in the demodulator for better discrimination.

## 0.10.0

* Reimplemented FIR filters, FFT, Real FFT, and resamplers in WebAssembly (WASM) for higher performance.
* Replaced `RealDownsampler` and `ComplexDownsampler` with `getRealResampler()` and `getIqResampler()`.
* `FIRFilter`: Removed `loadSamples()` and `get()` in favor of `inPlace()`.
* `FFT`: Removed `setWindow()` and `transformCircularBuffers()`.

## 0.9.9

* Restored `RealDownsampler` usage in WBFM demodulation.
* Added `getGoodResampleRate()` to find optimal sample rates that minimize resampling factors.
* Added resampler and downsampler testing to the Filter Explorer tool.

## 0.9.8

* Added `getRealResampler()` and `getIqResampler()` supporting arbitrary rational resampling rates.
* Deprecated `RealDownsampler` and `ComplexDownsampler`.

## 0.9.7

* `AudioPlayer`: Reused `AudioBuffer` instances to reduce memory allocations and garbage collection overhead.

## 0.9.6

* Added `RealFFT` for more efficient computation of FFTs of real-valued signals.
* Added `IqFFTFilter` for frequency-domain filtering of complex I/Q signals.
* Updated `FFTFilter` to use `RealFFT`.
* Optimized FIR filters with symmetric coefficients for better performance.
* Bug fixes in filters and resamplers.

## 0.9.5

* Added more tuning options for AM, CW, NBFM, SSB, and WBFM demodulators.
* Exported demodulator option types from the public API.
* Added a `quantized` signal generator to simulate hardware bit-depth quantization.
* Added demodulator benchmarks.

## 0.9.4

* Added `FFTFilter` for FIR filtering using FFT overlap-add convolution.
* Added FFT-based downsampling support in `ComplexDownsampler`.
* Simplified filter architecture: introduced `DelayFilter` and unified filter interfaces under `Filter`.
* Performance improvements for `FFT`, and made the imaginary component optional.
* Added configuration options for `AudioPlayer`.

## 0.9.3

* Optimized stereo pilot tone detection in the WBFM demodulator for faster locking.
* Added a browser-based demodulator benchmark tool.

## 0.9.2

* Separated `GeneratedSource` from `RealtimeSignalSource` for signal generation without real-time pacing.
* Avoided memory allocations in `FIRFilter`.
* Added the browser-based Filter Explorer tool.
* Added documentation on creating custom signal sources.

## 0.9.1

* `Radio`: Replaced the internal message queue state machine with `SingleThread` task serialization.
* `SampleReceiver`: Changed `receiveSamples()` to take a `SampleBlock` object.
* Added configuration options for all demodulation modes.
* Avoided memory allocations in demodulators.
* Fixes for WBFM demodulation and filters.

## 0.9.0

* First release, forked off `webrtlsdr` as a standalone signal demodulation and DSP library.
* Decoupled `Radio` from RTL-SDR hardware and WebUSB by introducing generic `SignalSource` and `SignalSourceProvider` interfaces.
* Added `RealTimeSource` and `PushSource` signal sources.
* Added signal generators (`modulateAM`, `modulateFM`, `tone`, `noise`, `sum`, `wbfmSignal`) to generate test signals without hardware.
* Added `Float32Pool` and `U8Pool` buffer pools to minimize allocations during streaming.
* Added a fast, high-precision polynomial `atan2` approximation.
* Added a new PLL and tuned filter coefficients for FM stereo demodulation.
* Added configuration options for demodulators.
