import { useEffect, useState } from 'react';
import { formatDuration } from '../../shared/puzzle';
import type { UserDailyRecord } from '../../shared/types';

interface WinDialogProps {
  open: boolean;
  puzzleNumber: number;
  dateKey: string;
  record: UserDailyRecord;
  shareText: string;
  mode: 'reddit' | 'local';
  onClose: () => void;
  onPostComment: () => Promise<{ posted: boolean; message: string }>;
}

export const WinDialog = ({
  open,
  puzzleNumber,
  dateKey,
  record,
  shareText,
  mode,
  onClose,
  onPostComment,
}: WinDialogProps) => {
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [commentStatus, setCommentStatus] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);

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

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopyStatus('Copied spoiler-free result to clipboard.');
    } catch {
      setCopyStatus('Clipboard blocked. Select and copy the summary box below.');
    }
  };

  const handleComment = async () => {
    setPosting(true);
    setCommentStatus(null);
    try {
      const res = await onPostComment();
      setCommentStatus(res.message);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(17, 19, 24, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="win-dialog-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-lg border p-5"
        style={{
          backgroundColor: 'var(--surface)',
          color: 'var(--ink)',
          borderColor: 'var(--border)',
          boxShadow: 'var(--shadow-elevated)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <h2 id="win-dialog-title" className="text-lg font-bold">
              Circuit Complete
            </h2>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              LineQuota #{puzzleNumber} ({dateKey})
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="touch-target px-3 py-2 rounded-md border text-sm font-semibold"
            style={{
              backgroundColor: 'var(--surface-alt)',
              color: 'var(--ink)',
              borderColor: 'var(--border)',
            }}
          >
            Close
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4 text-center tabular-nums">
          <div
            className="rounded-md border p-2.5"
            style={{ backgroundColor: 'var(--surface-alt)', borderColor: 'var(--border)' }}
          >
            <div className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              Time
            </div>
            <div className="text-base font-bold">
              {formatDuration(record.elapsedSeconds ?? 0)}
            </div>
          </div>
          <div
            className="rounded-md border p-2.5"
            style={{ backgroundColor: 'var(--surface-alt)', borderColor: 'var(--border)' }}
          >
            <div className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              Moves
            </div>
            <div className="text-base font-bold">{record.moves ?? 0}</div>
          </div>
          <div
            className="rounded-md border p-2.5"
            style={{ backgroundColor: 'var(--surface-alt)', borderColor: 'var(--border)' }}
          >
            <div className="text-xs" style={{ color: 'var(--ink-muted)' }}>
              Streak
            </div>
            <div className="text-base font-bold">{record.streak}d</div>
          </div>
        </div>

        <pre
          className="text-xs p-3 rounded-md border overflow-x-auto mb-4 whitespace-pre-wrap"
          style={{
            backgroundColor: 'var(--surface-alt)',
            borderColor: 'var(--border)',
            color: 'var(--ink)',
          }}
        >
          {shareText}
        </pre>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="touch-target flex-1 px-4 py-2.5 rounded-md font-semibold text-sm"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--accent-ink)',
            }}
          >
            Copy Result
          </button>
          <button
            type="button"
            disabled={mode !== 'reddit' || posting}
            onClick={() => void handleComment()}
            className="touch-target flex-1 px-4 py-2.5 rounded-md border font-semibold text-sm disabled:opacity-60"
            style={{
              backgroundColor: 'var(--signal)',
              color: 'var(--signal-ink)',
              borderColor: 'var(--signal)',
            }}
          >
            {posting ? 'Posting...' : 'Post to Thread'}
          </button>
        </div>

        {copyStatus && (
          <p className="mt-3 text-xs font-medium" role="status">
            {copyStatus}
          </p>
        )}
        {commentStatus && (
          <p className="mt-2 text-xs font-medium" role="status">
            {commentStatus}
          </p>
        )}
        {mode === 'local' && !commentStatus && (
          <p className="mt-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
            Posting directly to Reddit comments requires running inside a Reddit Interactive Post.
          </p>
        )}
      </div>
    </div>
  );
};
