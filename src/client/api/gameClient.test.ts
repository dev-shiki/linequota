import { describe, expect, it } from 'vitest';
import { coordKey, generateDailyPuzzle } from '../../shared/puzzle';
import {
  fetchPuzzle,
  postShareComment,
  requestHint,
  submitSolve,
} from './gameClient';
import {
  trackAppReady,
  trackJourneyEnd,
  trackJourneyInteraction,
  trackJourneyProgress,
  trackJourneyStart,
} from './telemetry';

describe('gameClient local fallback mode', () => {
  it('loads deterministic puzzle with empty leaderboard in local mode', async () => {
    const res = await fetchPuzzle('2026-11-18');
    expect(res.mode).toBe('local');
    expect(res.puzzle.dateKey).toBe('2026-11-18');
    expect(res.community.leaderboard).toEqual([]);
    expect(res.userRecord.solved).toBe(false);
  });

  it('computes accurate hints and validates solve submissions', async () => {
    const dateKey = '2026-11-19';
    const full = generateDailyPuzzle(dateKey);

    const hint = await requestHint(
      { dateKey, activeKeys: [coordKey(full.start), coordKey(full.end)] },
      'local'
    );
    expect(hint.action).toBe('add');
    expect(hint.hintsUsed).toBe(1);

    await expect(
      submitSolve(
        {
          dateKey,
          activeKeys: [coordKey(full.start), coordKey(full.end)],
          elapsedSeconds: 10,
          moves: 2,
          hintsUsed: 0,
        },
        'local'
      )
    ).rejects.toThrow();

    const solved = await submitSolve(
      {
        dateKey,
        activeKeys: full.solution.map(coordKey),
        elapsedSeconds: 37,
        moves: 13,
        hintsUsed: 0,
      },
      'local'
    );
    expect(solved.accepted).toBe(true);
    expect(solved.userRecord.solved).toBe(true);
    expect(solved.shareText).toContain('LineQuota #2 (2026-11-19)');

    const commentRes = await postShareComment(
      { dateKey, shareText: solved.shareText },
      'local'
    );
    expect(commentRes.posted).toBe(false);
  });

  it('executes telemetry wrappers safely without throwing in Vitest environment', async () => {
    await expect(trackAppReady()).resolves.toBeUndefined();
    await expect(trackJourneyStart()).resolves.toBeUndefined();
    await expect(trackJourneyProgress(0.5, 'tile_toggle')).resolves.toBeUndefined();
    await expect(trackJourneyInteraction('hint_requested', 'add')).resolves.toBeUndefined();
    await expect(trackJourneyEnd('solved')).resolves.toBeUndefined();
  });
});
