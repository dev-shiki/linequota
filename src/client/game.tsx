import './index.css';
import { StrictMode, useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  coordKey,
  formatDuration,
  formatShareGrid,
  getTileKind,
  getUtcDateKey,
  isFixedTile,
  validateBoard,
} from '../shared/puzzle';
import type { CommunityStats, GridCoord, PuzzlePublic, UserDailyRecord } from '../shared/types';
import {
  fetchPuzzle,
  postShareComment,
  requestHint,
  saveProgress,
  submitSolve,
} from './api/gameClient';
import { PuzzleBoard } from './components/PuzzleBoard';
import type { InteractionTool } from './components/PuzzleBoard';
import { RulesDialog } from './components/RulesDialog';
import { WinDialog } from './components/WinDialog';
import { applyTheme, getInitialTheme } from './theme';
import type { ThemeMode } from './theme';

interface BoardSnapshot {
  active: string[];
  marked: string[];
}

const PRACTICE_DATES = [
  { label: 'Today (Daily)', offsetDays: 0 },
  { label: 'Practice A', offsetDays: -1 },
  { label: 'Practice B', offsetDays: -2 },
  { label: 'Practice C', offsetDays: -3 },
];

function dateKeyWithOffset(baseDateKey: string, offsetDays: number): string {
  const baseMs = Date.parse(`${baseDateKey}T00:00:00Z`);
  if (Number.isNaN(baseMs)) return baseDateKey;
  return getUtcDateKey(new Date(baseMs + offsetDays * 86_400_000));
}

