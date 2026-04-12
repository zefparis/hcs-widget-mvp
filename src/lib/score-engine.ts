/**
 * Server-side score computation from raw test events.
 *
 * This module is the only source of truth for test scores.
 * Scores are NEVER accepted from the client — they are always
 * derived here from raw events embedded in server-signed tokens.
 */

import type { RawTestEvents } from './test-token';

const ALLOWED_TEST_TYPES = new Set([
  'reaction_time',
  'stroop',
  'digit_span',
  'ran_vocal',
  'pattern',
]);

export function isAllowedTestType(testType: string): boolean {
  return ALLOWED_TEST_TYPES.has(testType);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function validTimes(arr: number[]): number[] {
  return arr.filter(
    (t) => typeof t === 'number' && isFinite(t) && t > 0 && t < 30000,
  );
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

/**
 * Compute a 0–100 score for a given test type from raw events.
 * Unknown test types always score 0 (conservative default).
 */
export function computeScore(testType: string, rawEvents: RawTestEvents): number {
  switch (testType) {
    case 'reaction_time': {
      const times = validTimes(rawEvents.reactionTimes ?? []);
      if (times.length === 0) return 0;
      const avg = mean(times);
      // 100 at 200 ms, 0 at 800 ms — linear decay
      return clamp(100 * (1 - (avg - 200) / 600));
    }

    case 'stroop': {
      const total = rawEvents.totalCount ?? 0;
      const errors = rawEvents.errors ?? 0;
      if (total === 0) return 0;
      const accuracy = Math.max(0, 1 - errors / total);
      const times = validTimes(rawEvents.reactionTimes ?? []);
      const avgRT = times.length > 0 ? mean(times) : 600;
      // 60 % accuracy + 40 % speed (100 at 300 ms, 0 at 800 ms)
      const speedScore = Math.max(0, 1 - (avgRT - 300) / 500);
      return clamp(100 * (0.6 * accuracy + 0.4 * speedScore));
    }

    case 'digit_span': {
      const correct = rawEvents.correctCount ?? 0;
      const total = rawEvents.totalCount ?? 0;
      if (total === 0) return 0;
      return clamp((100 * correct) / total);
    }

    case 'ran_vocal': {
      const correct = rawEvents.correctCount ?? 0;
      const total = rawEvents.totalCount ?? 0;
      if (total === 0) return 0;
      return clamp((100 * correct) / total);
    }

    case 'pattern': {
      const correct = rawEvents.correctCount ?? 0;
      const total = rawEvents.totalCount ?? 0;
      if (total === 0) return 0;
      return clamp((100 * correct) / total);
    }

    default:
      return 0;
  }
}
