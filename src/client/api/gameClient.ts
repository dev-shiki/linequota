import type {
  ApiErrorResponse,
  HintRequest,
  HintResponse,
  PuzzleResponse,
  SaveProgressRequest,
  ShareCommentRequest,
  ShareCommentResponse,
  SolveRequest,
  SolveResponse,
} from '../../shared/api';
import {
  findHintCell,
  formatShareGrid,
  generateDailyPuzzle,
  getPreviousUtcDateKey,
  getUtcDateKey,
  toPublicPuzzle,
  validateBoard,
} from '../../shared/puzzle';
import type { CommunityStats, UserDailyRecord } from '../../shared/types';

interface LocalStoreState {
  streak: number;
  lastSolvedDate: string | null;
  solves: Record<
    string,
    { elapsedSeconds: number; moves: number; hintsUsed: number; shareText: string }
  >;
  progress: Record<string, { activeKeys: string[]; markedKeys: string[]; hintsUsed: number }>;
}

const LOCAL_KEY = 'linequota_local_v1';

function readLocalStore(): LocalStoreState {
  const empty: LocalStoreState = {
    streak: 0,
    lastSolvedDate: null,
    solves: {},
    progress: {},
  };
  if (typeof window === 'undefined') return empty;
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as Partial<LocalStoreState>;
    return {
      streak: typeof parsed.streak === 'number' ? parsed.streak : 0,
      lastSolvedDate: typeof parsed.lastSolvedDate === 'string' ? parsed.lastSolvedDate : null,
      solves: parsed.solves ?? {},
      progress: parsed.progress ?? {},
    };
  } catch {
    return empty;
  }
}

function writeLocalStore(state: LocalStoreState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors
  }
}

function buildLocalCommunity(store: LocalStoreState, dateKey: string): CommunityStats {
  const solve = store.solves[dateKey];
  if (!solve) {
    return {
      totalSolves: 0,
      cleanSolves: 0,
      fastestSeconds: null,
      leaderboard: [],
    };
  }
  return {
    totalSolves: 1,
    cleanSolves: solve.hintsUsed === 0 ? 1 : 0,
    fastestSeconds: solve.elapsedSeconds,
    leaderboard: [
      {
        rank: 1,
        username: 'local-player',
        elapsedSeconds: solve.elapsedSeconds,
        moves: solve.moves,
        hintsUsed: solve.hintsUsed,
      },
    ],
  };
}

export async function fetchPuzzle(dateKey: string): Promise<PuzzleResponse> {
  try {
    const res = await fetch(`/api/puzzle?date=${encodeURIComponent(dateKey)}`);
    const contentType = res.headers.get('content-type') ?? '';
    if (res.ok && contentType.includes('application/json')) {
      return (await res.json()) as PuzzleResponse;
    }
  } catch {
    // Fall back to deterministic local mode when Devvit backend is absent
  }

  const store = readLocalStore();
  const daily = generateDailyPuzzle(dateKey);
  const solve = store.solves[dateKey];
  const progress = store.progress[dateKey];

  const userRecord: UserDailyRecord = {
    solved: solve !== undefined,
    elapsedSeconds: solve?.elapsedSeconds ?? null,
    moves: solve?.moves ?? null,
    hintsUsed: solve?.hintsUsed ?? progress?.hintsUsed ?? 0,
    streak: store.streak,
    lastSolvedDate: store.lastSolvedDate,
  };

  return {
    type: 'puzzle',
    mode: 'local',
    postId: 'local-preview',
    username: 'local-player',
    puzzle: toPublicPuzzle(daily),
    userRecord,
    community: buildLocalCommunity(store, dateKey),
    savedActiveKeys: progress?.activeKeys ?? [],
    savedMarkedKeys: progress?.markedKeys ?? [],
  };
}

export async function saveProgress(
  req: SaveProgressRequest,
  mode: 'reddit' | 'local'
): Promise<void> {
  if (mode === 'reddit') {
    try {
      await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });
      return;
    } catch {
      // Non-fatal network save skip
    }
  }

  const store = readLocalStore();
  const prev = store.progress[req.dateKey];
  store.progress[req.dateKey] = {
    activeKeys: req.activeKeys,
    markedKeys: req.markedKeys,
    hintsUsed: prev?.hintsUsed ?? 0,
  };
  writeLocalStore(store);
}

