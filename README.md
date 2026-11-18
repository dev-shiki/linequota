# LineQuota

A daily 5x5 orthogonal circuit-and-quota logic puzzle built on Reddit's Devvit Web platform (`@devvit/web` + React + TypeScript + Hono + Redis).

## Rules of the Game

1. Connect `S` (START) to `E` (END) with one continuous orthogonal path (no branches, loops, or disconnected tiles).
2. Route through every mandatory `R` (Relay) node and avoid `#` (Wall) blocks.
3. Match the active tile count at the top of each column and left of each row.
4. Use Mark (`X`) mode, right-click, or the `X` key to cross out empty candidates.

Every UTC day (`YYYY-MM-DD`) generates a deterministic puzzle verified by an exact backtracking solver to have a unique solution.

## Local Verification Commands

- Typecheck: `npm run typecheck` (or `npm run test:types`)
- Unit tests: `npm test`
- Production build (client + server): `npm run build`
- Lint: `npm run lint`

## Deploying to Reddit

1. Authenticate with your Reddit developer account: `npx devvit login`
2. Playtest in a private/testing subreddit: `npm run dev`
3. Upload to Devvit: `npm run deploy`
4. Create an Interactive Post via subreddit moderator menu (`Post Today's LineQuota`) or automatically on app install.
