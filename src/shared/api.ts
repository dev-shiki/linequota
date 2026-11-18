import type { CommunityStats, GridCoord, PuzzlePublic, UserDailyRecord } from './types';

export interface PuzzleResponse {
  type: 'puzzle';
  mode: 'reddit' | 'local';
  postId: string;
  username: string;
  puzzle: PuzzlePublic;
  userRecord: UserDailyRecord;
  community: CommunityStats;
  savedActiveKeys: string[];
  savedMarkedKeys: string[];
}

export interface SaveProgressRequest {
  dateKey: string;
  activeKeys: string[];
  markedKeys: string[];
}

export interface HintRequest {
  dateKey: string;
  activeKeys: string[];
}

export interface HintResponse {
  type: 'hint';
  action: 'add' | 'remove';
  coord: GridCoord;
  message: string;
  hintsUsed: number;
}

export interface SolveRequest {
  dateKey: string;
  activeKeys: string[];
  elapsedSeconds: number;
  moves: number;
  hintsUsed: number;
}

export interface SolveResponse {
  type: 'solve';
  accepted: boolean;
  message: string;
  userRecord: UserDailyRecord;
  community: CommunityStats;
  shareText: string;
}

export interface ShareCommentRequest {
  dateKey: string;
  shareText: string;
}

export interface ShareCommentResponse {
  type: 'share-comment';
  posted: boolean;
  message: string;
}

export interface ApiErrorResponse {
  status: 'error';
  message: string;
}
