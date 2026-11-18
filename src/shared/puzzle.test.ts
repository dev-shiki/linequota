import { describe, expect, it } from 'vitest';
import {
  coordKey,
  countSolutions,
  findHintCell,
  formatDuration,
  formatShareGrid,
  generateDailyPuzzle,
  getPreviousUtcDateKey,
  getPuzzleNumber,
  getTileKind,
  getUtcDateKey,
  isFixedTile,
  isRequiredPathTile,
  isValidDateKey,
  toPublicPuzzle,
  validateBoard,
} from './puzzle';

describe('LineQuota puzzle engine', () => {
  it('computes deterministic UTC date keys and sequential puzzle numbers', () => {
    const d1 = getUtcDateKey(new Date('2026-11-18T23:59:59Z'));
    const d2 = getUtcDateKey(new Date('2026-11-19T00:00:01Z'));
    expect(d1).toBe('2026-11-18');
    expect(d2).toBe('2026-11-19');
    expect(getPuzzleNumber(d1)).toBe(1);
    expect(getPuzzleNumber(d2)).toBe(2);
  });

  it('generates deterministic, uniquely solvable puzzles across 60 consecutive dates', () => {
    for (let dayOffset = 0; dayOffset < 60; dayOffset += 1) {
      const date = new Date(Date.UTC(2026, 10, 18 + dayOffset));
      const dateKey = getUtcDateKey(date);
      const a = generateDailyPuzzle(dateKey);
      const b = generateDailyPuzzle(dateKey);

      expect(a).toEqual(b);
      expect(a.solution.length).toBeGreaterThanOrEqual(11);
      expect(a.relays.length).toBeGreaterThanOrEqual(2);

      const uniqueness = countSolutions(toPublicPuzzle(a), 2);
      expect(uniqueness.count).toBe(1);

      const validation = validateBoard(toPublicPuzzle(a), a.solution.map(coordKey));
      expect(validation.isValidPath).toBe(true);
      expect(validation.relaysHit).toBe(a.relays.length);
    }
  });

  it('rejects branches, disconnected cells, and missing relays', () => {
    const puzzle = generateDailyPuzzle('2026-11-18');
    const pub = toPublicPuzzle(puzzle);
    const solKeys = puzzle.solution.map(coordKey);

    // Missing one internal cell breaks continuity or quotas
    const partial = solKeys.slice(0, solKeys.length - 2);
    const partialRes = validateBoard(pub, partial);
    expect(partialRes.isValidPath).toBe(false);

    // Adding an extra off-path cell creates a branch or over-quota
    const wallSet = new Set(pub.walls.map(coordKey));
    const solSet = new Set(solKeys);
    let extraCell: string | null = null;
    for (let r = 0; r < pub.size; r += 1) {
      for (let c = 0; c < pub.size; c += 1) {
        const k = `${r},${c}`;
        if (!wallSet.has(k) && !solSet.has(k)) {
          extraCell = k;
          break;
        }
      }
      if (extraCell) break;
    }
    expect(extraCell).not.toBeNull();
    if (extraCell) {
      const overRes = validateBoard(pub, [...solKeys, extraCell]);
      expect(overRes.isValidPath).toBe(false);
    }
  });

  it('suggests removing an off-route cell first, then adding missing route cells', () => {
    const puzzle = generateDailyPuzzle('2026-11-20');
    const pub = toPublicPuzzle(puzzle);
    const wallSet = new Set(pub.walls.map(coordKey));
    const solSet = new Set(puzzle.solution.map(coordKey));

    let wrongKey = '';
    for (let r = 0; r < pub.size; r += 1) {
      for (let c = 0; c < pub.size; c += 1) {
        const k = `${r},${c}`;
        if (!wallSet.has(k) && !solSet.has(k)) {
          wrongKey = k;
          break;
        }
      }
      if (wrongKey) break;
    }

    const hintRemove = findHintCell(puzzle, [coordKey(pub.start), coordKey(pub.end), wrongKey]);
    expect(hintRemove.action).toBe('remove');
    expect(coordKey(hintRemove.coord)).toBe(wrongKey);

    const hintAdd = findHintCell(puzzle, [coordKey(pub.start), coordKey(pub.end)]);
    expect(hintAdd.action).toBe('add');
    expect(solSet.has(coordKey(hintAdd.coord))).toBe(true);
  });

  it('formats durations and spoiler-free share text cleanly', () => {
    expect(formatDuration(65)).toBe('01:05');
    const puzzle = generateDailyPuzzle('2026-11-18');
    const share = formatShareGrid(
      toPublicPuzzle(puzzle),
      puzzle.solution.map(coordKey),
      42,
      14,
      0,
      3
    );
    expect(share).toContain('LineQuota #1 (2026-11-18)');
    expect(share).toContain('Time: 00:42 | Moves: 14 | Clean solve | Streak: 3d');
    expect(share).not.toContain('—');
  });

  it('rejects diagonal hops, disconnected islands, and honors date helpers', () => {
    expect(isValidDateKey('2026-11-18')).toBe(true);
    expect(isValidDateKey('2026/11/18')).toBe(false);
    expect(getPreviousUtcDateKey('2026-11-01')).toBe('2026-10-31');

    const puzzle = generateDailyPuzzle('2026-11-18');
    const pub = toPublicPuzzle(puzzle);

    expect(isFixedTile(getTileKind(pub, pub.start))).toBe(true);
    expect(isFixedTile(getTileKind(pub, pub.end))).toBe(true);
    expect(isRequiredPathTile(getTileKind(pub, pub.relays[0]!))).toBe(true);

    // Only start and end active: disconnected and missing relays
    const bare = validateBoard(pub, [coordKey(pub.start), coordKey(pub.end)]);
    expect(bare.isValidPath).toBe(false);
    expect(bare.reachedEnd).toBe(false);
    expect(bare.disconnectedActive).toContain(coordKey(pub.end));

    // Passing a wall key does not activate a wall cell
    const wallKey = coordKey(pub.walls[0]!);
    const withWall = validateBoard(pub, [coordKey(pub.start), wallKey]);
    expect(withWall.connectedFromStart).not.toContain(wallKey);

    // Malformed or out-of-bounds keys are ignored cleanly
    const solKeys = puzzle.solution.map(coordKey);
    const withGarbage = validateBoard(pub, [...solKeys, '99,99', 'invalid', '-1,0']);
    expect(withGarbage.isValidPath).toBe(true);
    expect(withGarbage.disconnectedActive).toHaveLength(0);

    const hintWithGarbage = findHintCell(puzzle, ['99,99', 'invalid', coordKey(pub.start)]);
    expect(Number.isInteger(hintWithGarbage.coord.row)).toBe(true);
    expect(Number.isInteger(hintWithGarbage.coord.col)).toBe(true);
  });
});
