import { describe, it, expect, beforeEach } from 'vitest';
import { ChallengeEngine } from '../src/lib/challenge-engine';

describe('ChallengeEngine', () => {
  let engine: ChallengeEngine;

  beforeEach(() => {
    engine = new ChallengeEngine();
  });

  describe('generateChallenge', () => {
    it('returns a challenge with valid type', () => {
      const challenge = engine.generateChallenge();
      expect(['slider', 'click', 'timing']).toContain(challenge.type);
    });

    it('includes a startTime timestamp', () => {
      const before = Date.now();
      const challenge = engine.generateChallenge();
      expect(challenge.startTime).toBeGreaterThanOrEqual(before);
      expect(challenge.startTime).toBeLessThanOrEqual(Date.now());
    });

    it('includes challenge-specific data', () => {
      const challenge = engine.generateChallenge();
      expect(challenge.data).toBeDefined();
    });
  });

  describe('slider challenge data', () => {
    it('has targetValue between 0 and 100', () => {
      // Generate many challenges to find a slider one
      for (let i = 0; i < 50; i++) {
        const challenge = engine.generateChallenge();
        if (challenge.type === 'slider') {
          expect(challenge.data.targetValue).toBeGreaterThanOrEqual(0);
          expect(challenge.data.targetValue).toBeLessThan(100);
          expect(challenge.data.tolerance).toBe(5);
          return;
        }
      }
    });
  });

  describe('click challenge data', () => {
    it('has valid target coordinates and radius', () => {
      for (let i = 0; i < 50; i++) {
        const challenge = engine.generateChallenge();
        if (challenge.type === 'click') {
          expect(challenge.data.targetX).toBeGreaterThanOrEqual(50);
          expect(challenge.data.targetX).toBeLessThan(350);
          expect(challenge.data.targetY).toBeGreaterThanOrEqual(50);
          expect(challenge.data.targetY).toBeLessThan(250);
          expect(challenge.data.radius).toBe(30);
          return;
        }
      }
    });
  });

  describe('timing challenge data', () => {
    it('has valid min/max duration', () => {
      for (let i = 0; i < 50; i++) {
        const challenge = engine.generateChallenge();
        if (challenge.type === 'timing') {
          expect(challenge.data.minDuration).toBe(500);
          expect(challenge.data.maxDuration).toBe(3000);
          return;
        }
      }
    });
  });

  describe('randomness', () => {
    it('generates different challenge types over multiple calls', () => {
      const types = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const challenge = engine.generateChallenge();
        types.add(challenge.type);
      }
      // With 100 iterations, we should see at least 2 different types
      expect(types.size).toBeGreaterThanOrEqual(2);
    });
  });
});
