/**
 * HCS-U7 Behavioral Signal Collector
 * 
 * Collects real-time behavioral biometrics that are extremely difficult
 * for bots to simulate, even with residential proxies + human-like timing.
 * 
 * Signals collected:
 * - Mouse dynamics (velocity, acceleration, curvature, jitter)
 * - Keystroke dynamics (interval, dwell time, flight time)
 * - Scroll behavior (velocity, direction changes, momentum)
 * - Touch events (pressure, radius, multi-touch patterns)
 * - Timing entropy (micro-timing distribution analysis)
 * - Interaction patterns (time to first interaction, idle gaps)
 * 
 * @copyright (c) 2025-2026 Benjamin BARRERE / IA SOLUTION
 * @license Patents Pending FR2514274 | FR2514546
 */

export interface BehaviorSignals {
  // Keystroke dynamics
  keystrokeIntervalAvg: number;
  keystrokeIntervalStd: number;
  keystrokeDwellAvg: number;
  keystrokeDwellStd: number;
  keystrokes: number;
  flightTimeAvg: number;
  flightTimeStd: number;

  // Mouse dynamics
  mouseVelocityAvg: number;
  mouseVelocityStd: number;
  mouseAccelerationAvg: number;
  mouseAccelerationStd: number;
  mouseCurvatureAvg: number;
  mouseMovements: number;
  mouseClicks: number;
  noMouseMovement: boolean;
  linearMovement: boolean;

  // Scroll behavior
  scrollEvents: number;
  scrollVelocityAvg: number;
  scrollDirectionChanges: number;

  // Touch events
  touchEvents: number;
  touchPressureAvg: number;
  touchRadiusAvg: number;

  // Timing analysis
  timeToFirstInteraction: number;
  sessionDuration: number;
  idleGaps: number;
  timingEntropy: number;

  // Form behavior
  instantFormFill: boolean;
  copyPasteEvents: number;
  unusualSpeed: boolean;
  pageViews: number;

  // Advanced: micro-timing jitter analysis
  // Detects artificially injected randomness vs natural human jitter
  microTimingEntropy: number;
  timingDistributionSkewness: number;
  timingDistributionKurtosis: number;
}

interface MousePoint {
  x: number;
  y: number;
  t: number;
}

interface KeyEvent {
  downTime: number;
  upTime: number;
  key: string;
}

/**
 * BehaviorCollector - Passive behavioral signal collection
 * 
 * Runs silently in the background, collecting behavioral biometrics
 * that distinguish humans from sophisticated bots.
 */
export class BehaviorCollector {
  private startTime: number;
  private firstInteractionTime: number | null = null;
  private lastActivityTime: number;
  private idleGapCount: number = 0;

  // Mouse tracking
  private mousePoints: MousePoint[] = [];
  private mouseVelocities: number[] = [];
  private mouseAccelerations: number[] = [];
  private mouseCurvatures: number[] = [];
  private clickCount: number = 0;

  // Keystroke tracking
  private keyDownTimes: Map<string, number> = new Map();
  private keystrokeIntervals: number[] = [];
  private keystrokeDwells: number[] = [];
  private flightTimes: number[] = [];
  private lastKeyUpTime: number = 0;
  private keystrokeCount: number = 0;

  // Scroll tracking
  private scrollCount: number = 0;
  private scrollVelocities: number[] = [];
  private lastScrollY: number = 0;
  private lastScrollTime: number = 0;
  private scrollDirectionChanges: number = 0;
  private lastScrollDirection: number = 0;

  // Touch tracking
  private touchCount: number = 0;
  private touchPressures: number[] = [];
  private touchRadii: number[] = [];

  // Form tracking
  private copyPasteCount: number = 0;
  private formFillStartTime: number | null = null;

  // Micro-timing for entropy analysis
  private microTimings: number[] = [];

  // Listeners (for cleanup)
  private listeners: Array<{ target: EventTarget; event: string; handler: EventListener }> = [];

  // Max samples to prevent memory issues
  private static readonly MAX_SAMPLES = 500;

  constructor() {
    this.startTime = Date.now();
    this.lastActivityTime = this.startTime;
    this.attach();
  }

