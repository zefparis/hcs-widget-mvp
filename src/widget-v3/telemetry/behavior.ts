/**
 * HCS-U7 Widget v3 — Behavioral signal collector
 * Collects mouse dynamics, keystroke biometrics, scroll patterns,
 * touch events, and micro-timing entropy.
 * All listeners are passive — zero performance impact.
 *
 * @copyright (c) 2025-2026 Benjamin BARRERE / IA SOLUTION
 * @license Patents Pending FR2514274 | FR2514546
 */

export interface BehaviorSignals {
  keystrokeIntervalAvg: number;
  keystrokeIntervalStd: number;
  keystrokeDwellAvg: number;
  keystrokeDwellStd: number;
  keystrokes: number;
  flightTimeAvg: number;
  flightTimeStd: number;

  mouseVelocityAvg: number;
  mouseVelocityStd: number;
  mouseAccelerationAvg: number;
  mouseAccelerationStd: number;
  mouseCurvatureAvg: number;
  mouseMovements: number;
  mouseClicks: number;
  noMouseMovement: boolean;
  linearMovement: boolean;

  scrollEvents: number;
  scrollVelocityAvg: number;
  scrollDirectionChanges: number;

  touchEvents: number;
  touchPressureAvg: number;
  touchRadiusAvg: number;

  timeToFirstInteraction: number;
  sessionDuration: number;
  idleGaps: number;
  timingEntropy: number;

  copyPasteEvents: number;
  pageViews: number;

  microTimingEntropy: number;
  timingDistributionSkewness: number;
  timingDistributionKurtosis: number;
}

interface Point { x: number; y: number; t: number; }

const MAX = 500;

// ── State ──
let startTime = 0;
let firstInteraction: number | null = null;
let lastActivity = 0;
let idleGaps = 0;

const mousePoints: Point[] = [];
const mouseVelocities: number[] = [];
const mouseAccelerations: number[] = [];
const mouseCurvatures: number[] = [];
let clicks = 0;

const keyDownTimes: Record<string, number> = {};
const keystrokeIntervals: number[] = [];
const keystrokeDwells: number[] = [];
const flightTimes: number[] = [];
let lastKeyUp = 0;
let keystrokes = 0;

let scrollCount = 0;
const scrollVelocities: number[] = [];
let lastScrollY = 0;
let lastScrollTime = 0;
let scrollDirChanges = 0;
let lastScrollDir = 0;

let touchCount = 0;
const touchPressures: number[] = [];
const touchRadii: number[] = [];

let copyPasteCount = 0;
const microTimings: number[] = [];

// ── Math helpers ──
function mean(a: number[]): number {
  if (!a.length) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s / a.length;
}

function std(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  let v = 0;
  for (let i = 0; i < a.length; i++) v += (a[i] - m) * (a[i] - m);
  return Math.sqrt(v / (a.length - 1));
}

function curvature(p1: Point, p2: Point, p3: Point): number {
  const ax = p2.x - p1.x, ay = p2.y - p1.y;
  const bx = p3.x - p2.x, by = p3.y - p2.y;
  const cross = Math.abs(ax * by - ay * bx);
  const a = Math.sqrt(ax * ax + ay * ay);
  const b = Math.sqrt(bx * bx + by * by);
  const cx = p3.x - p1.x, cy = p3.y - p1.y;
  const c = Math.sqrt(cx * cx + cy * cy);
  const d = a * b * c;
  return d === 0 ? 0 : (2 * cross) / d;
}

function timingEntropy(timings: number[]): number {
  if (timings.length < 5) return 0.5;
  const intervals: number[] = [];
  for (let i = 1; i < timings.length; i++) intervals.push(timings[i] - timings[i - 1]);
  const bins = 20;
  let min = Infinity, max = -Infinity;
  for (const v of intervals) { if (v < min) min = v; if (v > max) max = v; }
  const range = max - min;
  if (range === 0) return 0;
  const b = new Array(bins).fill(0);
  for (const v of intervals) b[Math.min(Math.floor(((v - min) / range) * bins), bins - 1)]++;
  let ent = 0;
  const total = intervals.length;
  for (const c of b) { if (c > 0) { const p = c / total; ent -= p * Math.log2(p); } }
  const maxEnt = Math.log2(bins);
  return maxEnt > 0 ? ent / maxEnt : 0;
}

