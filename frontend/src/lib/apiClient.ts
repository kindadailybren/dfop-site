import {
  FuzzyPlayerMatch,
  GameFormat,
  PlayerProfile,
  PositionLine,
  PublicStateResponse,
  SessionGame,
  SessionRecord,
  SkillLevel,
  TeamGenerationResult,
} from '@dfop/shared';
import { getSavedAdminSession } from './auth.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '';

async function requestJson<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const admin = getSavedAdminSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (admin?.idToken) {
    headers.Authorization = `Bearer ${admin.idToken}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string })?.error || `Request failed (${res.status})`
    );
  }
  return data as T;
}

export async function fetchPublicState(): Promise<PublicStateResponse> {
  return requestJson<PublicStateResponse>('/api/state');
}

export async function previewCsvApi(csvText: string): Promise<{
  rows: Array<{
    name: string;
    skill: SkillLevel;
    preferredPosition: PositionLine;
    rawLineNumber: number;
  }>;
  errors: string[];
  warnings: string[];
  fuzzyMatches: FuzzyPlayerMatch[];
}> {
  return requestJson('/api/admin/csv/preview', {
    method: 'POST',
    body: JSON.stringify({ csvText }),
  });
}

export async function createSessionApi(input: {
  title: string;
  date: string;
  location: string;
  defaultFormat: GameFormat;
  csvText: string;
  fuzzyAliasMap?: Record<string, string>;
}): Promise<{ session: SessionRecord }> {
  return requestJson('/api/admin/sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateParticipantsApi(
  sessionId: string,
  input: {
    togglePlayerId?: string;
    active?: boolean;
    addPlayer?: {
      name: string;
      skill: SkillLevel;
      preferredPosition: PositionLine;
    };
    csvText?: string;
  }
): Promise<{ session: SessionRecord }> {
  return requestJson(`/api/admin/sessions/${sessionId}/participants`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function generateTeamsApi(
  sessionId: string,
  input: {
    format: GameFormat;
    lockedTeamAIds?: string[];
    lockedTeamBIds?: string[];
    lockedBenchIds?: string[];
    seed?: number;
  }
): Promise<TeamGenerationResult> {
  return requestJson(`/api/admin/sessions/${sessionId}/generate-teams`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createGameApi(
  sessionId: string,
  input: {
    format: GameFormat;
    teamAName?: string;
    teamBName?: string;
    teamAPlayerIds: string[];
    teamBPlayerIds: string[];
    benchPlayerIds?: string[];
  }
): Promise<{ session: SessionRecord }> {
  return requestJson(`/api/admin/sessions/${sessionId}/games`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateGameApi(
  sessionId: string,
  gameId: string,
  input: {
    scoreA?: number;
    scoreB?: number;
    status?: SessionGame['status'];
    teamAPlayerIds?: string[];
    teamBPlayerIds?: string[];
    benchPlayerIds?: string[];
    playerStats?: Record<string, { goals: number; assists: number }>;
    mvpPlayerId?: string | null;
  }
): Promise<{ session: SessionRecord }> {
  return requestJson(`/api/admin/sessions/${sessionId}/games/${gameId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function finalizeSessionApi(
  sessionId: string,
  input: { sessionMvpPlayerId?: string; notes?: string }
): Promise<{ session: SessionRecord; leaderboard: PlayerProfile[] }> {
  return requestJson(`/api/admin/sessions/${sessionId}/finalize`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updatePlayerApi(
  playerId: string,
  input: { name?: string; skill?: SkillLevel; preferredPosition?: PositionLine }
): Promise<{ player: PlayerProfile }> {
  return requestJson(`/api/admin/players/${playerId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}
