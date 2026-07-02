/**
 * One Euro Filter - 1€フィルタ
 * 標準的なOne Euro Filter実装 (Casiez et al.)
 * SPEC §4.2.3 の仕様に基づき実装
 *
 * 低遅延ながら効果的なノイズ除去を提供し、手の追跡の滑らかさを向上させます。
 */

export interface OneEuroParams {
  minCutoff: number; // default 1.2
  beta: number;      // default 0.01
  dCutoff: number;   // default 1.0
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  private lastValue: number | null = null;
  private lastFilteredValue: number | null = null;
  private lastFilteredDerivative: number | null = null;
  private lastTimestampMs: number | null = null;

  constructor(params?: Partial<OneEuroParams>) {
    this.minCutoff = params?.minCutoff ?? 1.2;
    this.beta = params?.beta ?? 0.01;
    this.dCutoff = params?.dCutoff ?? 1.0;
  }

  /**
   * Filter a single value.
   * @param value Raw input value
   * @param timestampMs Timestamp in milliseconds (from performance.now())
   * @returns Filtered value
   */
  filter(value: number, timestampMs: number): number {
    // First call: return value unchanged and store state
    if (this.lastValue === null) {
      this.lastValue = value;
      this.lastFilteredValue = value;
      this.lastFilteredDerivative = 0;
      this.lastTimestampMs = timestampMs;
      return value;
    }

    // Calculate elapsed time in seconds
    let elapsedSeconds = (timestampMs - this.lastTimestampMs!) / 1000;
    if (elapsedSeconds <= 0) {
      elapsedSeconds = 1 / 60; // Fallback to ~60fps if zero/negative
    }

    // Calculate raw derivative
    const rawDerivative = (value - this.lastValue) / elapsedSeconds;

    // Low-pass filter the derivative with dCutoff
    const dAlpha = this.lowPassAlpha(this.dCutoff, elapsedSeconds);
    const filteredDerivative =
      this.lastFilteredDerivative === null
        ? rawDerivative
        : dAlpha * rawDerivative + (1 - dAlpha) * this.lastFilteredDerivative;

    // Adaptive cutoff: minCutoff + beta * |filtered derivative|
    const cutoff = this.minCutoff + this.beta * Math.abs(filteredDerivative);

    // Low-pass filter the value with adaptive cutoff
    const alpha = this.lowPassAlpha(cutoff, elapsedSeconds);
    const filteredValue = alpha * value + (1 - alpha) * this.lastFilteredValue!;

    // Update state
    this.lastValue = value;
    this.lastFilteredValue = filteredValue;
    this.lastFilteredDerivative = filteredDerivative;
    this.lastTimestampMs = timestampMs;

    return filteredValue;
  }

  /**
   * Reset filter state for the next tracking session.
   * Call this after tracking loss to start fresh.
   */
  reset(): void {
    this.lastValue = null;
    this.lastFilteredValue = null;
    this.lastFilteredDerivative = null;
    this.lastTimestampMs = null;
  }

  /**
   * Calculate low-pass filter alpha coefficient.
   * Formula: alpha = 1 / (1 + tau/Te) where tau = 1/(2*pi*cutoff)
   */
  private lowPassAlpha(cutoff: number, elapsedSeconds: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / elapsedSeconds);
  }
}