  /**
   * Attach all event listeners
   */
  private attach(): void {
    this.addListener(document, 'mousemove', this.onMouseMove.bind(this));
    this.addListener(document, 'click', this.onClick.bind(this));
    this.addListener(document, 'keydown', this.onKeyDown.bind(this));
    this.addListener(document, 'keyup', this.onKeyUp.bind(this));
    this.addListener(document, 'scroll', this.onScroll.bind(this), true);
    this.addListener(document, 'touchstart', this.onTouchStart.bind(this));
    this.addListener(document, 'touchmove', this.onTouchMove.bind(this));
    this.addListener(document, 'copy', this.onCopyPaste.bind(this));
    this.addListener(document, 'paste', this.onCopyPaste.bind(this));
    this.addListener(document, 'focus', this.onFocus.bind(this), true);
  }

  private addListener(target: EventTarget, event: string, handler: EventListener, capture: boolean = false): void {
    target.addEventListener(event, handler, { passive: true, capture });
    this.listeners.push({ target, event, handler });
  }

  /**
   * Record first interaction and track idle gaps
   */
  private recordActivity(): void {
    const now = Date.now();
    if (this.firstInteractionTime === null) {
      this.firstInteractionTime = now;
    }
    // Idle gap > 3 seconds
    if (now - this.lastActivityTime > 3000) {
      this.idleGapCount++;
    }
    this.lastActivityTime = now;

    // Record micro-timing for entropy analysis
    if (this.microTimings.length < BehaviorCollector.MAX_SAMPLES) {
      this.microTimings.push(now);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // MOUSE DYNAMICS
  // ═══════════════════════════════════════════════════════════

  private onMouseMove(e: Event): void {
    const me = e as MouseEvent;
    this.recordActivity();

    const point: MousePoint = { x: me.clientX, y: me.clientY, t: performance.now() };

    if (this.mousePoints.length > 0) {
      const prev = this.mousePoints[this.mousePoints.length - 1];
      const dt = point.t - prev.t;

      if (dt > 0) {
        const dx = point.x - prev.x;
        const dy = point.y - prev.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const velocity = dist / dt; // px/ms

        if (this.mouseVelocities.length < BehaviorCollector.MAX_SAMPLES) {
          this.mouseVelocities.push(velocity);
        }

        // Acceleration
        if (this.mouseVelocities.length >= 2) {
          const prevVelocity = this.mouseVelocities[this.mouseVelocities.length - 2];
          const acceleration = (velocity - prevVelocity) / dt;
          if (this.mouseAccelerations.length < BehaviorCollector.MAX_SAMPLES) {
            this.mouseAccelerations.push(acceleration);
          }
        }

        // Curvature (requires 3 points)
        if (this.mousePoints.length >= 2) {
          const prev2 = this.mousePoints[this.mousePoints.length - 2];
          const curvature = this.computeCurvature(prev2, prev, point);
          if (this.mouseCurvatures.length < BehaviorCollector.MAX_SAMPLES) {
            this.mouseCurvatures.push(curvature);
          }
        }
      }
    }

    if (this.mousePoints.length < BehaviorCollector.MAX_SAMPLES) {
      this.mousePoints.push(point);
    } else {
      // Keep last point for velocity calculation
      this.mousePoints[this.mousePoints.length - 1] = point;
    }
  }

  /**
   * Compute curvature from 3 points using Menger curvature
   * Bots tend to have very low curvature (straight lines)
   * Humans have natural curvature variations
   */
  private computeCurvature(p1: MousePoint, p2: MousePoint, p3: MousePoint): number {
    const ax = p2.x - p1.x;
    const ay = p2.y - p1.y;
    const bx = p3.x - p2.x;
    const by = p3.y - p2.y;

    const cross = Math.abs(ax * by - ay * bx);
    const a = Math.sqrt(ax * ax + ay * ay);
    const b = Math.sqrt(bx * bx + by * by);
    const c = Math.sqrt((p3.x - p1.x) ** 2 + (p3.y - p1.y) ** 2);

    const denom = a * b * c;
    if (denom === 0) return 0;

    return (2 * cross) / denom;
  }

  private onClick(): void {
    this.recordActivity();
    this.clickCount++;
  }

  // ═══════════════════════════════════════════════════════════
  // KEYSTROKE DYNAMICS
  // ═══════════════════════════════════════════════════════════

  private onKeyDown(e: Event): void {
    const ke = e as KeyboardEvent;
    this.recordActivity();

    // Don't track modifier keys
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(ke.key)) return;

    const now = performance.now();

    // Flight time (time between last key up and this key down)
    if (this.lastKeyUpTime > 0) {
      const flight = now - this.lastKeyUpTime;
      if (flight > 0 && flight < 5000 && this.flightTimes.length < BehaviorCollector.MAX_SAMPLES) {
        this.flightTimes.push(flight);
      }
    }

    // Keystroke interval
    if (this.keyDownTimes.size > 0 && this.keystrokeIntervals.length < BehaviorCollector.MAX_SAMPLES) {
      const lastDown = Math.max(...Array.from(this.keyDownTimes.values()));
      const interval = now - lastDown;
      if (interval > 0 && interval < 5000) {
        this.keystrokeIntervals.push(interval);
      }
    }

    this.keyDownTimes.set(ke.code, now);
    this.keystrokeCount++;
  }

  private onKeyUp(e: Event): void {
    const ke = e as KeyboardEvent;
    if (['Shift', 'Control', 'Alt', 'Meta'].includes(ke.key)) return;

    const now = performance.now();
    const downTime = this.keyDownTimes.get(ke.code);

    if (downTime !== undefined) {
      const dwell = now - downTime;
      if (dwell > 0 && dwell < 2000 && this.keystrokeDwells.length < BehaviorCollector.MAX_SAMPLES) {
        this.keystrokeDwells.push(dwell);
      }
      this.keyDownTimes.delete(ke.code);
    }

    this.lastKeyUpTime = now;
  }

  // ═══════════════════════════════════════════════════════════
  // SCROLL BEHAVIOR
  // ═══════════════════════════════════════════════════════════

  private onScroll(): void {
    this.recordActivity();
    this.scrollCount++;

    const now = performance.now();
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    const dt = now - this.lastScrollTime;

    if (dt > 0 && this.lastScrollTime > 0) {
      const dy = scrollY - this.lastScrollY;
      const velocity = Math.abs(dy) / dt;

      if (this.scrollVelocities.length < BehaviorCollector.MAX_SAMPLES) {
        this.scrollVelocities.push(velocity);
      }

      // Direction changes
      const direction = dy > 0 ? 1 : dy < 0 ? -1 : 0;
      if (direction !== 0 && direction !== this.lastScrollDirection && this.lastScrollDirection !== 0) {
        this.scrollDirectionChanges++;
      }
      if (direction !== 0) {
        this.lastScrollDirection = direction;
      }
    }

    this.lastScrollY = scrollY;
    this.lastScrollTime = now;
  }

  // ═══════════════════════════════════════════════════════════
  // TOUCH EVENTS
  // ═══════════════════════════════════════════════════════════

  private onTouchStart(e: Event): void {
    const te = e as TouchEvent;
    this.recordActivity();
    this.touchCount++;

    for (let i = 0; i < te.touches.length; i++) {
      const touch = te.touches[i] as any;
      if (touch.force !== undefined && touch.force > 0) {
        this.touchPressures.push(touch.force);
      }
      if (touch.radiusX !== undefined) {
        this.touchRadii.push((touch.radiusX + touch.radiusY) / 2);
      }
    }
  }

  private onTouchMove(e: Event): void {
    this.recordActivity();
  }

  // ═══════════════════════════════════════════════════════════
  // FORM & CLIPBOARD
  // ═══════════════════════════════════════════════════════════

  private onCopyPaste(): void {
    this.recordActivity();
    this.copyPasteCount++;
  }

  private onFocus(e: Event): void {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
      if (this.formFillStartTime === null) {
        this.formFillStartTime = Date.now();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STATISTICAL HELPERS
  // ═══════════════════════════════════════════════════════════

  private mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private std(arr: number[]): number {
    if (arr.length < 2) return 0;
    const m = this.mean(arr);
    const variance = arr.reduce((sum, x) => sum + (x - m) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(variance);
  }

  /**
   * Shannon entropy of a timing distribution
   * Natural human timing has moderate entropy (0.4-0.8)
   * Artificial randomness tends toward high entropy (>0.85)
   * Robotic timing has very low entropy (<0.2)
   */
  private computeTimingEntropy(timings: number[]): number {
    if (timings.length < 5) return 0.5;

    // Compute inter-event intervals
    const intervals: number[] = [];
    for (let i = 1; i < timings.length; i++) {
      intervals.push(timings[i] - timings[i - 1]);
    }

    // Bin into 20 buckets
    const numBins = 20;
    const minVal = Math.min(...intervals);
    const maxVal = Math.max(...intervals);
    const range = maxVal - minVal;

    if (range === 0) return 0; // All identical = zero entropy

    const bins = new Array(numBins).fill(0);
    intervals.forEach(v => {
      const idx = Math.min(Math.floor(((v - minVal) / range) * numBins), numBins - 1);
      bins[idx]++;
    });

    // Shannon entropy
    let entropy = 0;
    const total = intervals.length;
    bins.forEach(count => {
      if (count > 0) {
        const p = count / total;
        entropy -= p * Math.log2(p);
      }
    });

    // Normalize to 0-1
    const maxEntropy = Math.log2(numBins);
    return maxEntropy > 0 ? entropy / maxEntropy : 0;
  }

  /**
   * Compute skewness of timing distribution
   * Human timing: slight positive skew (occasional slow responses)
   * Bot timing: near-zero skew (symmetric artificial distribution)
   */
  private computeSkewness(arr: number[]): number {
    if (arr.length < 3) return 0;
    const m = this.mean(arr);
    const s = this.std(arr);
    if (s === 0) return 0;

    const n = arr.length;
    const sum = arr.reduce((acc, x) => acc + ((x - m) / s) ** 3, 0);
    return (n / ((n - 1) * (n - 2))) * sum;
  }

  /**
   * Compute kurtosis of timing distribution
   * Human timing: platykurtic to mesokurtic (2-4)
   * Bot timing: often leptokurtic (>5) or perfectly mesokurtic (=3)
   */
  private computeKurtosis(arr: number[]): number {
    if (arr.length < 4) return 3; // Default to normal
    const m = this.mean(arr);
    const s = this.std(arr);
    if (s === 0) return 0;

    const n = arr.length;
    const sum = arr.reduce((acc, x) => acc + ((x - m) / s) ** 4, 0);
    return (sum / n) - 3; // Excess kurtosis (normal = 0)
  }

  /**
   * Detect if mouse movement is predominantly linear (bot-like)
   */
  private isLinearMovement(): boolean {
    if (this.mousePoints.length < 10) return false;

    // Sample points
    const points = this.mousePoints.slice(-50);
    let linearSegments = 0;
    let totalSegments = 0;

    for (let i = 2; i < points.length; i++) {
      const p1 = points[i - 2];
      const p2 = points[i - 1];
      const p3 = points[i];

      const curvature = this.computeCurvature(p1, p2, p3);
      totalSegments++;

      // Very low curvature = nearly straight line
      if (curvature < 0.001) {
        linearSegments++;
      }
    }

    // >80% linear segments = bot-like
    return totalSegments > 0 && (linearSegments / totalSegments) > 0.8;
  }

  /**
   * Compute micro-timing entropy for jitter analysis
   * This specifically detects artificially injected randomness
   * 
   * Key insight: Human micro-timing follows a log-normal distribution
   * with natural correlations between consecutive intervals.
   * Artificial jitter (even sophisticated) tends to be:
   * 1. Too uniform (high entropy)
   * 2. Uncorrelated between consecutive intervals
   * 3. Missing the natural log-normal shape
   */
  private computeMicroTimingEntropy(): number {
    if (this.microTimings.length < 10) return 0.5;

    const intervals: number[] = [];
    for (let i = 1; i < this.microTimings.length; i++) {
      intervals.push(this.microTimings[i] - this.microTimings[i - 1]);
    }

    // Check autocorrelation of consecutive intervals
    // Humans: moderate positive autocorrelation (0.1-0.5)
    // Bots with random jitter: near-zero autocorrelation
    let autocorr = 0;
    if (intervals.length > 2) {
      const m = this.mean(intervals);
      const s = this.std(intervals);
      if (s > 0) {
        let sum = 0;
        for (let i = 1; i < intervals.length; i++) {
          sum += ((intervals[i] - m) / s) * ((intervals[i - 1] - m) / s);
        }
        autocorr = sum / (intervals.length - 1);
      }
    }

    // Combine entropy + autocorrelation into a single score
    const entropy = this.computeTimingEntropy(this.microTimings);

    // Suspicious patterns:
    // High entropy + low autocorrelation = artificial randomness
    // Very low entropy + high autocorrelation = robotic
    // Moderate entropy + moderate autocorrelation = human
    if (entropy > 0.85 && Math.abs(autocorr) < 0.1) {
      return 0.9; // Likely artificial randomness
    }
    if (entropy < 0.15) {
      return 0.1; // Likely robotic
    }

    return entropy;
  }

  // ═══════════════════════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════════════════════

  /**
   * Get all collected behavioral signals
   */
  getSignals(): BehaviorSignals {
    const now = Date.now();
    const sessionDuration = (now - this.startTime) / 1000; // seconds

    // Compute all micro-timing intervals for distribution analysis
    const allIntervals: number[] = [
      ...this.keystrokeIntervals,
      ...this.mouseVelocities.map((v, i) => i > 0 ? v - this.mouseVelocities[i - 1] : 0).filter(v => v !== 0),
    ];

    return {
      // Keystroke dynamics
      keystrokeIntervalAvg: this.mean(this.keystrokeIntervals),
      keystrokeIntervalStd: this.std(this.keystrokeIntervals),
      keystrokeDwellAvg: this.mean(this.keystrokeDwells),
      keystrokeDwellStd: this.std(this.keystrokeDwells),
      keystrokes: this.keystrokeCount,
      flightTimeAvg: this.mean(this.flightTimes),
      flightTimeStd: this.std(this.flightTimes),

      // Mouse dynamics
      mouseVelocityAvg: this.mean(this.mouseVelocities),
      mouseVelocityStd: this.std(this.mouseVelocities),
      mouseAccelerationAvg: this.mean(this.mouseAccelerations),
      mouseAccelerationStd: this.std(this.mouseAccelerations),
      mouseCurvatureAvg: this.mean(this.mouseCurvatures),
      mouseMovements: this.mousePoints.length,
      mouseClicks: this.clickCount,
      noMouseMovement: this.mousePoints.length === 0,
      linearMovement: this.isLinearMovement(),

      // Scroll behavior
      scrollEvents: this.scrollCount,
      scrollVelocityAvg: this.mean(this.scrollVelocities),
      scrollDirectionChanges: this.scrollDirectionChanges,

      // Touch events
      touchEvents: this.touchCount,
      touchPressureAvg: this.mean(this.touchPressures),
      touchRadiusAvg: this.mean(this.touchRadii),

      // Timing analysis
      timeToFirstInteraction: this.firstInteractionTime
        ? (this.firstInteractionTime - this.startTime) / 1000
        : sessionDuration,
      sessionDuration,
      idleGaps: this.idleGapCount,
      timingEntropy: this.computeTimingEntropy(this.microTimings),

      // Form behavior
      instantFormFill: false, // Computed on form submit
      copyPasteEvents: this.copyPasteCount,
      unusualSpeed: false, // Computed on analysis
      pageViews: 1,

      // Advanced micro-timing jitter analysis
      microTimingEntropy: this.computeMicroTimingEntropy(),
      timingDistributionSkewness: this.computeSkewness(
        this.microTimings.length > 1
          ? this.microTimings.slice(1).map((t, i) => t - this.microTimings[i])
          : []
      ),
      timingDistributionKurtosis: this.computeKurtosis(
        this.microTimings.length > 1
          ? this.microTimings.slice(1).map((t, i) => t - this.microTimings[i])
          : []
      ),
    };
  }

  /**
   * Cleanup all event listeners
   */
  destroy(): void {
    for (const { target, event, handler } of this.listeners) {
      target.removeEventListener(event, handler);
    }
    this.listeners = [];
  }
}