export const App = () => {
  const todayKey = useMemo(() => getUtcDateKey(), []);
  const [selectedDateKey, setSelectedDateKey] = useState<string>(todayKey);
  const [reloadToken, setReloadToken] = useState(0);
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [mode, setMode] = useState<'reddit' | 'local'>('local');
  const [username, setUsername] = useState('player');
  const [puzzle, setPuzzle] = useState<PuzzlePublic | null>(null);
  const [userRecord, setUserRecord] = useState<UserDailyRecord>({
    solved: false,
    elapsedSeconds: null,
    moves: null,
    hintsUsed: 0,
    streak: 0,
    lastSolvedDate: null,
  });
  const [community, setCommunity] = useState<CommunityStats>({
    totalSolves: 0,
    cleanSolves: 0,
    fastestSeconds: null,
    leaderboard: [],
  });

  const [activeSet, setActiveSet] = useState<Set<string>>(new Set());
  const [markedSet, setMarkedSet] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<BoardSnapshot[]>([]);
  const [tool, setTool] = useState<InteractionTool>('draw');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [moves, setMoves] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [hintBanner, setHintBanner] = useState<string | null>(null);
  const [hintedCoord, setHintedCoord] = useState<GridCoord | null>(null);

  const [rulesOpen, setRulesOpen] = useState(false);
  const [winOpen, setWinOpen] = useState(false);
  const [shareText, setShareText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;
    fetchPuzzle(selectedDateKey)
      .then((data) => {
        if (cancelled) return;
        const nextActive = new Set<string>(data.savedActiveKeys);
        nextActive.add(coordKey(data.puzzle.start));
        nextActive.add(coordKey(data.puzzle.end));

        setMode(data.mode);
        setUsername(data.username);
        setPuzzle(data.puzzle);
        setUserRecord(data.userRecord);
        setCommunity(data.community);
        setActiveSet(nextActive);
        setMarkedSet(new Set(data.savedMarkedKeys));
        setHistory([]);
        setElapsedSeconds(data.userRecord.elapsedSeconds ?? 0);
        setMoves(data.userRecord.moves ?? 0);
        setHintsUsed(data.userRecord.hintsUsed);
        setLoadError(null);
        setActionError(null);
        setHintBanner(null);
        setHintedCoord(null);

        if (data.userRecord.solved) {
          setShareText(
            formatShareGrid(
              data.puzzle,
              nextActive,
              data.userRecord.elapsedSeconds ?? 0,
              data.userRecord.moves ?? 0,
              data.userRecord.hintsUsed,
              data.userRecord.streak
            )
          );
        } else {
          setShareText('');
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Unable to load daily puzzle.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedDateKey, reloadToken]);

  const handleSelectBoard = (nextDateKey: string) => {
    setLoading(true);
    setLoadError(null);
    setSelectedDateKey(nextDateKey);
  };

  const handleRetryLoad = () => {
    setLoading(true);
    setLoadError(null);
    setReloadToken((n) => n + 1);
  };

  useEffect(() => {
    if (loading || !puzzle || userRecord.solved) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading, puzzle, userRecord.solved]);

  const validation = useMemo(() => {
    if (!puzzle) return null;
    return validateBoard(puzzle, activeSet);
  }, [puzzle, activeSet]);

  const persistSnapshot = useCallback(
    (nextActive: Set<string>, nextMarked: Set<string>) => {
      if (!puzzle) return;
      void saveProgress(
        {
          dateKey: puzzle.dateKey,
          activeKeys: Array.from(nextActive),
          markedKeys: Array.from(nextMarked),
        },
        mode
      );
    },
    [mode, puzzle]
  );

  const pushHistory = () => {
    setHistory((prev) => [
      ...prev.slice(-24),
      { active: Array.from(activeSet), marked: Array.from(markedSet) },
    ]);
  };

  const finalizeSolve = useCallback(
    async (
      targetPuzzle: PuzzlePublic,
      nextActive: Set<string>,
      nextMoves: number,
      currentElapsed: number,
      currentHints: number
    ) => {
      setSubmitting(true);
      setActionError(null);
      try {
        const res = await submitSolve(
          {
            dateKey: targetPuzzle.dateKey,
            activeKeys: Array.from(nextActive),
            elapsedSeconds: Math.max(1, currentElapsed),
            moves: Math.max(1, nextMoves),
            hintsUsed: currentHints,
          },
          mode
        );
        setUserRecord(res.userRecord);
        setCommunity(res.community);
        setShareText(res.shareText);
        setWinOpen(true);
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not verify solve.');
      } finally {
        setSubmitting(false);
      }
    },
    [mode]
  );

  const handleToggleActive = (coord: GridCoord) => {
    if (!puzzle || userRecord.solved || submitting) return;
    const kind = getTileKind(puzzle, coord);
    if (isFixedTile(kind)) return;

    const k = coordKey(coord);
    pushHistory();

    const nextActive = new Set(activeSet);
    const nextMarked = new Set(markedSet);

    if (nextActive.has(k)) {
      nextActive.delete(k);
    } else {
      nextActive.add(k);
      nextMarked.delete(k);
    }

    const nextMoves = moves + 1;
    setActiveSet(nextActive);
    setMarkedSet(nextMarked);
    setMoves(nextMoves);
    setHintedCoord(null);
    setActionError(null);
    persistSnapshot(nextActive, nextMarked);

    const nextValidation = validateBoard(puzzle, nextActive);
    if (nextValidation.isValidPath) {
      void finalizeSolve(puzzle, nextActive, nextMoves, elapsedSeconds, hintsUsed);
    }
  };

  const handleToggleMark = (coord: GridCoord) => {
    if (!puzzle || userRecord.solved || submitting) return;
    const kind = getTileKind(puzzle, coord);
    if (isFixedTile(kind)) return;

    const k = coordKey(coord);
    pushHistory();

    const nextActive = new Set(activeSet);
    const nextMarked = new Set(markedSet);
    if (nextMarked.has(k)) {
      nextMarked.delete(k);
    } else {
      nextMarked.add(k);
      nextActive.delete(k);
    }

    setActiveSet(nextActive);
    setMarkedSet(nextMarked);
    setMoves((m) => m + 1);
    setHintedCoord(null);
    persistSnapshot(nextActive, nextMarked);
  };

  const handleUndo = () => {
    if (history.length === 0 || userRecord.solved) return;
    const last = history[history.length - 1];
    if (!last) return;
    const nextActive = new Set(last.active);
    const nextMarked = new Set(last.marked);
    setHistory((prev) => prev.slice(0, -1));
    setActiveSet(nextActive);
    setMarkedSet(nextMarked);
    setHintedCoord(null);
    persistSnapshot(nextActive, nextMarked);
  };

  const handleClear = () => {
    if (!puzzle || userRecord.solved) return;
    pushHistory();
    const nextActive = new Set<string>([
      coordKey(puzzle.start),
      coordKey(puzzle.end),
    ]);
    const nextMarked = new Set<string>();
    setActiveSet(nextActive);
    setMarkedSet(nextMarked);
    setHintBanner(null);
    setHintedCoord(null);
    persistSnapshot(nextActive, nextMarked);
  };

  const handleHint = async () => {
    if (!puzzle || userRecord.solved) return;
    setActionError(null);
    try {
      const hint = await requestHint(
        { dateKey: puzzle.dateKey, activeKeys: Array.from(activeSet) },
        mode
      );
      setHintsUsed(hint.hintsUsed);
      setHintBanner(hint.message);
      setHintedCoord(hint.coord);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Hint request failed.');
    }
  };

  const handleVerifyButton = () => {
    if (!puzzle || !validation || submitting) return;
    if (userRecord.solved) {
      setWinOpen(true);
      return;
    }
    if (!validation.isValidPath) {
      setActionError(validation.reason);
      return;
    }
    void finalizeSolve(puzzle, activeSet, moves, elapsedSeconds, hintsUsed);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="border-b px-4 py-3"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              LineQuota
            </h1>
            {puzzle && (
              <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                #{puzzle.puzzleNumber} ({puzzle.dateKey})
              </span>
            )}
          </div>

          <nav aria-label="Game utility controls" className="flex flex-wrap items-center gap-2">
            <label htmlFor="board-select" className="sr-only">
              Select puzzle board
            </label>
            <select
              id="board-select"
              value={selectedDateKey}
              onChange={(e) => handleSelectBoard(e.target.value)}
              className="touch-target px-3 py-2 rounded-md border text-xs sm:text-sm font-semibold"
              style={{
                backgroundColor: 'var(--surface-alt)',
                color: 'var(--ink)',
                borderColor: 'var(--border)',
              }}
            >
              {PRACTICE_DATES.map((item) => {
                const dk = dateKeyWithOffset(todayKey, item.offsetDays);
                return (
                  <option key={dk} value={dk}>
                    {item.label} ({dk})
                  </option>
                );
              })}
            </select>

            <button
              type="button"
              onClick={() => setRulesOpen(true)}
              className="touch-target px-3 py-2 rounded-md border text-xs sm:text-sm font-semibold"
              style={{
                backgroundColor: 'var(--surface-alt)',
                color: 'var(--ink)',
                borderColor: 'var(--border)',
              }}
            >
              Rules
            </button>

            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              className="touch-target px-3 py-2 rounded-md border text-xs sm:text-sm font-semibold"
              style={{
                backgroundColor: 'var(--surface-alt)',
                color: 'var(--ink)',
                borderColor: 'var(--border)',
              }}
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-5 sm:py-7">
        {loading && (
          <div
            className="rounded-lg border p-6 text-center"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
            role="status"
          >
            <p className="text-sm font-semibold">Loading today&apos;s puzzle board...</p>
          </div>
        )}

        {!loading && loadError && (
          <div
            className="rounded-lg border p-6 text-center"
            style={{
              backgroundColor: 'var(--error-bg)',
              color: 'var(--error)',
              borderColor: 'var(--error)',
            }}
            role="alert"
          >
            <p className="text-sm font-bold mb-3">{loadError}</p>
            <button
              type="button"
              onClick={handleRetryLoad}
              className="touch-target px-4 py-2 rounded-md font-semibold text-sm"
              style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Retry Loading Puzzle
            </button>
          </div>
        )}

        {!loading && !loadError && puzzle && validation && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section
              className="lg:col-span-7 rounded-lg border p-3 sm:p-5"
              style={{
                backgroundColor: 'var(--surface)',
                borderColor: 'var(--border)',
                boxShadow: 'var(--shadow-elevated)',
              }}
              aria-labelledby="board-heading"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h2 id="board-heading" className="text-base font-bold">
                  Route Grid
                </h2>
                <div className="flex items-center gap-4 text-xs sm:text-sm font-semibold tabular-nums">
                  <span>Time: {formatDuration(elapsedSeconds)}</span>
                  <span>Moves: {moves}</span>
                  <span>Streak: {userRecord.streak}d</span>
                </div>
              </div>

              <PuzzleBoard
                puzzle={puzzle}
                activeSet={activeSet}
                markedSet={markedSet}
                validation={validation}
                tool={tool}
                hintedCoord={hintedCoord}
                solved={userRecord.solved}
                onToggleActive={handleToggleActive}
                onToggleMark={handleToggleMark}
              />

              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2" role="group" aria-label="Tile action mode">
                  <button
                    type="button"
                    aria-pressed={tool === 'draw'}
                    onClick={() => setTool('draw')}
                    className="touch-target px-3.5 py-2 rounded-md border text-xs sm:text-sm font-semibold"
                    style={{
                      backgroundColor: tool === 'draw' ? 'var(--signal)' : 'var(--surface-alt)',
                      color: tool === 'draw' ? 'var(--signal-ink)' : 'var(--ink)',
                      borderColor: tool === 'draw' ? 'var(--signal)' : 'var(--border)',
                    }}
                  >
                    Draw Route
                  </button>
                  <button
                    type="button"
                    aria-pressed={tool === 'mark'}
                    onClick={() => setTool('mark')}
                    className="touch-target px-3.5 py-2 rounded-md border text-xs sm:text-sm font-semibold"
                    style={{
                      backgroundColor: tool === 'mark' ? 'var(--relay)' : 'var(--surface-alt)',
                      color: tool === 'mark' ? 'var(--relay-ink)' : 'var(--ink)',
                      borderColor: tool === 'mark' ? 'var(--relay)' : 'var(--border)',
                    }}
                  >
                    Mark (X)
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={history.length === 0 || userRecord.solved}
                    onClick={handleUndo}
                    className="touch-target px-3.5 py-2 rounded-md border text-xs sm:text-sm font-semibold disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--surface-alt)',
                      color: 'var(--ink)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    disabled={userRecord.solved}
                    onClick={handleClear}
                    className="touch-target px-3.5 py-2 rounded-md border text-xs sm:text-sm font-semibold disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--surface-alt)',
                      color: 'var(--ink)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={userRecord.solved}
                    onClick={() => void handleHint()}
                    className="touch-target px-3.5 py-2 rounded-md border text-xs sm:text-sm font-semibold disabled:opacity-50"
                    style={{
                      backgroundColor: 'var(--surface-alt)',
                      color: 'var(--ink)',
                      borderColor: 'var(--border)',
                    }}
                  >
                    Hint ({hintsUsed})
                  </button>
                </div>
              </div>

              {hintBanner && (
                <div
                  className="mt-3 rounded-md border px-3 py-2 text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--signal-tint)',
                    color: 'var(--ink)',
                    borderColor: 'var(--signal)',
                  }}
                  role="status"
                >
                  Hint: {hintBanner}
                </div>
              )}

              {actionError && (
                <div
                  className="mt-3 rounded-md border px-3 py-2 text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--error-bg)',
                    color: 'var(--error)',
                    borderColor: 'var(--error)',
                  }}
                  role="alert"
                >
                  {actionError}
                </div>
              )}
            </section>

            <aside className="lg:col-span-5 flex flex-col gap-5">
              <section
                className="rounded-lg border p-4 sm:p-5"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                aria-labelledby="status-heading"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 id="status-heading" className="text-base font-bold">
                    Circuit Diagnostics
                  </h2>
                  <span
                    className="text-xs font-bold px-2 py-1 rounded-sm"
                    style={{
                      backgroundColor: validation.isValidPath
                        ? 'var(--signal)'
                        : 'var(--surface-alt)',
                      color: validation.isValidPath ? 'var(--signal-ink)' : 'var(--ink)',
                    }}
                  >
                    {userRecord.solved
                      ? 'SOLVED'
                      : validation.isValidPath
                        ? 'VALID'
                        : 'IN PROGRESS'}
                  </span>
                </div>

                <p className="text-sm mb-4" style={{ color: 'var(--ink-muted)' }}>
                  {validation.reason}
                </p>

                <dl className="grid grid-cols-2 gap-3 text-xs sm:text-sm mb-4 tabular-nums">
                  <div
                    className="rounded-md border p-2.5"
                    style={{ backgroundColor: 'var(--surface-alt)', borderColor: 'var(--border)' }}
                  >
                    <dt style={{ color: 'var(--ink-muted)' }}>Relays Connected</dt>
                    <dd className="text-base font-bold">
                      {validation.relaysHit} / {validation.relaysTotal}
                    </dd>
                  </div>
                  <div
                    className="rounded-md border p-2.5"
                    style={{ backgroundColor: 'var(--surface-alt)', borderColor: 'var(--border)' }}
                  >
                    <dt style={{ color: 'var(--ink-muted)' }}>End Terminal</dt>
                    <dd className="text-base font-bold">
                      {validation.reachedEnd ? 'Linked' : 'Unlinked'}
                    </dd>
                  </div>
                </dl>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleVerifyButton}
                  className="touch-target w-full px-4 py-3 rounded-md text-sm font-bold"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-ink)',
                  }}
                >
                  {userRecord.solved
                    ? 'Open Result & Share Card'
                    : submitting
                      ? 'Verifying Route...'
                      : 'Check & Submit Route'}
                </button>
              </section>

              <section
                className="rounded-lg border p-4 sm:p-5"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
                aria-labelledby="standings-heading"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 id="standings-heading" className="text-base font-bold">
                    Subreddit Standings
                  </h2>
                  <span className="text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>
                    {mode === 'reddit' ? `u/${username}` : 'Local Preview'}
                  </span>
                </div>

                {community.leaderboard.length === 0 ? (
                  <div
                    className="rounded-md border p-4 text-xs sm:text-sm"
                    style={{
                      backgroundColor: 'var(--surface-alt)',
                      borderColor: 'var(--border)',
                      color: 'var(--ink-muted)',
                    }}
                  >
                    No recorded solves for this board yet. Complete the route above to set the first
                    time.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm tabular-nums border-collapse">
                      <thead>
                        <tr
                          className="border-b"
                          style={{ borderColor: 'var(--border)', color: 'var(--ink-muted)' }}
                        >
                          <th className="py-2 pr-2 font-semibold">Rank</th>
                          <th className="py-2 pr-2 font-semibold">Player</th>
                          <th className="py-2 pr-2 font-semibold">Time</th>
                          <th className="py-2 font-semibold">Clean</th>
                        </tr>
                      </thead>
                      <tbody>
                        {community.leaderboard.map((row) => (
                          <tr
                            key={`${row.rank}-${row.username}`}
                            className="border-b"
                            style={{ borderColor: 'var(--border-subtle)' }}
                          >
                            <td className="py-2 pr-2 font-bold">#{row.rank}</td>
                            <td className="py-2 pr-2 font-medium">u/{row.username}</td>
                            <td className="py-2 pr-2">{formatDuration(row.elapsedSeconds)}</td>
                            <td className="py-2">
                              {row.hintsUsed === 0 ? 'Clean' : `${row.hintsUsed}h`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </aside>
          </div>
        )}
      </main>

      <footer
        className="border-t px-4 py-3 text-xs"
        style={{ borderColor: 'var(--border)', color: 'var(--ink-muted)' }}
      >
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>LineQuota Daily Puzzle for Reddit Interactive Posts</span>
          <span>Unique solution guaranteed per UTC day</span>
        </div>
      </footer>

      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
      {puzzle && (
        <WinDialog
          open={winOpen}
          puzzleNumber={puzzle.puzzleNumber}
          dateKey={puzzle.dateKey}
          record={userRecord}
          shareText={shareText}
          mode={mode}
          onClose={() => setWinOpen(false)}
          onPostComment={() =>
            postShareComment({ dateKey: puzzle.dateKey, shareText }, mode)
          }
        />
      )}
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
