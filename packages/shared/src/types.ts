export type SkillLevel = 'Beginner' | 'Intermediate' | 'Advanced';

export type PositionLine = 'GK' | 'DEF' | 'MID' | 'FWD' | 'ANY';

export type GameFormat = '7-aside' | '9-aside' | '11-aside';

export const SKILL_WEIGHTS: Record<SkillLevel, number> = {
  Beginner: 1,
  Intermediate: 2,
  Advanced: 3,
};

export const FORMAT_TEAM_SIZE: Record<GameFormat, number> = {
  '7-aside': 7,
  '9-aside': 9,
  '11-aside': 11,
};

export const POSITION_ORDER: PositionLine[] = ['GK', 'DEF', 'MID', 'FWD', 'ANY'];

export interface PlayerProfile {
  id: string;
  normalizedName: string;
  name: string;
  skill: SkillLevel;
  preferredPosition: PositionLine;
  gamesPlayed: number;
  sessionsPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  points: number; // 3 for Win, 1 for Draw, 0 for Loss
  goals: number;
  assists: number;
  gameMvps: number;
  sessionMvps: number;
  performanceIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionParticipant {
  playerId: string;
  name: string;
  normalizedName: string;
  skill: SkillLevel;
  preferredPosition: PositionLine;
  active: boolean; // true if present and available for team selection
  sessionGamesPlayed: number;
  isNewPlayer?: boolean;
}

export interface GamePlayerStat {
  playerId: string;
  goals: number;
  assists: number;
}

export interface SessionGame {
  id: string;
  gameNumber: number;
  format: GameFormat;
  status: 'upcoming' | 'live' | 'completed';
  teamAName: string;
  teamBName: string;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  benchPlayerIds: string[];
  scoreA: number;
  scoreB: number;
  playerStats: Record<string, { goals: number; assists: number }>;
  mvpPlayerId?: string;
  startedAt: string;
  completedAt?: string;
}

export interface SessionRecord {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  location: string;
  defaultFormat: GameFormat;
  status: 'active' | 'completed';
  participants: SessionParticipant[];
  games: SessionGame[];
  sessionMvpPlayerId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface CsvRowInput {
  name: string;
  skill: SkillLevel;
  preferredPosition: PositionLine;
  rawLineNumber: number;
}

export interface FuzzyPlayerMatch {
  csvName: string;
  matchedPlayerId: string;
  matchedPlayerName: string;
  distance: number;
  exactNormalized: boolean;
}

export interface CsvParseResult {
  rows: CsvRowInput[];
  errors: string[];
  warnings: string[];
}

export interface TeamBalanceMetrics {
  teamACount: number;
  teamBCount: number;
  benchCount: number;
  teamASkillTotal: number;
  teamBSkillTotal: number;
  teamAAvgSkill: number;
  teamBAvgSkill: number;
  teamAPositions: Record<PositionLine, number>;
  teamBPositions: Record<PositionLine, number>;
}

export interface TeamGenerationInput {
  format: GameFormat;
  participants: SessionParticipant[];
  games: SessionGame[];
  lockedTeamAIds?: string[];
  lockedTeamBIds?: string[];
  lockedBenchIds?: string[];
  seed?: number;
}

export interface TeamGenerationResult {
  format: GameFormat;
  targetTeamSize: number;
  teamA: SessionParticipant[];
  teamB: SessionParticipant[];
  bench: SessionParticipant[];
  metrics: TeamBalanceMetrics;
}

export interface PublicStateResponse {
  activeSession: SessionRecord | null;
  leaderboard: PlayerProfile[];
  recentSessions: SessionRecord[];
  updatedAt: string;
}
