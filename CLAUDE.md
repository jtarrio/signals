# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build    # Compile TypeScript to dist/
npm test         # Run all tests once (vitest)
npm test -- tests/path/to/file.test.ts   # Run a single test file
npm test -- --reporter=verbose           # Run tests with verbose output
```

There is no separate lint command; TypeScript strict mode serves as the primary code quality check.

## Architecture

**Signals** is a TypeScript library for demodulating radio signals in real-time (browser/JS). It has four main layers:

### Radio layer (`src/radio/`)
`Radio<T>` is the top-level orchestrator. It connects a `SignalSource` (samples in) to a `SampleReceiver` (samples out), queuing commands through `SingleThread` for serialization. `Transfers` keeps two buffers in flight for continuous streaming.

### Demodulation layer (`src/demod/`)
`Demodulator` implements `SampleReceiver` and converts I/Q samples to audio. It dispatches to mode-specific implementations (`DemodWBFM`, `DemodNBFM`, `DemodAM`, `DemodSSB`, `DemodCW`). Mode configuration is centralized in `modes.ts`. Audio output goes through the `Player` interface, implemented by `AudioPlayer` (Web Audio API).

### Sources layer (`src/sources/`)
`RealTimeSource` is the base for custom sources; `GeneratedSource` wraps a generator function. `generators.ts` provides composable primitives: `tone()`, `noise()`, `sum()`, `product()`, `modulateAM()`, `modulateFM()`, `wbfmSignal()`. `SimpleProvider` wraps a single source as a `SignalSourceProvider`.

### DSP layer (`src/dsp/`)
Low-level signal processing: `FirFilter`/`IirFilter`, `Resampler`, `FFT`, pre-computed filter coefficients, and memory-efficient object pools (`Float32Pool`, `IqPool`, `Float32RingBuffer`) to minimize GC pressure during real-time processing.

## Key design patterns

- **Interface-based pluggability**: `SignalSource`, `SampleReceiver`, and `Player` are interfaces — implementations are swappable.
- **Async command queue**: All `Radio` methods are async; `SingleThread` ensures serial execution.
- **Memory pools**: DSP code reuses `Float32Pool`/`IqPool` allocations — avoid creating new typed arrays in hot paths.
- **Generator composition**: Signal sources are built by composing generator functions (see `generators.ts`).

## Test utilities

`tests/testutil.ts` provides `IQ`, `iq()`, `rmsd()` (root-mean-square difference), `prng()`, and `modulus()` helpers for validating demodulated signals. Benchmark files use `*.bench.ts` naming.
