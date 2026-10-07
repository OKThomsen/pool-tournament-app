import { describe, expect, it } from 'vitest';
import {
  backToBackCount,
  nextOpponent,
  playOrder,
  roundRobinRounds,
  samePairing,
  upNext,
} from './schedule.js';
import type { Pairing } from './types.js';

const five = ['A', 'B', 'C', 'D', 'E'];
const four = ['A', 'B', 'C', 'D'];

function everyPairOnce(players: string[], matches: Pairing[]) {
  const expected = (players.length * (players.length - 1)) / 2;
  expect(matches).toHaveLength(expected);
  for (let i = 0; i < matches.length; i++) {
    for (let j = i + 1; j < matches.length; j++) {
      expect(samePairing(matches[i]!, matches[j]!)).toBe(false);
    }
  }
}

describe('roundRobinRounds', () => {
  it.each([[four], [five]])('plays every pair exactly once (%j)', (players) => {
    everyPairOnce(
      players,
      roundRobinRounds(players).flatMap((round) => round.matches),
    );
  });

  it('gives each player in a pool of 5 exactly one bye, never two rounds in a row', () => {
    const rounds = roundRobinRounds(five);
    expect(rounds).toHaveLength(5);
    expect(rounds.map((round) => round.bye).sort()).toEqual(five);
    for (const round of rounds) expect(round.matches).toHaveLength(2);
  });

  it('has no byes in a pool of 4', () => {
    expect(roundRobinRounds(four).every((round) => round.bye === null)).toBe(true);
  });
});

describe('playOrder', () => {
  it('orders a pool of 5 so nobody plays two matches in a row', () => {
    const order = playOrder(roundRobinRounds(five));
    everyPairOnce(five, order);
    expect(backToBackCount(order)).toBe(0);
  });

  it('keeps matches grouped by round', () => {
    const rounds = roundRobinRounds(five);
    const order = playOrder(rounds);
    rounds.forEach((round, r) => {
      const slice = order.slice(r * 2, r * 2 + 2);
      for (const match of round.matches) {
        expect(slice.some((m) => samePairing(m, match))).toBe(true);
      }
    });
  });
});

describe('upNext and nextOpponent', () => {
  const order: Pairing[] = [
    { playerA: 'A', playerB: 'B' },
    { playerA: 'C', playerB: 'D' },
    { playerA: 'A', playerB: 'C' },
  ];

  it('returns the first unplayed matches', () => {
    expect(upNext(order, [{ playerA: 'B', playerB: 'A' }], 2)).toEqual(order.slice(1));
  });

  it("returns a player's next opponent", () => {
    expect(nextOpponent(order, [order[0]!], 'A')).toBe('C');
    expect(nextOpponent(order, order, 'A')).toBeNull();
  });
});
