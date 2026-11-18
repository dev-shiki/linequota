import { useRef } from 'react';
import type { KeyboardEvent } from 'react';
import {
  coordKey,
  getTileKind,
  isFixedTile,
} from '../../shared/puzzle';
import type {
  GridCoord,
  PuzzlePublic,
  ValidationResult,
} from '../../shared/types';

export type InteractionTool = 'draw' | 'mark';

interface PuzzleBoardProps {
  puzzle: PuzzlePublic;
  activeSet: Set<string>;
  markedSet: Set<string>;
  validation: ValidationResult;
  tool: InteractionTool;
  hintedCoord: GridCoord | null;
  solved: boolean;
  onToggleActive: (coord: GridCoord) => void;
  onToggleMark: (coord: GridCoord) => void;
}

export const PuzzleBoard = ({
  puzzle,
  activeSet,
  markedSet,
  validation,
  tool,
  hintedCoord,
  solved,
  onToggleActive,
  onToggleMark,
}: PuzzleBoardProps) => {
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const connectedSet = new Set(validation.connectedFromStart);
  const disconnectedSet = new Set(validation.disconnectedActive);
  const branchedSet = new Set(validation.branchedCells);

  const handleCellActivate = (coord: GridCoord) => {
    const kind = getTileKind(puzzle, coord);
    if (isFixedTile(kind) || solved) return;
    if (tool === 'mark') {
      onToggleMark(coord);
    } else {
      onToggleActive(coord);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, coord: GridCoord) => {
    let nextRow = coord.row;
    let nextCol = coord.col;

    if (e.key === 'ArrowUp') nextRow = (coord.row - 1 + puzzle.size) % puzzle.size;
    else if (e.key === 'ArrowDown') nextRow = (coord.row + 1) % puzzle.size;
    else if (e.key === 'ArrowLeft') nextCol = (coord.col - 1 + puzzle.size) % puzzle.size;
    else if (e.key === 'ArrowRight') nextCol = (coord.col + 1) % puzzle.size;
    else if (e.key === 'x' || e.key === 'X') {
      e.preventDefault();
      const kind = getTileKind(puzzle, coord);
      if (!isFixedTile(kind) && !solved) onToggleMark(coord);
      return;
    } else {
      return;
    }

    e.preventDefault();
    const nextBtn = cellRefs.current.get(`${nextRow},${nextCol}`);
    nextBtn?.focus();
  };

  const getNeighborConnections = (coord: GridCoord) => {
    const k = coordKey(coord);
    if (!activeSet.has(k)) {
      return { up: false, down: false, left: false, right: false };
    }
    return {
      up: coord.row > 0 && activeSet.has(`${coord.row - 1},${coord.col}`),
      down: coord.row < puzzle.size - 1 && activeSet.has(`${coord.row + 1},${coord.col}`),
      left: coord.col > 0 && activeSet.has(`${coord.row},${coord.col - 1}`),
      right: coord.col < puzzle.size - 1 && activeSet.has(`${coord.row},${coord.col + 1}`),
    };
  };

  const rows = Array.from({ length: puzzle.size }, (_, r) => r);
  const cols = Array.from({ length: puzzle.size }, (_, c) => c);

  return (
    <div
      className="w-full max-w-[430px] mx-auto select-none"
      role="region"
      aria-label="LineQuota 5 by 5 logic grid"
    >
      <div
        className="grid gap-1.5 items-center"
        style={{
          gridTemplateColumns: 'minmax(44px, 52px) repeat(5, minmax(44px, 1fr))',
        }}
      >
        <div
          className="h-11 flex items-center justify-center text-xs font-semibold uppercase tracking-wide"
          style={{ color: 'var(--ink-muted)' }}
          aria-hidden="true"
        >
          Quota
        </div>

        {cols.map((c) => {
          const count = validation.colCounts[c] ?? 0;
          const target = puzzle.colTargets[c] ?? 0;
          const status = validation.colStatus[c] ?? 'under';
          const bg =
            status === 'exact'
              ? 'var(--signal)'
              : status === 'over'
                ? 'var(--error-bg)'
                : 'var(--surface-alt)';
          const fg =
            status === 'exact'
              ? 'var(--signal-ink)'
              : status === 'over'
                ? 'var(--error)'
                : 'var(--ink)';

          return (
            <div
              key={`col-q-${c}`}
              className="h-11 rounded-md border flex flex-col items-center justify-center tabular-nums text-xs font-bold leading-tight"
              style={{
                backgroundColor: bg,
                color: fg,
                borderColor: status === 'over' ? 'var(--error)' : 'var(--border)',
              }}
              aria-label={`Column ${c + 1} quota: ${count} of ${target} active`}
            >
              <span>{target}</span>
              <span className="text-[11px] font-medium">
                {status === 'exact' ? 'OK' : status === 'over' ? `${count}!` : `${count}/${target}`}
              </span>
            </div>
          );
        })}

        {rows.map((r) => {
          const rowCount = validation.rowCounts[r] ?? 0;
          const rowTarget = puzzle.rowTargets[r] ?? 0;
          const rowStatus = validation.rowStatus[r] ?? 'under';
          const rowBg =
            rowStatus === 'exact'
              ? 'var(--signal)'
              : rowStatus === 'over'
                ? 'var(--error-bg)'
                : 'var(--surface-alt)';
          const rowFg =
            rowStatus === 'exact'
              ? 'var(--signal-ink)'
              : rowStatus === 'over'
                ? 'var(--error)'
                : 'var(--ink)';

          return (
            <div key={`row-group-${r}`} className="contents">
              <div
                className="min-h-[48px] sm:min-h-[56px] rounded-md border flex flex-col items-center justify-center tabular-nums text-xs font-bold leading-tight px-1"
                style={{
                  backgroundColor: rowBg,
                  color: rowFg,
                  borderColor: rowStatus === 'over' ? 'var(--error)' : 'var(--border)',
                }}
                aria-label={`Row ${r + 1} quota: ${rowCount} of ${rowTarget} active`}
              >
                <span>{rowTarget}</span>
                <span className="text-[11px] font-medium">
                  {rowStatus === 'exact'
                    ? 'OK'
                    : rowStatus === 'over'
                      ? `${rowCount}!`
                      : `${rowCount}/${rowTarget}`}
                </span>
              </div>

              {cols.map((c) => {
                const coord = { row: r, col: c };
                const key = coordKey(coord);
                const kind = getTileKind(puzzle, coord);
                const fixed = isFixedTile(kind);
                const isActive =
                  kind === 'start' || kind === 'end' || activeSet.has(key);
                const isMarked = !isActive && markedSet.has(key);
                const isConnected = connectedSet.has(key);
                const isWarning =
                  branchedSet.has(key) || disconnectedSet.has(key);
                const isHinted =
                  hintedCoord !== null &&
                  hintedCoord.row === r &&
                  hintedCoord.col === c;
                const conn = getNeighborConnections(coord);

                let bgColor = 'var(--surface)';
                let textColor = 'var(--ink)';
                let borderColor = 'var(--border)';

                if (kind === 'wall') {
                  bgColor = 'var(--surface-alt)';
                  textColor = 'var(--ink-muted)';
                } else if (kind === 'start' || kind === 'end') {
                  bgColor = 'var(--accent)';
                  textColor = 'var(--accent-ink)';
                  borderColor = 'var(--accent)';
                } else if (isWarning) {
                  bgColor = 'var(--error-bg)';
                  textColor = 'var(--error)';
                  borderColor = 'var(--error)';
                } else if (isActive) {
                  bgColor = isConnected ? 'var(--signal)' : 'var(--relay)';
                  textColor = 'var(--signal-ink)';
                  borderColor = isConnected ? 'var(--signal)' : 'var(--relay)';
                } else if (kind === 'relay') {
                  bgColor = 'var(--surface)';
                  textColor = 'var(--ink)';
                  borderColor = 'var(--relay)';
                } else if (isMarked) {
                  bgColor = 'var(--surface-alt)';
                  textColor = 'var(--ink-muted)';
                }

                const stateDescription =
                  kind === 'wall'
                    ? 'Blocked wall'
                    : kind === 'start'
                      ? 'Start terminal'
                      : kind === 'end'
                        ? 'End terminal'
                        : kind === 'relay'
                          ? isActive
                            ? 'Relay node, active'
                            : 'Relay node, inactive, required'
                          : isActive
                            ? isWarning
                              ? 'Active, warning on path'
                              : 'Active on route'
                            : isMarked
                              ? 'Marked excluded'
                              : 'Empty cell';

                return (
                  <button
                    key={key}
                    ref={(el) => {
                      if (el) cellRefs.current.set(key, el);
                      else cellRefs.current.delete(key);
                    }}
                    type="button"
                    disabled={kind === 'wall'}
                    {...(kind === 'wall' ? {} : { 'aria-pressed': isActive })}
                    aria-label={`Row ${r + 1}, Column ${c + 1}: ${stateDescription}`}
                    onClick={() => handleCellActivate(coord)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (!fixed && !solved) onToggleMark(coord);
                    }}
                    onKeyDown={(e) => handleKeyDown(e, coord)}
                    className="touch-target lq-transition relative aspect-square w-full rounded-md border-2 flex items-center justify-center font-bold text-sm"
                    style={{
                      backgroundColor: bgColor,
                      color: textColor,
                      borderColor: isHinted ? 'var(--accent)' : borderColor,
                      ...(isHinted ? { boxShadow: '0 0 0 2px var(--accent)' } : {}),
                    }}
                  >
                    {isActive && kind !== 'wall' && (
                      <svg
                        viewBox="0 0 40 40"
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        aria-hidden="true"
                      >
                        {conn.up && (
                          <line
                            x1="20"
                            y1="0"
                            x2="20"
                            y2="20"
                            stroke="currentColor"
                            strokeWidth="4"
                            strokeOpacity="0.45"
                          />
                        )}
                        {conn.down && (
                          <line
                            x1="20"
                            y1="20"
                            x2="20"
                            y2="40"
                            stroke="currentColor"
                            strokeWidth="4"
                            strokeOpacity="0.45"
                          />
                        )}
                        {conn.left && (
                          <line
                            x1="0"
                            y1="20"
                            x2="20"
                            y2="20"
                            stroke="currentColor"
                            strokeWidth="4"
                            strokeOpacity="0.45"
                          />
                        )}
                        {conn.right && (
                          <line
                            x1="20"
                            y1="20"
                            x2="40"
                            y2="20"
                            stroke="currentColor"
                            strokeWidth="4"
                            strokeOpacity="0.45"
                          />
                        )}
                      </svg>
                    )}

                    <span className="relative z-10 flex flex-col items-center justify-center leading-none">
                      {kind === 'start' && (
                        <>
                          <span className="text-base font-extrabold">S</span>
                          <span className="text-[9px] font-semibold tracking-wider">START</span>
                        </>
                      )}
                      {kind === 'end' && (
                        <>
                          <span className="text-base font-extrabold">E</span>
                          <span className="text-[9px] font-semibold tracking-wider">END</span>
                        </>
                      )}
                      {kind === 'wall' && (
                        <span className="text-base font-bold" aria-hidden="true">
                          #
                        </span>
                      )}
                      {kind === 'relay' && (
                        <span
                          className="inline-flex items-center justify-center w-6 h-6 rounded-sm text-xs font-extrabold border"
                          style={{
                            backgroundColor: isActive ? 'var(--signal-ink)' : 'var(--relay)',
                            color: isActive ? 'var(--signal)' : 'var(--relay-ink)',
                            borderColor: 'currentColor',
                          }}
                        >
                          R
                        </span>
                      )}
                      {kind === 'open' && isActive && (
                        <span className="text-xs font-extrabold">
                          {isWarning ? '!' : '●'}
                        </span>
                      )}
                      {kind === 'open' && isMarked && (
                        <span className="text-base font-bold" aria-hidden="true">
                          ×
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};
