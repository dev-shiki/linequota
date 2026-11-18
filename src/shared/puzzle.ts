import { createRng, hashString, randInt, shuffleInPlace } from './prng';
import type {
  DailyPuzzle,
  GridCoord,
  PuzzlePublic,
  QuotaStatus,
  TileKind,
  ValidationResult,
} from './types';

export const GRID_SIZE = 5;
export const LAUNCH_DATE_KEY = '2026-11-18';

const DIRS: readonly GridCoord[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

export function coordKey(coord: GridCoord): string {
  return `${coord.row},${coord.col}`;
}

export function sameCoord(a: GridCoord, b: GridCoord): boolean {
  return a.row === b.row && a.col === b.col;
}

export function isValidDateKey(dateKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

export function getUtcDateKey(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getPreviousUtcDateKey(dateKey: string): string {
  const parsed = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(parsed)) return dateKey;
  return getUtcDateKey(new Date(parsed - 86_400_000));
}

export function getPuzzleNumber(dateKey: string): number {
  const launchMs = Date.parse(`${LAUNCH_DATE_KEY}T00:00:00Z`);
  const targetMs = Date.parse(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(launchMs) || Number.isNaN(targetMs)) return 1;
  const diffDays = Math.round((targetMs - launchMs) / 86_400_000);
  return diffDays >= 0 ? diffDays + 1 : Math.abs(diffDays) + 1000;
}

export function toPublicPuzzle(puzzle: DailyPuzzle): PuzzlePublic {
  return {
    dateKey: puzzle.dateKey,
    puzzleNumber: puzzle.puzzleNumber,
    size: puzzle.size,
    start: puzzle.start,
    end: puzzle.end,
    relays: puzzle.relays,
    walls: puzzle.walls,
    rowTargets: puzzle.rowTargets,
    colTargets: puzzle.colTargets,
    parMoves: puzzle.parMoves,
  };
}

export function getTileKind(puzzle: PuzzlePublic, coord: GridCoord): TileKind {
  if (sameCoord(puzzle.start, coord)) return 'start';
  if (sameCoord(puzzle.end, coord)) return 'end';
  if (puzzle.walls.some((w) => sameCoord(w, coord))) return 'wall';
  if (puzzle.relays.some((r) => sameCoord(r, coord))) return 'relay';
  return 'open';
}

export function isFixedTile(kind: TileKind): boolean {
  return kind === 'start' || kind === 'end' || kind === 'wall';
}

export function isRequiredPathTile(kind: TileKind): boolean {
  return kind === 'start' || kind === 'end' || kind === 'relay';
}

function getNeighbors(coord: GridCoord, size: number): GridCoord[] {
  const result: GridCoord[] = [];
  for (const d of DIRS) {
    const nr = coord.row + d.row;
    const nc = coord.col + d.col;
    if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
      result.push({ row: nr, col: nc });
    }
  }
  return result;
}

export function countSolutions(
  puzzle: PuzzlePublic,
  maxCount = 2
): { count: number; firstSolution: GridCoord[] | null } {
  const { size, start, end, relays, walls, rowTargets, colTargets } = puzzle;
  const totalNeeded = rowTargets.reduce((sum, n) => sum + n, 0);

  const wallSet = new Set(walls.map(coordKey));
  const relaySet = new Set(relays.map(coordKey));
  const visited = new Set<string>([coordKey(start)]);
  const rowCounts = Array<number>(size).fill(0);
  const colCounts = Array<number>(size).fill(0);
  rowCounts[start.row] = 1;
  colCounts[start.col] = 1;

  const path: GridCoord[] = [start];
  let count = 0;
  let firstSolution: GridCoord[] | null = null;
  let relaysVisited = relaySet.has(coordKey(start)) ? 1 : 0;

  const canReachEndWithRemaining = (curr: GridCoord): boolean => {
    for (let r = 0; r < size; r += 1) {
      const need = (rowTargets[r] ?? 0) - (rowCounts[r] ?? 0);
      if (need < 0) return false;
      if (need > 0) {
        let avail = 0;
        for (let c = 0; c < size; c += 1) {
          const k = `${r},${c}`;
          if (!visited.has(k) && !wallSet.has(k)) avail += 1;
        }
        if (avail < need) return false;
      }
    }
    for (let c = 0; c < size; c += 1) {
      const need = (colTargets[c] ?? 0) - (colCounts[c] ?? 0);
      if (need < 0) return false;
      if (need > 0) {
        let avail = 0;
        for (let r = 0; r < size; r += 1) {
          const k = `${r},${c}`;
          if (!visited.has(k) && !wallSet.has(k)) avail += 1;
        }
        if (avail < need) return false;
      }
    }

    const minDist = Math.abs(curr.row - end.row) + Math.abs(curr.col - end.col);
    if (path.length + minDist > totalNeeded) return false;

    return true;
  };

  const dfs = (curr: GridCoord): void => {
    if (count >= maxCount) return;

    if (sameCoord(curr, end)) {
      if (path.length !== totalNeeded || relaysVisited !== relaySet.size) return;
      for (let i = 0; i < size; i += 1) {
        if (rowCounts[i] !== rowTargets[i] || colCounts[i] !== colTargets[i]) return;
      }
      count += 1;
      if (firstSolution === null) {
        firstSolution = [...path];
      }
      return;
    }

    if (!canReachEndWithRemaining(curr)) return;

    for (const next of getNeighbors(curr, size)) {
      const key = coordKey(next);
      if (visited.has(key) || wallSet.has(key)) continue;

      const nr = rowCounts[next.row] ?? 0;
      const nc = colCounts[next.col] ?? 0;
      if (nr + 1 > (rowTargets[next.row] ?? 0)) continue;
      if (nc + 1 > (colTargets[next.col] ?? 0)) continue;

      // Prevent forced dead-end on end unless remaining length matches
      if (sameCoord(next, end) && path.length + 1 !== totalNeeded) continue;

      visited.add(key);
      rowCounts[next.row] = nr + 1;
      colCounts[next.col] = nc + 1;
      path.push(next);
      const isRelay = relaySet.has(key);
      if (isRelay) relaysVisited += 1;

      dfs(next);

      if (isRelay) relaysVisited -= 1;
      path.pop();
      rowCounts[next.row] = nr;
      colCounts[next.col] = nc;
      visited.delete(key);

      if (count >= maxCount) return;
    }
  };

  dfs(start);
  return { count, firstSolution };
}

function carveRandomSimplePath(
  rng: () => number,
  size: number,
  targetLength: number
): GridCoord[] | null {
  const start: GridCoord = {
    row: randInt(rng, 0, 1),
    col: randInt(rng, 0, 1),
  };
  const endGoal: GridCoord = {
    row: randInt(rng, size - 2, size - 1),
    col: randInt(rng, size - 2, size - 1),
  };

  const path: GridCoord[] = [start];
  const visited = new Set<string>([coordKey(start)]);

  const step = (curr: GridCoord): boolean => {
    if (path.length === targetLength) {
      const distFromStart = Math.abs(curr.row - start.row) + Math.abs(curr.col - start.col);
      return distFromStart >= 4;
    }

    const candidates = shuffleInPlace(getNeighbors(curr, size), rng).filter((n) => {
      if (visited.has(coordKey(n))) return false;
      // Avoid 2x2 solid blocks to keep puzzles readable and clean
      let adjInPath = 0;
      for (const adj of getNeighbors(n, size)) {
        if (visited.has(coordKey(adj))) adjInPath += 1;
      }
      return adjInPath <= 1;
    });

    // Light bias toward endGoal near the final third of the walk
    if (path.length > Math.floor(targetLength * 0.65)) {
      candidates.sort((a, b) => {
        const da = Math.abs(a.row - endGoal.row) + Math.abs(a.col - endGoal.col);
        const db = Math.abs(b.row - endGoal.row) + Math.abs(b.col - endGoal.col);
        return da - db;
      });
    }

    for (const next of candidates) {
      const k = coordKey(next);
      visited.add(k);
      path.push(next);
      if (step(next)) return true;
      path.pop();
      visited.delete(k);
    }
    return false;
  };

  return step(start) ? path : null;
}

const FALLBACK_SOLUTION: readonly GridCoord[] = [
  { row: 0, col: 0 },
  { row: 0, col: 1 },
  { row: 0, col: 2 },
  { row: 1, col: 2 },
  { row: 2, col: 2 },
  { row: 2, col: 1 },
  { row: 2, col: 0 },
  { row: 3, col: 0 },
  { row: 4, col: 0 },
  { row: 4, col: 1 },
  { row: 4, col: 2 },
  { row: 3, col: 2 },
  { row: 3, col: 3 },
  { row: 4, col: 3 },
  { row: 4, col: 4 },
];

function buildFallbackPuzzle(dateKey: string): DailyPuzzle {
  const rowTargets = [3, 1, 3, 3, 5];
  const colTargets = [4, 2, 4, 2, 3];
  return {
    dateKey,
    puzzleNumber: getPuzzleNumber(dateKey),
    size: GRID_SIZE,
    start: { row: 0, col: 0 },
    end: { row: 4, col: 4 },
    relays: [
      { row: 2, col: 0 },
      { row: 3, col: 3 },
    ],
    walls: [
      { row: 1, col: 0 },
      { row: 1, col: 4 },
      { row: 2, col: 4 },
      { row: 0, col: 4 },
    ],
    rowTargets,
    colTargets,
    parMoves: FALLBACK_SOLUTION.length - 2,
    solution: [...FALLBACK_SOLUTION],
  };
}

export function generateDailyPuzzle(dateKey: string): DailyPuzzle {
  const baseSeed = hashString(`linequota:${dateKey}:v1`);
  const puzzleNumber = getPuzzleNumber(dateKey);

  for (let attempt = 0; attempt < 96; attempt += 1) {
    const rng = createRng((baseSeed + attempt * 7919) >>> 0);
    const targetLength = randInt(rng, 11, 15);
    const path = carveRandomSimplePath(rng, GRID_SIZE, targetLength);
    if (!path || path.length < 11) continue;

    const start = path[0];
    const end = path[path.length - 1];
    if (!start || !end) continue;

    const pathSet = new Set(path.map(coordKey));
    const rowTargets = Array<number>(GRID_SIZE).fill(0);
    const colTargets = Array<number>(GRID_SIZE).fill(0);
    for (const c of path) {
      rowTargets[c.row] = (rowTargets[c.row] ?? 0) + 1;
      colTargets[c.col] = (colTargets[c.col] ?? 0) + 1;
    }

    const nonPathCells: GridCoord[] = [];
    for (let r = 0; r < GRID_SIZE; r += 1) {
      for (let c = 0; c < GRID_SIZE; c += 1) {
        if (!pathSet.has(`${r},${c}`)) {
          nonPathCells.push({ row: r, col: c });
        }
      }
    }
    shuffleInPlace(nonPathCells, rng);

    const midA = path[Math.floor(path.length * 0.35)];
    const midB = path[Math.floor(path.length * 0.7)];
    const relays: GridCoord[] = [];
    if (midA && !sameCoord(midA, start) && !sameCoord(midA, end)) relays.push(midA);
    if (midB && !sameCoord(midB, start) && !sameCoord(midB, end) && (!midA || !sameCoord(midB, midA))) {
      relays.push(midB);
    }

    const walls = nonPathCells.slice(0, Math.min(4, nonPathCells.length));
    const candidate: DailyPuzzle = {
      dateKey,
      puzzleNumber,
      size: GRID_SIZE,
      start,
      end,
      relays,
      walls,
      rowTargets,
      colTargets,
      parMoves: path.length - 2,
      solution: path,
    };

    let check = countSolutions(candidate, 2);
    if (check.count === 1) return candidate;

    // Tighten uniqueness with up to 2 additional walls or 1 additional relay
    let extraWallIdx = 4;
    while (check.count > 1 && extraWallIdx < Math.min(6, nonPathCells.length)) {
      const w = nonPathCells[extraWallIdx];
      extraWallIdx += 1;
      if (w) {
        walls.push(w);
        check = countSolutions(candidate, 2);
      }
    }
    if (check.count === 1) return candidate;

    const midC = path[Math.floor(path.length * 0.52)];
    if (
      midC &&
      !sameCoord(midC, start) &&
      !sameCoord(midC, end) &&
      !relays.some((r) => sameCoord(r, midC))
    ) {
      relays.push(midC);
      check = countSolutions(candidate, 2);
      if (check.count === 1) return candidate;
    }
  }

  return buildFallbackPuzzle(dateKey);
}

function parseValidCoordKey(key: string, size: number): GridCoord | null {
  const parts = key.split(',');
  if (parts.length !== 2) return null;
  const r = Number(parts[0]);
  const c = Number(parts[1]);
  if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= size || c < 0 || c >= size) {
    return null;
  }
  return { row: r, col: c };
}

