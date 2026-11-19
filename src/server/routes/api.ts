import { Hono } from 'hono';
import { context, reddit, redis } from '@devvit/web/server';
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
  isValidDateKey,
  toPublicPuzzle,
  validateBoard,
} from '../../shared/puzzle';
import type { CommunityStats, LeaderboardEntry, UserDailyRecord } from '../../shared/types';

export const api = new Hono();

interface StoredUserStats {
  streak?: number;
  lastSolvedDate?: string | null;
}

interface StoredProgress {
  activeKeys?: string[];
  markedKeys?: string[];
  hintsUsed?: number;
}

interface StoredSolveRecord {
  elapsedSeconds: number;
  moves: number;
  hintsUsed: number;
}

function getSafeDateKey(raw?: string | null): string {
  if (raw && isValidDateKey(raw)) return raw;
  return getUtcDateKey();
}

function getUserScope(username: string): string {
  return username.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function parseJsonSafe<T>(raw: string | undefined | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function loadCommunityStats(dateKey: string): Promise<CommunityStats> {
  const statsKey = `lq:stats:${dateKey}`;
  const lbKey = `lq:lb:${dateKey}`;

  const [totalRaw, cleanRaw, topRows] = await Promise.all([
    redis.hGet(statsKey, 'totalSolves'),
    redis.hGet(statsKey, 'cleanSolves'),
    redis.zRange(lbKey, 0, 9, { by: 'rank' }),
  ]);

  const totalSolves = totalRaw ? Number.parseInt(totalRaw, 10) || 0 : 0;
  const cleanSolves = cleanRaw ? Number.parseInt(cleanRaw, 10) || 0 : 0;

  const leaderboard: LeaderboardEntry[] = [];
  for (let i = 0; i < topRows.length; i += 1) {
    const entry = topRows[i];
    if (!entry) continue;
    const member = entry.member;
    const detailRaw = await redis.get(`lq:solve:${dateKey}:${member}`);
    const detail = parseJsonSafe<StoredSolveRecord | null>(detailRaw, null);
    leaderboard.push({
      rank: i + 1,
      username: member,
      elapsedSeconds: detail?.elapsedSeconds ?? Math.round(entry.score % 100000),
      moves: detail?.moves ?? 0,
      hintsUsed: detail?.hintsUsed ?? 0,
    });
  }

  const fastestSeconds =
    leaderboard.length > 0 && leaderboard[0] ? leaderboard[0].elapsedSeconds : null;

  return {
    totalSolves,
    cleanSolves,
    fastestSeconds,
    leaderboard,
  };
}

api.get('/puzzle', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'postId is required in Devvit context' },
      400
    );
  }

  try {
    const dateKey = getSafeDateKey(c.req.query('date'));
    const puzzle = generateDailyPuzzle(dateKey);
    const username = (await reddit.getCurrentUsername()) ?? 'player';
    const scope = getUserScope(username);

    const [statsRaw, progressRaw, solveRaw, community] = await Promise.all([
      redis.get(`lq:userstats:${scope}`),
      redis.get(`lq:progress:${dateKey}:${scope}`),
      redis.get(`lq:solve:${dateKey}:${username}`),
      loadCommunityStats(dateKey),
    ]);

    const userStats = parseJsonSafe<StoredUserStats>(statsRaw, {});
    const progress = parseJsonSafe<StoredProgress>(progressRaw, {});
    const solveRecord = parseJsonSafe<StoredSolveRecord | null>(solveRaw, null);

    const userRecord: UserDailyRecord = {
      solved: solveRecord !== null,
      elapsedSeconds: solveRecord?.elapsedSeconds ?? null,
      moves: solveRecord?.moves ?? null,
      hintsUsed: solveRecord?.hintsUsed ?? progress.hintsUsed ?? 0,
      streak: userStats.streak ?? 0,
      lastSolvedDate: userStats.lastSolvedDate ?? null,
    };

    return c.json<PuzzleResponse>({
      type: 'puzzle',
      mode: 'reddit',
      postId,
      username,
      puzzle: toPublicPuzzle(puzzle),
      userRecord,
      community,
      savedActiveKeys: progress.activeKeys ?? [],
      savedMarkedKeys: progress.markedKeys ?? [],
    });
  } catch (error) {
    console.error('Error loading puzzle:', error);
    return c.json<ApiErrorResponse>(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to load puzzle',
      },
      500
    );
  }
});

