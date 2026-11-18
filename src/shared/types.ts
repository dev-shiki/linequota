export interface GridCoord {
  row: number;
  col: number;
}

export type TileKind = 'open' | 'start' | 'end' | 'relay' | 'wall';

export type CellMark = 'empty' | 'active' | 'marked';

export type QuotaStatus = 'under' | 'exact' | 'over';

export interface PuzzlePublic {
  dateKey: string;
  puzzleNumber: number;
  size: number;
  start: GridCoord;
  end: GridCoord;
  relays: GridCoord[];
  walls: GridCoord[];
  rowTargets: number[];
  colTargets: number[];
  parMoves: number;
}

export interface DailyPuzzle extends PuzzlePublic {
  solution: GridCoord[];
}

export interface ValidationResult {
  isValidPath: boolean;
  connectedFromStart: string[];
  disconnectedActive: string[];
  branchedCells: string[];
  reachedEnd: boolean;
  relaysHit: number;
  relaysTotal: number;
  rowCounts: number[];
  colCounts: number[];
  rowStatus: QuotaStatus[];
  colStatus: QuotaStatus[];
  reason: string;
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  elapsedSeconds: number;
  moves: number;
  hintsUsed: number;
}

export interface CommunityStats {
  totalSolves: number;
  cleanSolves: number;
  fastestSeconds: number | null;
  leaderboard: LeaderboardEntry[];
}

export interface UserDailyRecord {
  solved: boolean;
  elapsedSeconds: number | null;
  moves: number | null;
  hintsUsed: number;
  streak: number;
  lastSolvedDate: string | null;
}
