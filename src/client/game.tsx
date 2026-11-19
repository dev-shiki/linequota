import './index.css';
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import {
  coordKey,
  formatDuration,
  formatShareGrid,
  generateRandomSeedCode,
  getTileKind,
  getUtcDateKey,
  isFixedTile,
  isValidDateKey,
  isValidSeedKey,
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
import {
  trackAppReady,
  trackJourneyEnd,
  trackJourneyInteraction,
  trackJourneyProgress,
  trackJourneyStart,
} from './api/telemetry';
import {
  getInitialMuted,
  playQuotaExact,
  playRelayChime,
  playTileDraw,
  playTileErase,
  playVictoryChord,
  saveMutedPreference,
} from './audio/sound';
import { PuzzleBoard } from './components/PuzzleBoard';
import type { CellStrokeAction, InteractionTool } from './components/PuzzleBoard';
import { RulesDialog } from './components/RulesDialog';
import { StandingsDialog } from './components/StandingsDialog';
import type { StandingsTab } from './components/StandingsDialog';
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
  const [standingsOpen, setStandingsOpen] = useState(false);
  const [standingsTab, setStandingsTab] = useState<StandingsTab>('standings');
  const [winOpen, setWinOpen] = useState(false);
  const [shareText, setShareText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [seedInput, setSeedInput] = useState('');
  const [muted, setMuted] = useState<boolean>(() => getInitialMuted());

  const activeRef = useRef<Set<string>>(new Set());
  const markedRef = useRef<Set<string>>(new Set());
  const movesRef = useRef(0);
  const prevExactCountRef = useRef(0);
  const prevRelaysHitRef = useRef(0);
  const appReadyTrackedRef = useRef(false);
  const journeyStartedRef = useRef(false);
  const relayProgressTrackedRef = useRef(false);
  const endProgressTrackedRef = useRef(false);

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
        const nextMarked = new Set<string>(data.savedMarkedKeys);
        const initialMoves = data.userRecord.moves ?? 0;

        activeRef.current = nextActive;
        markedRef.current = nextMarked;
        movesRef.current = initialMoves;

        setMode(data.mode);
        setUsername(data.username);
        setPuzzle(data.puzzle);
        setUserRecord(data.userRecord);
        setCommunity(data.community);
        setActiveSet(nextActive);
        setMarkedSet(nextMarked);
        setHistory([]);
        setElapsedSeconds(data.userRecord.elapsedSeconds ?? 0);
        setMoves(initialMoves);
        setHintsUsed(data.userRecord.hintsUsed);
        setLoadError(null);
        setActionError(null);
        setHintBanner(null);
        setHintedCoord(null);

        if (!appReadyTrackedRef.current) {
          appReadyTrackedRef.current = true;
          void trackAppReady();
        }

        if (data.userRecord.solved) {
          setShareText(
            formatShareGrid(
              data.puzzle,
              nextActive,
              data.userRecord.elapsedSeconds ?? 0,
              initialMoves,
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
    setActionError(null);
    journeyStartedRef.current = false;
    relayProgressTrackedRef.current = false;
    endProgressTrackedRef.current = false;
    setSelectedDateKey(nextDateKey);
    void trackJourneyInteraction('board_switched', nextDateKey);
  };

  const handlePlaySeed = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const raw = seedInput.trim().toUpperCase();
    if (!raw) return;
    const candidate = /^[A-Z0-9]{4,8}$/.test(raw) ? `LQ-${raw}` : raw;
    if (!isValidSeedKey(candidate) && !isValidDateKey(candidate)) {
      setActionError('Enter a valid challenge seed (e.g. LQ-7K9P).');
      return;
    }
    setSeedInput(candidate);
    handleSelectBoard(candidate);
  };

  const handleNewSeed = () => {
    const nextSeed = generateRandomSeedCode();
    setSeedInput(nextSeed);
    handleSelectBoard(nextSeed);
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

  const pushHistory = useCallback(() => {
    const activeSnapshot = Array.from(activeRef.current);
    const markedSnapshot = Array.from(markedRef.current);
    setHistory((prev) => [
      ...prev.slice(-24),
      { active: activeSnapshot, marked: markedSnapshot },
    ]);
  }, []);

  const ensureJourneyStarted = useCallback(() => {
    if (journeyStartedRef.current) return;
    journeyStartedRef.current = true;
    void trackJourneyStart();
  }, []);

  const checkProgressMilestones = useCallback(
    (nextValidation: ReturnType<typeof validateBoard>) => {
      if (!relayProgressTrackedRef.current && nextValidation.relaysHit >= 1) {
        relayProgressTrackedRef.current = true;
        void trackJourneyProgress(0.5, 'first_relay_connected');
      }
      if (!endProgressTrackedRef.current && nextValidation.reachedEnd) {
        endProgressTrackedRef.current = true;
        void trackJourneyProgress(0.85, 'end_terminal_linked');
      }
    },
    []
  );

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
        playVictoryChord(muted);
        void trackJourneyEnd('solved');
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Could not verify solve.');
      } finally {
        setSubmitting(false);
      }
    },
    [mode, muted]
  );

  const handleStrokeStart = useCallback(() => {
    if (!puzzle || userRecord.solved || submitting) return;
    ensureJourneyStarted();
    pushHistory();
  }, [ensureJourneyStarted, pushHistory, puzzle, submitting, userRecord.solved]);

  const handleSetCell = useCallback(
    (coord: GridCoord, action: CellStrokeAction) => {
      if (!puzzle || userRecord.solved || submitting) return;
      const kind = getTileKind(puzzle, coord);
      if (isFixedTile(kind)) return;

      const k = coordKey(coord);
      const nextActive = new Set(activeRef.current);
      const nextMarked = new Set(markedRef.current);

      if (action === 'draw-on') {
        if (nextActive.has(k)) return;
        nextActive.add(k);
        nextMarked.delete(k);
      } else if (action === 'draw-off') {
        if (!nextActive.has(k)) return;
        nextActive.delete(k);
      } else if (action === 'mark-on') {
        if (nextMarked.has(k)) return;
        nextMarked.add(k);
        nextActive.delete(k);
      } else {
        if (!nextMarked.has(k)) return;
        nextMarked.delete(k);
      }

      activeRef.current = nextActive;
      markedRef.current = nextMarked;
      const nextMoves = movesRef.current + 1;
      movesRef.current = nextMoves;

      setActiveSet(nextActive);
      setMarkedSet(nextMarked);
      setMoves(nextMoves);
      setHintedCoord(null);
      setActionError(null);
      persistSnapshot(nextActive, nextMarked);

      const nextValidation = validateBoard(puzzle, nextActive);
      const exactCount =
        nextValidation.rowStatus.filter((s) => s === 'exact').length +
        nextValidation.colStatus.filter((s) => s === 'exact').length;

      if (action === 'draw-on') {
        if (nextValidation.relaysHit > prevRelaysHitRef.current) {
          playRelayChime(nextValidation.relaysHit, muted);
        } else if (exactCount > prevExactCountRef.current) {
          playQuotaExact(muted);
        } else {
          playTileDraw(nextActive.size, muted);
        }
      } else {
        playTileErase(muted);
      }
      prevExactCountRef.current = exactCount;
      prevRelaysHitRef.current = nextValidation.relaysHit;

      checkProgressMilestones(nextValidation);
      if (nextValidation.isValidPath) {
        void finalizeSolve(puzzle, nextActive, nextMoves, elapsedSeconds, hintsUsed);
      }
    },
    [
      checkProgressMilestones,
      elapsedSeconds,
      finalizeSolve,
      hintsUsed,
      muted,
      persistSnapshot,
      puzzle,
      submitting,
      userRecord.solved,
    ]
  );

  const handleToggleActive = (coord: GridCoord) => {
    if (!puzzle || userRecord.solved || submitting) return;
    const kind = getTileKind(puzzle, coord);
    if (isFixedTile(kind)) return;

    ensureJourneyStarted();
    pushHistory();
    const k = coordKey(coord);
    const action: CellStrokeAction = activeRef.current.has(k) ? 'draw-off' : 'draw-on';
    handleSetCell(coord, action);
  };

  const handleToggleMark = (coord: GridCoord) => {
    if (!puzzle || userRecord.solved || submitting) return;
    const kind = getTileKind(puzzle, coord);
    if (isFixedTile(kind)) return;

    ensureJourneyStarted();
    pushHistory();
    const k = coordKey(coord);
    const action: CellStrokeAction = markedRef.current.has(k) ? 'mark-off' : 'mark-on';
    handleSetCell(coord, action);
  };

  const handleUndo = () => {
    if (history.length === 0 || userRecord.solved) return;
    const last = history[history.length - 1];
    if (!last) return;
    const nextActive = new Set(last.active);
    const nextMarked = new Set(last.marked);
    activeRef.current = nextActive;
    markedRef.current = nextMarked;
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
    activeRef.current = nextActive;
    markedRef.current = nextMarked;
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
      void trackJourneyInteraction('hint_requested', `hints:${hint.hintsUsed}`);
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

  const handleToggleMute = () => {
    setMuted((prev) => {
      const next = !prev;
      saveMutedPreference(next);
      return next;
    });
  };

  return (
    <div className="min-h-dvh flex flex-col">
      <header
        className="border-b px-3 sm:px-4 py-2.5"
        style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="max-w-3xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <h1 className="text-lg sm:text-xl font-extrabold tracking-tight">
              LineQuota
            </h1>
            {puzzle && (
              <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--ink-muted)' }}>
                #{puzzle.puzzleNumber}
              </span>
            )}
          </div>

          <nav aria-label="Game utility controls" className="flex flex-wrap items-center gap-1.5">
            <label htmlFor="board-select" className="sr-only">
              Select puzzle board
            </label>
            <select
              id="board-select"
              value={selectedDateKey}
              onChange={(e) => handleSelectBoard(e.target.value)}
              className="touch-target px-2.5 py-1.5 rounded-md border text-xs font-semibold"
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
                    {item.label}
                  </option>
                );
              })}
              {!PRACTICE_DATES.some(
                (item) => dateKeyWithOffset(todayKey, item.offsetDays) === selectedDateKey
              ) && (
                <option value={selectedDateKey}>Seed: {selectedDateKey}</option>
              )}
            </select>

            <button
              type="button"
              onClick={() => {
                setStandingsTab('standings');
                setStandingsOpen(true);
              }}
              className="touch-target px-2.5 py-1.5 rounded-md border text-xs font-semibold"
              style={{
                backgroundColor: 'var(--surface-alt)',
                color: 'var(--ink)',
                borderColor: 'var(--border)',
              }}
            >
              Standings ({community.totalSolves})
            </button>

            <button
              type="button"
              onClick={() => {
                setStandingsTab('seeds');
                setStandingsOpen(true);
              }}
              className="touch-target px-2.5 py-1.5 rounded-md border text-xs font-semibold"
              style={{
                backgroundColor: 'var(--surface-alt)',
                color: 'var(--ink)',
                borderColor: 'var(--border)',
              }}
            >
              Seeds
            </button>

            <button
              type="button"
              onClick={() => {
                setRulesOpen(true);
                void trackJourneyInteraction('rules_opened');
              }}
              className="touch-target px-2.5 py-1.5 rounded-md border text-xs font-semibold"
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
              aria-pressed={!muted}
              onClick={handleToggleMute}
              className="touch-target px-2.5 py-1.5 rounded-md border text-xs font-semibold"
              style={{
                backgroundColor: 'var(--surface-alt)',
                color: 'var(--ink)',
                borderColor: 'var(--border)',
              }}
            >
              {muted ? 'Muted' : 'Sound'}
            </button>

            <button
              type="button"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              className="touch-target px-2.5 py-1.5 rounded-md border text-xs font-semibold"
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

      <main className="flex-1 w-full max-w-xl mx-auto px-3 sm:px-4 py-3 sm:py-4 flex flex-col justify-center">
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
          <section
            className="rounded-lg border p-3 sm:p-5"
            style={{
              backgroundColor: 'var(--surface)',
              borderColor: 'var(--border)',
              boxShadow: 'var(--shadow-elevated)',
            }}
            aria-labelledby="board-heading"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <h2 id="board-heading" className="text-sm sm:text-base font-bold">
                  {puzzle.dateKey}
                </h2>
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-sm"
                  style={{
                    backgroundColor: validation.isValidPath
                      ? 'var(--signal)'
                      : 'var(--surface-alt)',
                    color: validation.isValidPath ? 'var(--signal-ink)' : 'var(--ink)',
                  }}
                >
                  Relays {validation.relaysHit}/{validation.relaysTotal}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs sm:text-sm font-semibold tabular-nums">
                <span>{formatDuration(elapsedSeconds)}</span>
                <span>{moves}m</span>
                <span>{userRecord.streak}d</span>
              </div>
            </div>

            <p
              className="text-xs sm:text-sm mb-3 min-h-[20px]"
              style={{ color: validation.isValidPath ? 'var(--signal)' : 'var(--ink-muted)' }}
              role="status"
            >
              {moves === 0 && !userRecord.solved
                ? 'Drag from S through every R relay to E, matching each row and column count.'
                : validation.reason}
            </p>

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
              onStrokeStart={handleStrokeStart}
              onSetCell={handleSetCell}
            />

            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5" role="group" aria-label="Tile action mode">
                <button
                  type="button"
                  aria-pressed={tool === 'draw'}
                  onClick={() => setTool('draw')}
                  className="touch-target px-3 py-1.5 rounded-md border text-xs sm:text-sm font-semibold"
                  style={{
                    backgroundColor: tool === 'draw' ? 'var(--signal)' : 'var(--surface-alt)',
                    color: tool === 'draw' ? 'var(--signal-ink)' : 'var(--ink)',
                    borderColor: tool === 'draw' ? 'var(--signal)' : 'var(--border)',
                  }}
                >
                  Draw
                </button>
                <button
                  type="button"
                  aria-pressed={tool === 'mark'}
                  onClick={() => setTool('mark')}
                  className="touch-target px-3 py-1.5 rounded-md border text-xs sm:text-sm font-semibold"
                  style={{
                    backgroundColor: tool === 'mark' ? 'var(--relay)' : 'var(--surface-alt)',
                    color: tool === 'mark' ? 'var(--relay-ink)' : 'var(--ink)',
                    borderColor: tool === 'mark' ? 'var(--relay)' : 'var(--border)',
                  }}
                >
                  Mark (X)
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={history.length === 0 || userRecord.solved}
                  onClick={handleUndo}
                  className="touch-target px-3 py-1.5 rounded-md border text-xs sm:text-sm font-semibold disabled:opacity-50"
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
                  className="touch-target px-3 py-1.5 rounded-md border text-xs sm:text-sm font-semibold disabled:opacity-50"
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
                  className="touch-target px-3 py-1.5 rounded-md border text-xs sm:text-sm font-semibold disabled:opacity-50"
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

            <button
              type="button"
              disabled={submitting}
              onClick={handleVerifyButton}
              className="touch-target w-full mt-3 px-4 py-2.5 rounded-md text-sm font-bold"
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

            {hintBanner && (
              <div
                className="mt-2.5 rounded-md border px-3 py-2 text-xs font-semibold"
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
                className="mt-2.5 rounded-md border px-3 py-2 text-xs font-semibold"
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
        )}
      </main>

      <RulesDialog open={rulesOpen} onClose={() => setRulesOpen(false)} />
      <StandingsDialog
        open={standingsOpen}
        tab={standingsTab}
        onTabChange={setStandingsTab}
        mode={mode}
        username={username}
        community={community}
        seedInput={seedInput}
        onSeedInputChange={setSeedInput}
        onPlaySeed={handlePlaySeed}
        onNewSeed={handleNewSeed}
        onClose={() => setStandingsOpen(false)}
      />
      {puzzle && (
        <WinDialog
          open={winOpen}
          puzzleNumber={puzzle.puzzleNumber}
          dateKey={puzzle.dateKey}
          record={userRecord}
          shareText={shareText}
          mode={mode}
          community={community}
          username={username}
          onClose={() => setWinOpen(false)}
          onPostComment={async () => {
            const res = await postShareComment({ dateKey: puzzle.dateKey, shareText }, mode);
            if (res.posted) {
              void trackJourneyInteraction('comment_shared', puzzle.dateKey);
            }
            return res;
          }}
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