api.post('/progress', async (c) => {
  try {
    const body = await c.req.json<SaveProgressRequest>();
    const dateKey = getSafeDateKey(body.dateKey);
    const username = (await reddit.getCurrentUsername()) ?? 'player';
    const scope = getUserScope(username);
    const key = `lq:progress:${dateKey}:${scope}`;

    const existing = parseJsonSafe<StoredProgress>(await redis.get(key), {});
    const updated: StoredProgress = {
      activeKeys: Array.isArray(body.activeKeys) ? body.activeKeys.slice(0, 32) : [],
      markedKeys: Array.isArray(body.markedKeys) ? body.markedKeys.slice(0, 32) : [],
      hintsUsed: existing.hintsUsed ?? 0,
    };

    await redis.set(key, JSON.stringify(updated));
    return c.json({ ok: true });
  } catch (error) {
    console.error('Error saving progress:', error);
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Could not save progress' },
      400
    );
  }
});

api.post('/hint', async (c) => {
  try {
    const body = await c.req.json<HintRequest>();
    const dateKey = getSafeDateKey(body.dateKey);
    const puzzle = generateDailyPuzzle(dateKey);
    const username = (await reddit.getCurrentUsername()) ?? 'player';
    const scope = getUserScope(username);
    const progressKey = `lq:progress:${dateKey}:${scope}`;

    const existing = parseJsonSafe<StoredProgress>(await redis.get(progressKey), {});
    const nextHints = (existing.hintsUsed ?? 0) + 1;
    await redis.set(
      progressKey,
      JSON.stringify({
        activeKeys: existing.activeKeys ?? body.activeKeys,
        markedKeys: existing.markedKeys ?? [],
        hintsUsed: nextHints,
      })
    );

    const hint = findHintCell(puzzle, body.activeKeys ?? []);
    return c.json<HintResponse>({
      type: 'hint',
      action: hint.action,
      coord: hint.coord,
      message: hint.message,
      hintsUsed: nextHints,
    });
  } catch (error) {
    console.error('Error generating hint:', error);
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Could not generate hint' },
      400
    );
  }
});

