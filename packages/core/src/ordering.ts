import type { PlayerId } from './types.js';

/**
 * Splits items into groups with equal keys, best (highest) key first. Keys are compared element
 * by element, so `[wins, setScore]` sorts by wins and then set score. Stable within a group.
 */
export function groupByDesc<T>(items: readonly T[], key: (item: T) => number[]): T[][] {
  const sorted = [...items].sort((x, y) => compareDesc(key(x), key(y)));
  const groups: T[][] = [];
  for (const item of sorted) {
    const last = groups.at(-1);
    if (last && compareDesc(key(last[0]!), key(item)) === 0) last.push(item);
    else groups.push([item]);
  }
  return groups;
}

/** Splits a still-tied group in the admin's chosen order, if the admin has ordered all of it. */
export function breakByAdminOrder(
  tied: readonly PlayerId[],
  adminOrder: readonly PlayerId[],
): PlayerId[][] {
  if (tied.length === 1 || !tied.every((id) => adminOrder.includes(id))) return [[...tied]];
  return [...tied].sort((x, y) => adminOrder.indexOf(x) - adminOrder.indexOf(y)).map((id) => [id]);
}

function compareDesc(x: number[], y: number[]): number {
  for (let i = 0; i < x.length; i++) {
    if (x[i] !== y[i]) return y[i]! - x[i]!;
  }
  return 0;
}

/**
 * Every ordering of the items, in order of preference: the first item's original position
 * varies slowest, so the input order itself comes first.
 */
export function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}