function skewness(a: number[]): number {
  if (a.length < 3) return 0;
  const m = mean(a), s = std(a);
  if (s === 0) return 0;
  const n = a.length;
  let sum = 0;
  for (const v of a) sum += Math.pow((v - m) / s, 3);
  return (n / ((n - 1) * (n - 2))) * sum;
}

function kurtosis(a: number[]): number {
  if (a.length < 4) return 3;
  const m = mean(a), s = std(a);
  if (s === 0) return 0;
  let sum = 0;
  for (const v of a) sum += Math.pow((v - m) / s, 4);
  return (sum / a.length) - 3;
}

function isLinear(): boolean {
  if (mousePoints.length < 10) return false;
  const pts = mousePoints.slice(-50);
  let lin = 0, tot = 0;
  for (let i = 2; i < pts.length; i++) {
    tot++;
    if (curvature(pts[i - 2], pts[i - 1], pts[i]) < 0.001) lin++;
  }
  return tot > 0 && (lin / tot) > 0.8;
}

function microTimingEntropy(): number {
  if (microTimings.length < 10) return 0.5;
  const intervals: number[] = [];
  for (let i = 1; i < microTimings.length; i++) intervals.push(microTimings[i] - microTimings[i - 1]);
  let autocorr = 0;
  if (intervals.length > 2) {
    const m = mean(intervals), s = std(intervals);
    if (s > 0) {
      let sum = 0;
      for (let j = 1; j < intervals.length; j++) {
        sum += ((intervals[j] - m) / s) * ((intervals[j - 1] - m) / s);
      }
      autocorr = sum / (intervals.length - 1);
    }
  }
  const ent = timingEntropy(microTimings);
  if (ent > 0.85 && Math.abs(autocorr) < 0.1) return 0.9;
  if (ent < 0.15) return 0.1;
  return ent;
}

// ── Activity tracker ──
function recordActivity(): void {
  const now = Date.now();
  if (firstInteraction === null) firstInteraction = now;
  if (now - lastActivity > 3000) idleGaps++;
  lastActivity = now;
  if (microTimings.length < MAX) microTimings.push(now);
}

// ── Event handlers ──
function onMouseMove(e: MouseEvent): void {
  recordActivity();
  const pt: Point = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (mousePoints.length > 0) {
    const prev = mousePoints[mousePoints.length - 1];
    const dt = pt.t - prev.t;
    if (dt > 0) {
      const dx = pt.x - prev.x, dy = pt.y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const vel = dist / dt;
      if (mouseVelocities.length < MAX) mouseVelocities.push(vel);
      if (mouseVelocities.length >= 2) {
        const prevV = mouseVelocities[mouseVelocities.length - 2];
        if (mouseAccelerations.length < MAX) mouseAccelerations.push((vel - prevV) / dt);
      }
      if (mousePoints.length >= 2) {
        const prev2 = mousePoints[mousePoints.length - 2];
        if (mouseCurvatures.length < MAX) mouseCurvatures.push(curvature(prev2, prev, pt));
      }
    }
  }
  if (mousePoints.length < MAX) mousePoints.push(pt);
  else mousePoints[mousePoints.length - 1] = pt;
}

function onClick(): void { recordActivity(); clicks++; }

function onKeyDown(e: KeyboardEvent): void {
  recordActivity();
  if (['Shift', 'Control', 'Alt', 'Meta'].indexOf(e.key) !== -1) return;
  const now = performance.now();
  if (lastKeyUp > 0) {
    const flight = now - lastKeyUp;
    if (flight > 0 && flight < 5000 && flightTimes.length < MAX) flightTimes.push(flight);
  }
  const keys = Object.keys(keyDownTimes);
  if (keys.length > 0 && keystrokeIntervals.length < MAX) {
    let lastDown = 0;
    for (const k of keys) if (keyDownTimes[k] > lastDown) lastDown = keyDownTimes[k];
    const interval = now - lastDown;
    if (interval > 0 && interval < 5000) keystrokeIntervals.push(interval);
  }
  keyDownTimes[e.code] = now;
  keystrokes++;
}