export function validateBoard(puzzle: PuzzlePublic, rawActiveKeys: Iterable<string>): ValidationResult {
  const { size, start, end, relays, walls, rowTargets, colTargets } = puzzle;
  const wallSet = new Set(walls.map(coordKey));
  const activeSet = new Set<string>();

  for (const key of rawActiveKeys) {
    const parsed = parseValidCoordKey(key, size);
    if (!parsed) continue;
    const canonicalKey = coordKey(parsed);
    if (!wallSet.has(canonicalKey)) activeSet.add(canonicalKey);
  }
  activeSet.add(coordKey(start));
  activeSet.add(coordKey(end));

  const rowCounts = Array<number>(size).fill(0);
  const colCounts = Array<number>(size).fill(0);

  for (const key of activeSet) {
    const [rStr, cStr] = key.split(',');
    const r = Number(rStr);
    const c = Number(cStr);
    if (Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < size && c >= 0 && c < size) {
      rowCounts[r] = (rowCounts[r] ?? 0) + 1;
      colCounts[c] = (colCounts[c] ?? 0) + 1;
    }
  }

  const rowStatus: QuotaStatus[] = rowCounts.map((count, i) => {
    const target = rowTargets[i] ?? 0;
    if (count < target) return 'under';
    if (count === target) return 'exact';
    return 'over';
  });

  const colStatus: QuotaStatus[] = colCounts.map((count, i) => {
    const target = colTargets[i] ?? 0;
    if (count < target) return 'under';
    if (count === target) return 'exact';
    return 'over';
  });

  // BFS from start across active cells
  const startKey = coordKey(start);
  const endKey = coordKey(end);
  const connected = new Set<string>([startKey]);
  const queue: GridCoord[] = [start];

  while (queue.length > 0) {
    const curr = queue.shift();
    if (!curr) continue;
    for (const next of getNeighbors(curr, size)) {
      const k = coordKey(next);
      if (activeSet.has(k) && !connected.has(k)) {
        connected.add(k);
        queue.push(next);
      }
    }
  }

  const connectedFromStart = Array.from(connected);
  const disconnectedActive = Array.from(activeSet).filter((k) => !connected.has(k));

  // Degree check: start/end must have degree 1; internal nodes must have degree 2
  const branchedCells: string[] = [];
  let hasDegreeDefect = false;

  for (const key of connected) {
    const [rStr, cStr] = key.split(',');
    const coord: GridCoord = { row: Number(rStr), col: Number(cStr) };
    let degree = 0;
    for (const next of getNeighbors(coord, size)) {
      if (activeSet.has(coordKey(next))) degree += 1;
    }
    const isTerminal = key === startKey || key === endKey;
    if (isTerminal) {
      if (degree > 1) branchedCells.push(key);
      if (degree !== 1) hasDegreeDefect = true;
    } else {
      if (degree > 2) branchedCells.push(key);
      if (degree !== 2) hasDegreeDefect = true;
    }
  }

  const reachedEnd = connected.has(endKey);
  const relaysHit = relays.filter((r) => connected.has(coordKey(r))).length;
  const relaysTotal = relays.length;
  const quotasExact =
    rowStatus.every((s) => s === 'exact') && colStatus.every((s) => s === 'exact');

  const isValidPath =
    reachedEnd &&
    disconnectedActive.length === 0 &&
    !hasDegreeDefect &&
    branchedCells.length === 0 &&
    relaysHit === relaysTotal &&
    quotasExact;

  let reason = 'Path complete. All row and column quotas matched.';
  if (!isValidPath) {
    const overRows = rowStatus.filter((s) => s === 'over').length;
    const overCols = colStatus.filter((s) => s === 'over').length;
    if (branchedCells.length > 0) {
      reason = 'Branch detected. Keep a single unbranched line from START to END.';
    } else if (overRows > 0 || overCols > 0) {
      reason = 'Over quota on highlighted row or column.';
    } else if (disconnectedActive.length > 0) {
      reason = 'Disconnected cell outside the circuit from START.';
    } else if (!reachedEnd) {
      reason = 'Connect the route from START to END.';
    } else if (relaysHit < relaysTotal) {
      reason = `Route must pass through all ${relaysTotal} relay nodes (${relaysHit}/${relaysTotal}).`;
    } else {
      reason = 'Match every row and column target count.';
    }
  }

  return {
    isValidPath,
    connectedFromStart,
    disconnectedActive,
    branchedCells,
    reachedEnd,
    relaysHit,
    relaysTotal,
    rowCounts,
    colCounts,
    rowStatus,
    colStatus,
    reason,
  };
}