export async function requestHint(
  req: HintRequest,
  mode: 'reddit' | 'local'
): Promise<HintResponse> {
  if (mode === 'reddit') {
    const res = await fetch('/api/hint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (res.ok) {
      return (await res.json()) as HintResponse;
    }
    const err = (await res.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(err?.message ?? 'Could not retrieve hint');
  }

  const store = readLocalStore();
  const prev = store.progress[req.dateKey] ?? {
    activeKeys: req.activeKeys,
    markedKeys: [],
    hintsUsed: 0,
  };
  const nextHints = prev.hintsUsed + 1;
  store.progress[req.dateKey] = {
    activeKeys: req.activeKeys,
    markedKeys: prev.markedKeys,
    hintsUsed: nextHints,
  };
  writeLocalStore(store);

  const puzzle = generateDailyPuzzle(req.dateKey);
  const hint = findHintCell(puzzle, req.activeKeys);
  return {
    type: 'hint',
    action: hint.action,
    coord: hint.coord,
    message: hint.message,
    hintsUsed: nextHints,
  };
}

export async function submitSolve(
  req: SolveRequest,
  mode: 'reddit' | 'local'
): Promise<SolveResponse> {
  if (mode === 'reddit') {
    const res = await fetch('/api/solve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (res.ok) {
      return (await res.json()) as SolveResponse;
    }
    const err = (await res.json().catch(() => null)) as ApiErrorResponse | null;
    throw new Error(err?.message ?? 'Could not submit solve');
  }

  const puzzle = generateDailyPuzzle(req.dateKey);
  const pub = toPublicPuzzle(puzzle);
  const validation = validateBoard(pub, req.activeKeys);
  if (!validation.isValidPath) {
    throw new Error(validation.reason);
  }

  const store = readLocalStore();
  const existing = store.solves[req.dateKey];
  if (!existing) {
    const recordedHints = store.progress[req.dateKey]?.hintsUsed ?? 0;
    const effectiveHints = Math.max(req.hintsUsed, recordedHints);
    const todayUtc = getUtcDateKey();
    if (req.dateKey === todayUtc) {
      const prevDate = getPreviousUtcDateKey(req.dateKey);
      if (store.lastSolvedDate === prevDate) {
        store.streak += 1;
      } else if (store.lastSolvedDate !== req.dateKey) {
        store.streak = 1;
      }
      store.lastSolvedDate = req.dateKey;
    }
    const shareText = formatShareGrid(
      pub,
      req.activeKeys,
      req.elapsedSeconds,
      req.moves,
      effectiveHints,
      store.streak
    );
    store.solves[req.dateKey] = {
      elapsedSeconds: req.elapsedSeconds,
      moves: req.moves,
      hintsUsed: effectiveHints,
      shareText,
    };
    writeLocalStore(store);
  }

  const saved = store.solves[req.dateKey]!;
  return {
    type: 'solve',
    accepted: true,
    message: 'Solved locally. Open on Reddit to post to the community leaderboard.',
    userRecord: {
      solved: true,
      elapsedSeconds: saved.elapsedSeconds,
      moves: saved.moves,
      hintsUsed: saved.hintsUsed,
      streak: store.streak,
      lastSolvedDate: store.lastSolvedDate,
    },
    community: buildLocalCommunity(store, req.dateKey),
    shareText: saved.shareText,
  };
}

export async function postShareComment(
  req: ShareCommentRequest,
  mode: 'reddit' | 'local'
): Promise<ShareCommentResponse> {
  if (mode === 'local') {
    return {
      type: 'share-comment',
      posted: false,
      message: 'Local preview cannot post to Reddit. Use Copy Result instead.',
    };
  }

  const res = await fetch('/api/share-comment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    return {
      type: 'share-comment',
      posted: false,
      message: 'Could not post comment to thread. Use Copy Result instead.',
    };
  }
  return (await res.json()) as ShareCommentResponse;
}
