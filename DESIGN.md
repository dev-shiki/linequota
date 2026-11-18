# LineQuota Design Direction

Dial: ENERGY 2 / RHYTHM 2 / MOTION 1

## Identity & Purpose
- **Product:** LineQuota, a daily orthogonal path-and-quota logic puzzle built for Reddit Interactive Posts (Devvit Web).
- **Visual Language:** Editorial newsprint & signal-ink puzzle card. Crisp 1px rules, tactile tile buttons, high-contrast type, and unambiguous spatial feedback.
- **Audience:** Daily puzzle players on Reddit (mobile-first thumb ergonomics + desktop keyboard parity).

## Color System (R-29: 2 core colors + 1 accent + neutrals)
- **Light Theme (Default: Warm Newsprint Paper):**
  - `--bg`: `#F7F4EC` (newsprint paper)
  - `--surface`: `#FFFFFF` (puzzle board & primary card)
  - `--surface-alt`: `#EDE8DC` (wall tiles & secondary recessed bar)
  - `--ink`: `#181A1F` (primary text, 15.84:1 on `--bg`, 17.41:1 on `--surface`)
  - `--ink-muted`: `#454C59` (labels & captions, 7.86:1 on `--bg`, 8.64:1 on `--surface`)
  - `--border`: `#7A7569` (interactive boundaries, 4.18:1 on `--bg`, 4.59:1 on `--surface`)
  - `--signal`: `#1B4D3E` (Core 1: active connected path & exact quota confirmation, `#FFFFFF` text at 9.64:1)
  - `--relay`: `#1E3A5F` (Core 2: mandatory relay nodes & structural headers, `#FFFFFF` text at 11.50:1)
  - `--accent`: `#B83D08` (Accent: primary action CTA, START/END terminal markers, keyboard focus ring, `#FFFFFF` text at 5.66:1)
  - `--error`: `#B91C1C` (over-quota / error state text, 6.47:1 on `--surface`)
- **Dark Theme (Toggleable: Slate Ink):**
  - `--bg`: `#111318`
  - `--surface`: `#1B1F27`
  - `--surface-alt`: `#252B36`
  - `--ink`: `#F3F1EA` (16.44:1 on `--bg`, 14.61:1 on `--surface`)
  - `--ink-muted`: `#B4BCC8` (9.70:1 on `--bg`, 8.62:1 on `--surface`)
  - `--border`: `#6E7787` (3.66:1 on `--surface`)
  - `--signal`: `#146B4E` (`#FFFFFF` text at 6.48:1; `#4ADE80` indicator with `#0B1310` ink at 10.81:1)
  - `--relay`: `#254E7D` (`#FFFFFF` text at 8.52:1)
  - `--accent`: `#C9440A` (`#FFFFFF` text at 4.87:1; `#F0703B` focus outline)
  - `--error`: `#FCA5A5` (8.70:1 on `--surface`)

## Typography & Layout Rhythm
- **Typography (R-06):** System editorial sans (`"Segoe UI", system-ui, -apple-system, sans-serif`) paired with tabular numerals (`font-variant-numeric: tabular-nums`) for row/column quotas, timer, and leaderboard ranks so numbers align without layout shift.
- **Rhythm (R-05, RHYTHM 2):** Compact top utility bar (title + theme/help/archive controls), asymmetric two-column desktop workspace (5x5 interactive puzzle board on left, live path diagnostics + community standings on right), collapsing to a single vertical column on mobile (`<= 768px`) with 44x44px+ touch targets.
- **Motion (R-19, MOTION 1):** Crisp 120ms hover/press transitions only; zero continuous loops or floating animations; disabled under `prefers-reduced-motion: reduce`.