export function findHintCell(
  puzzle: DailyPuzzle,
  rawActiveKeys: Iterable<string>
): { action: 'add' | 'remove'; coord: GridCoord; message: string } {
  const activeSet = new Set<string>();
  for (const key of rawActiveKeys) {
    const parsed = parseValidCoordKey(key, puzzle.size);
    if (parsed) activeSet.add(coordKey(parsed));
  }
  const solutionSet = new Set(puzzle.solution.map(coordKey));

  for (const key of activeSet) {
    if (!solutionSet.has(key)) {
      const coord = parseValidCoordKey(key, puzzle.size);
      if (coord && !isFixedTile(getTileKind(puzzle, coord))) {
        return {
          action: 'remove',
          coord,
          message: `Remove Row ${coord.row + 1}, Col ${coord.col + 1} (off the solution route).`,
        };
      }
    }
  }

  for (const coord of puzzle.solution) {
    const k = coordKey(coord);
    if (!activeSet.has(k)) {
      return {
        action: 'add',
        coord,
        message: `Activate Row ${coord.row + 1}, Col ${coord.col + 1} on the route.`,
      };
    }
  }

  return {
    action: 'add',
    coord: puzzle.end,
    message: 'Route already matches the solution.',
  };
}

export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatShareGrid(
  puzzle: PuzzlePublic,
  rawActiveKeys: Iterable<string>,
  elapsedSeconds: number,
  moves: number,
  hintsUsed: number,
  streak: number
): string {
  const validation = validateBoard(puzzle, rawActiveKeys);
  const rowBadges = validation.rowCounts
    .map((count, i) => `${count}/${puzzle.rowTargets[i] ?? 0}`)
    .join(' | ');
  const hintLabel =
    hintsUsed === 0 ? 'Clean solve' : `${hintsUsed} hint${hintsUsed === 1 ? '' : 's'}`;
  const streakLabel = streak > 0 ? ` | Streak: ${streak}d` : '';

  return [
    `LineQuota #${puzzle.puzzleNumber} (${puzzle.dateKey})`,
    `Time: ${formatDuration(elapsedSeconds)} | Moves: ${moves} | ${hintLabel}${streakLabel}`,
    `Relays: ${validation.relaysHit}/${validation.relaysTotal} | Quotas: [${rowBadges}]`,
  ].join('\n');
}
