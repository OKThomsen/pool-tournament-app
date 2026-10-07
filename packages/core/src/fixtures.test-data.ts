import type { MatchResult } from './types.js';

/** Pool results from the workbook's Group Matches sheet (also pasted into the wireframes). */
function results(rows: [string, string, number, number][]): MatchResult[] {
  return rows.map(([playerA, playerB, framesA, framesB]) => ({
    playerA,
    playerB,
    framesA,
    framesB,
  }));
}

export const groupA = {
  players: ['Christian', 'Prasad', 'Sarah Liv', 'Kasper'],
  results: results([
    ['Christian', 'Prasad', 2, 0],
    ['Christian', 'Sarah Liv', 2, 1],
    ['Christian', 'Kasper', 1, 2],
    ['Prasad', 'Sarah Liv', 2, 1],
    ['Prasad', 'Kasper', 1, 2],
    ['Sarah Liv', 'Kasper', 0, 2],
  ]),
};

export const groupB = {
  players: ['Martin J.', 'Ann', 'Ankush', 'Kent'],
  results: results([
    ['Martin J.', 'Ann', 0, 2],
    ['Martin J.', 'Ankush', 0, 2],
    ['Martin J.', 'Kent', 2, 0],
    ['Ann', 'Ankush', 0, 2],
    ['Ann', 'Kent', 1, 2],
    ['Ankush', 'Kent', 2, 1],
  ]),
};

export const groupC = {
  players: ['Martin E.', 'Tobias', 'Jacky', 'Mads'],
  results: results([
    ['Martin E.', 'Tobias', 2, 1],
    ['Martin E.', 'Jacky', 0, 2],
    ['Martin E.', 'Mads', 2, 0],
    ['Tobias', 'Jacky', 0, 2],
    ['Tobias', 'Mads', 2, 0],
    ['Jacky', 'Mads', 2, 1],
  ]),
};