function onKeyUp(e: KeyboardEvent): void {
  if (['Shift', 'Control', 'Alt', 'Meta'].indexOf(e.key) !== -1) return;
  const now = performance.now();
  const down = keyDownTimes[e.code];
  if (down !== undefined) {
    const dwell = now - down;
    if (dwell > 0 && dwell < 2000 && keystrokeDwells.length < MAX) keystrokeDwells.push(dwell);
    delete keyDownTimes[e.code];
  }
  lastKeyUp = now;
}

function onScroll(): void {
  recordActivity();
  scrollCount++;
  const now = performance.now();
  const sy = window.scrollY || document.documentElement.scrollTop;
  const dt = now - lastScrollTime;
  if (dt > 0 && lastScrollTime > 0) {
    const dy = sy - lastScrollY;
    if (scrollVelocities.length < MAX) scrollVelocities.push(Math.abs(dy) / dt);
    const dir = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    if (dir !== 0 && dir !== lastScrollDir && lastScrollDir !== 0) scrollDirChanges++;
    if (dir !== 0) lastScrollDir = dir;
  }
  lastScrollY = sy;
  lastScrollTime = now;
}

function onTouchStart(e: TouchEvent): void {
  recordActivity();
  touchCount++;
  for (let i = 0; i < e.touches.length; i++) {
    const t = e.touches[i] as any;
    if (t.force !== undefined && t.force > 0) touchPressures.push(t.force);
    if (t.radiusX !== undefined) touchRadii.push((t.radiusX + t.radiusY) / 2);
  }
}

function onCopyPaste(): void { recordActivity(); copyPasteCount++; }

// ── Public API ──

export function initBehavior(): void {
  startTime = Date.now();
  lastActivity = startTime;
  const opts: AddEventListenerOptions = { passive: true };
  document.addEventListener('mousemove', onMouseMove as EventListener, opts);
  document.addEventListener('click', onClick, opts);
  document.addEventListener('keydown', onKeyDown as EventListener, opts);
  document.addEventListener('keyup', onKeyUp as EventListener, opts);
  document.addEventListener('scroll', onScroll, { passive: true, capture: true });
  document.addEventListener('touchstart', onTouchStart as EventListener, opts);
  document.addEventListener('touchmove', () => recordActivity(), opts);
  document.addEventListener('copy', onCopyPaste, opts);
  document.addEventListener('paste', onCopyPaste, opts);
}

export function getSignals(): BehaviorSignals {
  const now = Date.now();
  const dur = (now - startTime) / 1000;
  const mi: number[] = [];
  for (let i = 1; i < microTimings.length; i++) mi.push(microTimings[i] - microTimings[i - 1]);

  return {
    keystrokeIntervalAvg: mean(keystrokeIntervals),
    keystrokeIntervalStd: std(keystrokeIntervals),
    keystrokeDwellAvg: mean(keystrokeDwells),
    keystrokeDwellStd: std(keystrokeDwells),
    keystrokes,
    flightTimeAvg: mean(flightTimes),
    flightTimeStd: std(flightTimes),
    mouseVelocityAvg: mean(mouseVelocities),
    mouseVelocityStd: std(mouseVelocities),
    mouseAccelerationAvg: mean(mouseAccelerations),
    mouseAccelerationStd: std(mouseAccelerations),
    mouseCurvatureAvg: mean(mouseCurvatures),
    mouseMovements: mousePoints.length,
    mouseClicks: clicks,
    noMouseMovement: mousePoints.length === 0,
    linearMovement: isLinear(),
    scrollEvents: scrollCount,
    scrollVelocityAvg: mean(scrollVelocities),
    scrollDirectionChanges: scrollDirChanges,
    touchEvents: touchCount,
    touchPressureAvg: mean(touchPressures),
    touchRadiusAvg: mean(touchRadii),
    timeToFirstInteraction: firstInteraction ? (firstInteraction - startTime) / 1000 : dur,
    sessionDuration: dur,
    idleGaps,
    timingEntropy: timingEntropy(microTimings),
    copyPasteEvents: copyPasteCount,
    pageViews: 1,
    microTimingEntropy: microTimingEntropy(),
    timingDistributionSkewness: skewness(mi),
    timingDistributionKurtosis: kurtosis(mi),
  };
}
