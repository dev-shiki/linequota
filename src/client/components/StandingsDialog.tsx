import { useEffect } from 'react';
import type { FormEvent } from 'react';
import { formatDuration } from '../../shared/puzzle';
import type { CommunityStats } from '../../shared/types';

export type StandingsTab = 'standings' | 'seeds';

interface StandingsDialogProps {
  open: boolean;
  tab: StandingsTab;
  onTabChange: (tab: StandingsTab) => void;
  mode: 'reddit' | 'local';
  username: string;
  community: CommunityStats;
  seedInput: string;
  onSeedInputChange: (val: string) => void;
  onPlaySeed: (e: FormEvent<HTMLFormElement>) => void;
  onNewSeed: () => void;
  onClose: () => void;
}

export const StandingsDialog = ({
  open,
  tab,
  onTabChange,
  mode,
  username,
  community,
  seedInput,
  onSeedInputChange,
  onPlaySeed,
  onNewSeed,
  onClose,
}: StandingsDialogProps) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="lq-backdrop-in fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(17, 19, 24, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="standings-dialog-title"
      onClick={onClose}
    >
      <div
        className="lq-dialog-in w-full max-w-md rounded-lg border p-5 max-h-[85dvh] overflow-y-auto"
        style={{
          backgroundColor: 'var(--surface)',
          color: 'var(--ink)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-elevated)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2" role="tablist" aria-label="Community panels">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'standings'}
              onClick={() => onTabChange('standings')}
              className="touch-target px-3 py-1.5 rounded-md border text-xs sm:text-sm font-bold"
              style={{
                backgroundColor: tab === 'standings' ? 'var(--accent)' : 'var(--surface-alt)',
                color: tab === 'standings' ? 'var(--accent-ink)' : 'var(--ink)',
                borderColor: tab === 'standings' ? 'var(--accent)' : 'var(--border)',
              }}
            >
              Standings ({community.totalSolves})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'seeds'}
              onClick={() => onTabChange('seeds')}
              className="touch-target px-3 py-1.5 rounded-md border text-xs sm:text-sm font-bold"
              style={{
                backgroundColor: tab === 'seeds' ? 'var(--accent)' : 'var(--surface-alt)',
                color: tab === 'seeds' ? 'var(--accent-ink)' : 'var(--ink)',
                borderColor: tab === 'seeds' ? 'var(--accent)' : 'var(--border)',
              }}
            >
              Challenge Seeds
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target px-3 py-1.5 rounded-md border text-xs sm:text-sm font-semibold"
            style={{
              backgroundColor: 'var(--surface-alt)',
              color: 'var(--ink)',
              borderColor: 'var(--border)',
            }}
          >
            Close
          </button>
        </div>

        <h2 id="standings-dialog-title" className="sr-only">
          {tab === 'standings' ? 'Subreddit Standings' : 'Challenge Seeds'}
        </h2>

        {tab === 'standings' ? (
          <div>
            <div className="flex items-center justify-between text-xs mb-3" style={{ color: 'var(--ink-muted)' }}>
              <span>{mode === 'reddit' ? `Playing as u/${username}` : 'Local Preview'}</span>
              <span>
                Clean solves: {community.cleanSolves} / {community.totalSolves}
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
                No recorded solves for this board yet. Complete the route to set the first time.
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
          </div>
        ) : (
          <div>
            <p className="text-xs sm:text-sm mb-3" style={{ color: 'var(--ink-muted)' }}>
              Generate a deterministic 5x5 circuit code (e.g. LQ-7K9P) or paste a code from the
              comments to play the same custom board.
            </p>
            <form
              onSubmit={(e) => {
                onPlaySeed(e);
                onClose();
              }}
              className="flex items-center gap-2 mb-3"
            >
              <label htmlFor="challenge-seed-input" className="sr-only">
                Challenge Seed Code
              </label>
              <input
                id="challenge-seed-input"
                type="text"
                value={seedInput}
                onChange={(e) => onSeedInputChange(e.target.value)}
                placeholder="LQ-XXXX"
                maxLength={24}
                className="touch-target flex-1 min-w-0 px-3 py-2 rounded-md border text-xs sm:text-sm font-semibold uppercase"
                style={{
                  backgroundColor: 'var(--surface-alt)',
                  color: 'var(--ink)',
                  borderColor: 'var(--border)',
                }}
              />
              <button
                type="submit"
                className="touch-target px-4 py-2 rounded-md text-xs sm:text-sm font-semibold"
                style={{
                  backgroundColor: 'var(--accent)',
                  color: 'var(--accent-ink)',
                }}
              >
                Load
              </button>
            </form>
            <button
              type="button"
              onClick={() => {
                onNewSeed();
                onClose();
              }}
              className="touch-target w-full px-4 py-2.5 rounded-md border text-xs sm:text-sm font-bold"
              style={{
                backgroundColor: 'var(--surface-alt)',
                color: 'var(--ink)',
                borderColor: 'var(--border)',
              }}
            >
              Generate Random Seed
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
