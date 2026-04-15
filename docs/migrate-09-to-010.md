# Migrating from Signals 0.9 to 0.10

## Filters and resamplers

The `FIRFilter` class has lost its public `loadSamples()` and `get()` methods. Now you can only filter in place with the `inPlace()` method.

The `RealDownsampler` and `ComplexDownsampler` classes have been removed. Use the `getRealResampler()` and `getIqResampler()` functions instead to obtain appropriate resamplers.

## FFT

The `FFT` class has lost its `setWindow()` and `transformCircularBuffers()` methods.