api.post('/solve', async (c) => {
  try {
    const body = await c.req.json<SolveRequest>();
    const dateKey = getSafeDateKey(body.dateKey);
    const puzzle = generateDailyPuzzle(dateKey);
    const pub = toPublicPuzzle(puzzle);
    const validation = validateBoard(pub, body.activeKeys ?? []);

    if (!validation.isValidPath) {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: validation.reason },
        400
      );
    }

    const username = (await reddit.getCurrentUsername()) ?? 'player';
    const scope = getUserScope(username);
    const solveKey = `lq:solve:${dateKey}:${username}`;
    const userStatsKey = `lq:userstats:${scope}`;
    const statsKey = `lq:stats:${dateKey}`;
    const lbKey = `lq:lb:${dateKey}`;

    const progressKey = `lq:progress:${dateKey}:${scope}`;
    const [existingSolveRaw, existingStatsRaw, existingProgressRaw] = await Promise.all([
      redis.get(solveKey),
      redis.get(userStatsKey),
      redis.get(progressKey),
    ]);

    const existingSolve = parseJsonSafe<StoredSolveRecord | null>(existingSolveRaw, null);
    const userStats = parseJsonSafe<StoredUserStats>(existingStatsRaw, {});
    const existingProgress = parseJsonSafe<StoredProgress>(existingProgressRaw, {});

    const safeSeconds = Math.max(1, Math.min(86400, Math.round(body.elapsedSeconds || 1)));
    const safeMoves = Math.max(1, Math.min(9999, Math.round(body.moves || 1)));
    const clientHints = Math.max(0, Math.min(99, Math.round(body.hintsUsed || 0)));
    const serverHints = Math.max(0, Math.min(99, existingProgress.hintsUsed ?? 0));
    const safeHints = Math.max(clientHints, serverHints);

    let streak = userStats.streak ?? 0;
    let lastSolvedDate = userStats.lastSolvedDate ?? null;
    const todayUtc = getUtcDateKey();

    if (!existingSolve) {
      const writes: Promise<unknown>[] = [
        redis.set(
          solveKey,
          JSON.stringify({
            elapsedSeconds: safeSeconds,
            moves: safeMoves,
            hintsUsed: safeHints,
          })
        ),
        redis.hIncrBy(statsKey, 'totalSolves', 1),
        safeHints === 0 ? redis.hIncrBy(statsKey, 'cleanSolves', 1) : Promise.resolve(0),
        // Composite score prioritizes clean solves (0 hints) then lowest elapsed time
        redis.zAdd(lbKey, {
          member: username,
          score: safeHints * 100000 + safeSeconds,
        }),
      ];

      // Only advance daily streak on today's live UTC puzzle so solving archive boards never rewinds streak state.
      if (dateKey === todayUtc) {
        const prevDate = getPreviousUtcDateKey(dateKey);
        if (lastSolvedDate === prevDate) {
          streak += 1;
        } else if (lastSolvedDate !== dateKey) {
          streak = 1;
        }
        lastSolvedDate = dateKey;
        writes.push(redis.set(userStatsKey, JSON.stringify({ streak, lastSolvedDate })));
      }

      await Promise.all(writes);

      const { subredditName } = context;
      if (dateKey === todayUtc && subredditName && username !== 'player') {
        try {
          await reddit.setUserFlair({
            subredditName,
            username,
            text: `LineQuota ⚡ ${streak}d`,
          });
        } catch (flairError) {
          console.warn('Could not update user flair:', flairError);
        }
      }
    }

    const community = await loadCommunityStats(dateKey);
    const shareText = formatShareGrid(
      pub,
      body.activeKeys ?? [],
      existingSolve?.elapsedSeconds ?? safeSeconds,
      existingSolve?.moves ?? safeMoves,
      existingSolve?.hintsUsed ?? safeHints,
      streak
    );

    return c.json<SolveResponse>({
      type: 'solve',
      accepted: true,
      message: existingSolve
        ? 'Daily solve already recorded for today.'
        : 'Daily solve verified and added to subreddit standings.',
      userRecord: {
        solved: true,
        elapsedSeconds: existingSolve?.elapsedSeconds ?? safeSeconds,
        moves: existingSolve?.moves ?? safeMoves,
        hintsUsed: existingSolve?.hintsUsed ?? safeHints,
        streak,
        lastSolvedDate,
      },
      community,
      shareText,
    });
  } catch (error) {
    console.error('Error submitting solve:', error);
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'Failed to record daily solve' },
      500
    );
  }
});

api.post('/share-comment', async (c) => {
  const { postId } = context;
  if (!postId) {
    return c.json<ApiErrorResponse>(
      { status: 'error', message: 'postId is required to post a comment' },
      400
    );
  }

  try {
    const body = await c.req.json<ShareCommentRequest>();
    const username = (await reddit.getCurrentUsername()) ?? 'player';
    const cleaned = String(body.shareText ?? '').trim().slice(0, 600);
    if (!cleaned) {
      return c.json<ApiErrorResponse>(
        { status: 'error', message: 'Share text cannot be empty' },
        400
      );
    }

    await reddit.submitComment({
      id: postId,
      text: `u/${username} completed today's board:\n\n${cleaned}`,
    });

    return c.json<ShareCommentResponse>({
      type: 'share-comment',
      posted: true,
      message: 'Result posted to the Reddit thread.',
    });
  } catch (error) {
    console.error('Error posting comment:', error);
    return c.json<ShareCommentResponse>(
      {
        type: 'share-comment',
        posted: false,
        message: 'Could not post comment automatically; use Copy Result instead.',
      },
      200
    );
  }
});
