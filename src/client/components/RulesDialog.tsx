import { useEffect } from 'react';

interface RulesDialogProps {
  open: boolean;
  onClose: () => void;
}

export const RulesDialog = ({ open, onClose }: RulesDialogProps) => {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(17, 19, 24, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rules-dialog-title"
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
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 id="rules-dialog-title" className="text-lg font-bold">
            How to Play LineQuota
          </h2>
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

        <ol className="space-y-3 text-sm list-decimal pl-5">
          <li>
            Build one continuous orthogonal line from <strong>S (START)</strong> to{' '}
            <strong>E (END)</strong> with no branches, loops, or disconnected tiles.
          </li>
          <li>
            Pass through every mandatory <strong>R (Relay)</strong> node and avoid{' '}
            <strong># (Wall)</strong> blocks.
          </li>
          <li>
            Match the exact active tile count shown at the top of each column and left of each row.
          </li>
          <li>
            Use <strong>Mark (X)</strong> mode, right-click, or the <strong>X</strong> key to
            cross out tiles you know stay empty.
          </li>
        </ol>

        <div
          className="mt-4 pt-3 border-t text-xs"
          style={{ borderColor: 'var(--border-subtle)', color: 'var(--ink-muted)' }}
        >
          Keyboard controls: Arrow keys move focus across cells, Space or Enter toggles a tile, and
          X marks an excluded tile.
        </div>
      </div>
    </div>
  );
};
