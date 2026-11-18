import './index.css';
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { requestExpandedMode } from '@devvit/web/client';
import {
  coordKey,
  generateDailyPuzzle,
  getTileKind,
  getUtcDateKey,
  toPublicPuzzle,
} from '../shared/puzzle';
import { applyTheme, getInitialTheme } from './theme';
import type { ThemeMode } from './theme';

export const Splash = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const dateKey = getUtcDateKey();
  const puzzle = toPublicPuzzle(generateDailyPuzzle(dateKey));

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const handleLaunch = (e: React.MouseEvent<HTMLButtonElement>) => {
    try {
      void requestExpandedMode(e.nativeEvent, 'game');
    } catch {
      window.location.href = './game.html';
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-between p-4 sm:p-6">
      <header className="max-w-lg w-full mx-auto flex items-center justify-between gap-3">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--ink-muted)' }}>
            Daily Circuit #{puzzle.puzzleNumber} ({puzzle.dateKey})
          </span>
        </div>
        <button
          type="button"
          onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          className="touch-target px-3 py-2 rounded-md border text-xs font-semibold"
          style={{
            backgroundColor: 'var(--surface)',
            color: 'var(--ink)',
            borderColor: 'var(--border)',
          }}
        >
          {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
        </button>
      </header>

      <main className="max-w-lg w-full mx-auto my-auto py-4">
        <div
          className="rounded-lg border p-5 sm:p-6"
          style={{
            backgroundColor: 'var(--surface)',
            borderColor: 'var(--border)',
            boxShadow: 'var(--shadow-elevated)',
          }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-2">
                LineQuota
              </h1>
              <p className="text-sm mb-4" style={{ color: 'var(--ink-muted)' }}>
                Route one unbranched line from S to E through every R relay while matching all 5
                row and column counts.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleLaunch}
                  className="touch-target lq-transition px-5 py-3 rounded-md text-sm font-bold"
                  style={{
                    backgroundColor: 'var(--accent)',
                    color: 'var(--accent-ink)',
                  }}
                >
                  Open Daily Board
                </button>
                <a
                  href="./game.html"
                  className="touch-target inline-flex items-center px-3 py-2 rounded-md border text-xs font-semibold"
                  style={{
                    backgroundColor: 'var(--surface-alt)',
                    color: 'var(--ink)',
                    borderColor: 'var(--border)',
                  }}
                >
                  Standalone View
                </a>
              </div>
            </div>

            <div
              className="grid gap-1 shrink-0 mx-auto sm:mx-0 p-2.5 rounded-md border"
              style={{
                gridTemplateColumns: 'repeat(5, 28px)',
                backgroundColor: 'var(--bg)',
                borderColor: 'var(--border)',
              }}
              aria-label="Preview of today's 5 by 5 puzzle layout"
            >
              {Array.from({ length: puzzle.size * puzzle.size }, (_, idx) => {
                const row = Math.floor(idx / puzzle.size);
                const col = idx % puzzle.size;
                const kind = getTileKind(puzzle, { row, col });
                const bg =
                  kind === 'start' || kind === 'end'
                    ? 'var(--accent)'
                    : kind === 'relay'
                      ? 'var(--relay)'
                      : kind === 'wall'
                        ? 'var(--surface-alt)'
                        : 'var(--surface)';
                const fg =
                  kind === 'start' || kind === 'end' || kind === 'relay'
                    ? '#ffffff'
                    : 'var(--ink-muted)';
                return (
                  <div
                    key={coordKey({ row, col })}
                    className="w-7 h-7 rounded-sm border flex items-center justify-center text-[11px] font-bold"
                    style={{
                      backgroundColor: bg,
                      color: fg,
                      borderColor: 'var(--border)',
                    }}
                  >
                    {kind === 'start'
                      ? 'S'
                      : kind === 'end'
                        ? 'E'
                        : kind === 'relay'
                          ? 'R'
                          : kind === 'wall'
                            ? '#'
                            : ''}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>

      <footer className="max-w-lg w-full mx-auto text-xs flex justify-between" style={{ color: 'var(--ink-muted)' }}>
        <span>5x5 Daily Logic Relay</span>
        <span>Target length: {puzzle.rowTargets.reduce((a, b) => a + b, 0)} cells</span>
      </footer>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
