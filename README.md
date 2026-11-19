# LineQuota

A daily 5x5 orthogonal circuit-and-quota logic puzzle built on Reddit's Devvit Web platform (`@devvit/web@0.15.4`, `@devvit/analytics@0.15.4`, React, TypeScript, Hono, and Redis).

## How to Play

1. Connect **S** (Start) to **E** (End) with a single continuous orthogonal path (no branches, diagonal jumps, or disconnected tiles).
2. Route through every mandatory **R** (Relay) node and avoid **#** (Wall) blocks.
3. Match the exact active tile count shown at the top of each column and left of each row.
4. **Controls:**
   - **Click / Tap** any open tile to toggle it on or off.
   - **Press and Drag** across tiles (or start dragging directly from **S** / **E**) on desktop or mobile to draw or erase a continuous stroke in one motion.
   - **Mark (X)** mode, **Right-Click**, or the **X** key crosses out cells you want to exclude.
   - **Keyboard:** Use Arrow keys to move focus across the 5x5 grid, `Enter`/`Space` to toggle, and `X` to mark.

Every UTC day (`YYYY-MM-DD`) generates a deterministic puzzle verified by an exact backtracking solver to have a unique solution.

## Key Features

- **Daily Circuit & Practice Archive:** Fresh daily board every UTC day (`00:00 UTC`), plus 3 practice boards and a live countdown to the next UTC reset.
- **Community Challenge Seeds (`LQ-XXXX`):** Generate a deterministic custom seed (`New Seed`) or enter any `LQ-XXXX` code to play and share custom boards with other players in the comments.
- **Reddit-Native Community Loop:**
  - Subreddit Redis leaderboard ranking clean solves (0 hints) and fastest completion times.
  - Persistent daily UTC streak tracking and automatic subreddit user flair (`LineQuota ⚡ Xd`) on daily solve.
  - One-click **Post to Thread** button that publishes a spoiler-free emoji circuit grid to the post comments.
- **Automated Daily Posting:** Built-in Devvit scheduler (`0 0 * * *`) with Redis idempotency creates today's Interactive Post automatically at `00:00 UTC`.
- **Devvit Journeys Analytics:** Instrumented with `@devvit/analytics` (`App.Ready`, `Journey.Start`, `Journey.Progress`, `Journey.Interaction`, `Journey.End`).

## Local Verification

```bash
npm test            # Vitest unit & solver uniqueness suite
npm run typecheck   # TypeScript strict check (client, server, shared)
npm run lint        # ESLint verification
npm run build       # Production Vite bundle (client + server)
```

## Uploading & Testing on Reddit

1. Authenticate with your Reddit developer account:
   ```bash
   npx devvit login
   ```
2. Upload the app (private upload, do not run `devvit publish` for the hackathon):
   ```bash
   npm run deploy
   ```
3. Install the app on your public test subreddit (`< 200` members) or run `npm run dev` to playtest.
4. Open the subreddit moderator menu and click **Post Today's LineQuota** (or let `onAppInstall` / the `00:00 UTC` scheduler create the Interactive Post automatically).
