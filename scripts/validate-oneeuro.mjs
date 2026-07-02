/**
 * One Euro Filter Validation Script
 * Re-implements One Euro Filter math inline (no imports)
 * Tests against noisy sine wave at 60fps
 */

// One Euro Filter inline implementation
class OneEuroFilterValidator {
  constructor(minCutoff = 1.2, beta = 0.01, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;

    this.lastValue = null;
    this.lastFilteredValue = null;
    this.lastFilteredDerivative = null;
    this.lastTimestampMs = null;
  }

  filter(value, timestampMs) {
    // First call: return value unchanged
    if (this.lastValue === null) {
      this.lastValue = value;
      this.lastFilteredValue = value;
      this.lastFilteredDerivative = 0;
      this.lastTimestampMs = timestampMs;
      return value;
    }

    // Calculate elapsed time in seconds
    let elapsedSeconds = (timestampMs - this.lastTimestampMs) / 1000;
    if (elapsedSeconds <= 0) {
      elapsedSeconds = 1 / 60;
    }

    // Calculate raw derivative
    const rawDerivative = (value - this.lastValue) / elapsedSeconds;

    // Low-pass filter the derivative
    const dAlpha = this.lowPassAlpha(this.dCutoff, elapsedSeconds);
    const filteredDerivative =
      this.lastFilteredDerivative === null
        ? rawDerivative
        : dAlpha * rawDerivative + (1 - dAlpha) * this.lastFilteredDerivative;

    // Adaptive cutoff
    const cutoff = this.minCutoff + this.beta * Math.abs(filteredDerivative);

    // Low-pass filter the value
    const alpha = this.lowPassAlpha(cutoff, elapsedSeconds);
    const filteredValue =
      alpha * value + (1 - alpha) * this.lastFilteredValue;

    // Update state
    this.lastValue = value;
    this.lastFilteredValue = filteredValue;
    this.lastFilteredDerivative = filteredDerivative;
    this.lastTimestampMs = timestampMs;

    return filteredValue;
  }

  reset() {
    this.lastValue = null;
    this.lastFilteredValue = null;
    this.lastFilteredDerivative = null;
    this.lastTimestampMs = null;
  }

  lowPassAlpha(cutoff, elapsedSeconds) {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / elapsedSeconds);
  }
}

// Test setup
const filter = new OneEuroFilterValidator();
const frameInterval = 1000 / 60; // ~16.67ms per frame at 60fps
const numFrames = 300;

const inputValues = [];
const outputValues = [];

let timestampMs = 0;

// Generate noisy sine wave and filter it
for (let i = 0; i < numFrames; i++) {
  // Pure sine wave
  const sine = Math.sin((i / numFrames) * Math.PI * 2);
  // Add noise
  const noise = (Math.random() - 0.5) * 0.3;
  const rawValue = sine + noise;

  inputValues.push(rawValue);

  // Filter
  const filteredValue = filter.filter(rawValue, timestampMs);
  outputValues.push(filteredValue);

  timestampMs += frameInterval;
}

// Test (a): Output variance is lower than input variance
function calculateVariance(values) {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    values.length;
  return variance;
}

const inputVariance = calculateVariance(inputValues);
const outputVariance = calculateVariance(outputValues);

console.log(
  `Input variance: ${inputVariance.toFixed(6)}, Output variance: ${outputVariance.toFixed(6)}`
);

let testAPassed = outputVariance < inputVariance;
console.log(`Test (a) - Output variance < input variance: ${testAPassed ? "PASS" : "FAIL"}`);

// Test (b): No NaN outputs
let testBPassed = !outputValues.some((v) => isNaN(v));
console.log(`Test (b) - No NaN outputs: ${testBPassed ? "PASS" : "FAIL"}`);

// Test (c): First sample passes through unchanged
const firstInput = inputValues[0];
const firstOutput = outputValues[0];
let testCPassed = firstOutput === firstInput;
console.log(
  `Test (c) - First sample unchanged (input: ${firstInput.toFixed(6)}, output: ${firstOutput.toFixed(6)}): ${testCPassed ? "PASS" : "FAIL"}`
);

// Overall result
const allPassed = testAPassed && testBPassed && testCPassed;
console.log(`\nOverall: ${allPassed ? "PASS" : "FAIL"}`);

process.exit(allPassed ? 0 : 1);
