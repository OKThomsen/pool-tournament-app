import { describe, expect, it } from 'vitest';
import { assertValidScore } from './match.js';

describe('assertValidScore', () => {
  it.each([
    [2, 0],
    [2, 1],
    [0, 2],
    [1, 2],
  ])('accepts %i-%i as a race to 2', (a, b) => {
    expect(() => assertValidScore(a, b)).not.toThrow();
  });

  it.each([
    [1, 1, 'a draw'],
    [1, 0, 'an unfinished race'],
    [3, 1, 'too many frames for the winner'],
    [2, 2, 'both players reaching the race'],
    [-1, 2, 'negative frames'],
    [1.5, 2, 'fractional frames'],
  ])('rejects %i-%i (%s)', (a, b) => {
    expect(() => assertValidScore(a, b)).toThrow(RangeError);
  });

  it('uses the given race length', () => {
    expect(() => assertValidScore(3, 2, 3)).not.toThrow();
    expect(() => assertValidScore(2, 1, 3)).toThrow(RangeError);
  });

  it('rejects a race length below 1', () => {
    expect(() => assertValidScore(0, 0, 0)).toThrow(RangeError);
  });
});
