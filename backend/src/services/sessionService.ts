import { randomUUID } from 'node:crypto';
import {
  FuzzyPlayerMatch,
  GameFormat,
  PlayerProfile,
  PositionLine,
  PublicStateResponse,
  SessionGame,
  SessionParticipant,
  SessionRecord,
  SkillLevel,
  TeamGenerationResult,
  computePerformanceIndex,
  computeSessionPlayerDeltas,
  findFuzzyMatches,
  generateBalancedTeams,
  getSuggestedSessionMvp,
  normalizePlayerName,
  parseParticipantsCsv,
  recalculateParticipantGamesPlayed,
} from '@dfop/shared';
import { AppError } from '../lib/response.js';
import { getRepository } from '../repositories/dfopRepository.js';

export interface CreateSessionInput {
  title: string;
  date?: string;
  location?: string;
  defaultFormat?: GameFormat;
  csvText: string;
  fuzzyAliasMap?: Record<string, string>; // normalizedCsvName -> existingPlayerId
}

export interface UpdateParticipantsInput {
  togglePlayerId?: string;
  active?: boolean;
  addPlayer?: {
    name: string;
    skill: SkillLevel;
    preferredPosition: PositionLine;
  };
  csvText?: string;
}

export interface CreateGameInput {
  format: GameFormat;
  teamAName?: string;
  teamBName?: string;
  teamAPlayerIds: string[];
  teamBPlayerIds: string[];
  benchPlayerIds?: string[];
}

export interface UpdateGameInput {
  scoreA?: number;
  scoreB?: number;
  status?: 'upcoming' | 'live' | 'completed';
  teamAName?: string;
  teamBName?: string;
  teamAPlayerIds?: string[];
  teamBPlayerIds?: string[];
  benchPlayerIds?: string[];
  playerStats?: Record<string, { goals: number; assists: number }>;
  mvpPlayerId?: string | null;
}

export async function getPublicState(): Promise<PublicStateResponse> {
  const repo = getRepository();
  const [activeId, leaderboard, recentSessions] = await Promise.all([
    repo.getActiveSessionId(),
    repo.listPlayers(),
    repo.listSessions(15),
  ]);

  let activeSession: SessionRecord | null = null;
  if (activeId) {
    activeSession = await repo.getSessionById(activeId);
    if (activeSession && activeSession.status !== 'active') {
      activeSession = null;
    }
  }

  return {
    activeSession,
    leaderboard,
    recentSessions: recentSessions.filter((s) => s.status === 'completed'),
    updatedAt: new Date().toISOString(),
  };
}

export async function previewCsvUpload(csvText: string): Promise<{
  rows: ReturnType<typeof parseParticipantsCsv>['rows'];
  errors: string[];
  warnings: string[];
  fuzzyMatches: FuzzyPlayerMatch[];
}> {
  const parsed = parseParticipantsCsv(csvText);
  const existingPlayers = await getRepository().listPlayers();
  const fuzzyMatches = findFuzzyMatches(parsed.rows, existingPlayers);
  return {
    ...parsed,
    fuzzyMatches,
  };
}

async function resolveAndUpsertParticipants(
  csvText: string,
  fuzzyAliasMap: Record<string, string> = {}
): Promise<SessionParticipant[]> {
  const parsed = parseParticipantsCsv(csvText);
  if (parsed.errors.length > 0) {
    throw new AppError(400, parsed.errors.join(' '), 'CSV_PARSE_ERROR');
  }
  if (parsed.rows.length === 0) {
    throw new AppError(400, 'CSV must contain at least one valid participant row.', 'EMPTY_CSV');
  }

  const repo = getRepository();
  const existingPlayers = await repo.listPlayers();
  const byNormalized = new Map<string, PlayerProfile>();
  const byId = new Map<string, PlayerProfile>();

  for (const p of existingPlayers) {
    byNormalized.set(p.normalizedName, p);
    byId.set(p.id, p);
  }

  const now = new Date().toISOString();
  const playersToSave: PlayerProfile[] = [];
  const participants: SessionParticipant[] = [];

  for (const row of parsed.rows) {
    const norm = normalizePlayerName(row.name);
    const mappedId = fuzzyAliasMap[norm];
    let existing = mappedId ? byId.get(mappedId) : byNormalized.get(norm);

    if (existing) {
      // Update Skill and Preferred Position from latest CSV while preserving historical stats
      const updatedPlayer: PlayerProfile = {
        ...existing,
        skill: row.skill,
        preferredPosition: row.preferredPosition,
        updatedAt: now,
      };
      playersToSave.push(updatedPlayer);
      participants.push({
        playerId: updatedPlayer.id,
        name: updatedPlayer.name,
        normalizedName: updatedPlayer.normalizedName,
        skill: updatedPlayer.skill,
        preferredPosition: updatedPlayer.preferredPosition,
        active: true,
        sessionGamesPlayed: 0,
        isNewPlayer: false,
      });
    } else {
      const newPlayer: PlayerProfile = {
        id: `plr-${randomUUID().slice(0, 8)}`,
        name: row.name.trim(),
        normalizedName: norm,
        skill: row.skill,
        preferredPosition: row.preferredPosition,
        gamesPlayed: 0,
        sessionsPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        points: 0,
        goals: 0,
        assists: 0,
        gameMvps: 0,
        sessionMvps: 0,
        performanceIndex: 0,
        createdAt: now,
        updatedAt: now,
      };
      playersToSave.push(newPlayer);
      byNormalized.set(norm, newPlayer);
      byId.set(newPlayer.id, newPlayer);
      participants.push({
        playerId: newPlayer.id,
        name: newPlayer.name,
        normalizedName: newPlayer.normalizedName,
        skill: newPlayer.skill,
        preferredPosition: newPlayer.preferredPosition,
        active: true,
        sessionGamesPlayed: 0,
        isNewPlayer: true,
      });
    }
  }

  await repo.savePlayersBatch(playersToSave);
  return participants;
}

export async function createSession(input: CreateSessionInput): Promise<SessionRecord> {
  const repo = getRepository();
  const existingActiveId = await repo.getActiveSessionId();
  if (existingActiveId) {
    const existingSession = await repo.getSessionById(existingActiveId);
    if (existingSession && existingSession.status === 'active') {
      throw new AppError(
        409,
        `An active session ("${existingSession.title}") is already in progress. Finalize it before starting a new session.`,
        'ACTIVE_SESSION_EXISTS'
      );
    }
  }

  const participants = await resolveAndUpsertParticipants(
    input.csvText,
    input.fuzzyAliasMap
  );

  const now = new Date().toISOString();
  const session: SessionRecord = {
    id: `session-${randomUUID().slice(0, 8)}`,
    title: input.title.trim() || 'Davao Football Open Play Session',
    date: input.date || now.slice(0, 10),
    location: input.location?.trim() || 'Davao Open Play Pitch',
    defaultFormat: input.defaultFormat ?? '7-aside',
    status: 'active',
    participants,
    games: [],
    createdAt: now,
    updatedAt: now,
  };

  await repo.saveSession(session);
  await repo.setActiveSessionId(session.id);
  return session;
}

export async function updateSessionParticipants(
  sessionId: string,
  input: UpdateParticipantsInput
): Promise<SessionRecord> {
  const repo = getRepository();
  const session = await repo.getSessionById(sessionId);
  if (!session) {
    throw new AppError(404, 'Session not found.', 'SESSION_NOT_FOUND');
  }
  if (session.status !== 'active') {
    throw new AppError(400, 'Cannot modify participants of a completed session.', 'SESSION_COMPLETED');
  }

  let participants = [...session.participants];

  if (input.togglePlayerId) {
    participants = participants.map((p) =>
      p.playerId === input.togglePlayerId
        ? { ...p, active: input.active !== undefined ? input.active : !p.active }
        : p
    );
  }

  if (input.addPlayer) {
    const singleCsv = `Name,Skill,Preferred Position\n"${input.addPlayer.name}",${input.addPlayer.skill},${input.addPlayer.preferredPosition}`;
    const resolved = await resolveAndUpsertParticipants(singleCsv);
    for (const r of resolved) {
      const idx = participants.findIndex((p) => p.playerId === r.playerId);
      if (idx >= 0) {
        participants[idx] = {
          ...participants[idx],
          skill: r.skill,
          preferredPosition: r.preferredPosition,
          active: true,
        };
      } else {
        participants.push(r);
      }
    }
  }

  if (input.csvText) {
    const resolved = await resolveAndUpsertParticipants(input.csvText);
    for (const r of resolved) {
      const idx = participants.findIndex((p) => p.playerId === r.playerId);
      if (idx >= 0) {
        participants[idx] = {
          ...participants[idx],
          skill: r.skill,
          preferredPosition: r.preferredPosition,
          active: true,
        };
      } else {
        participants.push(r);
      }
    }
  }

  const updated: SessionRecord = {
    ...session,
    participants: recalculateParticipantGamesPlayed(participants, session.games),
    updatedAt: new Date().toISOString(),
  };

  await repo.saveSession(updated);
  return updated;
}

export async function generateTeamsForSession(
  sessionId: string,
  options: {
    format?: GameFormat;
    lockedTeamAIds?: string[];
    lockedTeamBIds?: string[];
    lockedBenchIds?: string[];
    seed?: number;
  }
): Promise<TeamGenerationResult> {
  const repo = getRepository();
  const session = await repo.getSessionById(sessionId);
  if (!session) {
    throw new AppError(404, 'Session not found.', 'SESSION_NOT_FOUND');
  }

  return generateBalancedTeams({
    format: options.format ?? session.defaultFormat,
    participants: session.participants,
    games: session.games,
    lockedTeamAIds: options.lockedTeamAIds,
    lockedTeamBIds: options.lockedTeamBIds,
    lockedBenchIds: options.lockedBenchIds,
    seed: options.seed,
  });
}

export async function createGame(
  sessionId: string,
  input: CreateGameInput
): Promise<SessionRecord> {
  const repo = getRepository();
  const session = await repo.getSessionById(sessionId);
  if (!session) {
    throw new AppError(404, 'Session not found.', 'SESSION_NOT_FOUND');
  }
  if (session.status !== 'active') {
    throw new AppError(400, 'Cannot add a game to a completed session.', 'SESSION_COMPLETED');
  }

  const now = new Date().toISOString();
  const nextNumber =
    session.games.length > 0
      ? Math.max(...session.games.map((g) => g.gameNumber)) + 1
      : 1;

  const pitchIds = new Set([...input.teamAPlayerIds, ...input.teamBPlayerIds]);
  const benchIds =
    input.benchPlayerIds ??
    session.participants
      .filter((p) => p.active && !pitchIds.has(p.playerId))
      .map((p) => p.playerId);

  const newGame: SessionGame = {
    id: `game-${nextNumber}-${randomUUID().slice(0, 4)}`,
    gameNumber: nextNumber,
    format: input.format,
    status: 'live',
    teamAName: input.teamAName?.trim() || 'DFOP Royal Blue',
    teamBName: input.teamBName?.trim() || 'DFOP Crest White',
    teamAPlayerIds: input.teamAPlayerIds,
    teamBPlayerIds: input.teamBPlayerIds,
    benchPlayerIds: benchIds,
    scoreA: 0,
    scoreB: 0,
    playerStats: {},
    startedAt: now,
  };

  const games = [...session.games, newGame];
  const updated: SessionRecord = {
    ...session,
    defaultFormat: input.format,
    games,
    participants: recalculateParticipantGamesPlayed(session.participants, games),
    updatedAt: now,
  };

  await repo.saveSession(updated);
  return updated;
}

export async function updateGame(
  sessionId: string,
  gameId: string,
  input: UpdateGameInput
): Promise<SessionRecord> {
  const repo = getRepository();
  const session = await repo.getSessionById(sessionId);
  if (!session) {
    throw new AppError(404, 'Session not found.', 'SESSION_NOT_FOUND');
  }
  if (session.status !== 'active') {
    throw new AppError(400, 'Cannot modify games in a completed session.', 'SESSION_COMPLETED');
  }

  const gameIdx = session.games.findIndex((g) => g.id === gameId);
  if (gameIdx === -1) {
    throw new AppError(404, 'Game not found in session.', 'GAME_NOT_FOUND');
  }

  const current = session.games[gameIdx];
  const now = new Date().toISOString();

  const nextStatus = input.status ?? current.status;
  const updatedGame: SessionGame = {
    ...current,
    scoreA: input.scoreA !== undefined ? Math.max(0, input.scoreA) : current.scoreA,
    scoreB: input.scoreB !== undefined ? Math.max(0, input.scoreB) : current.scoreB,
    status: nextStatus,
    teamAName: input.teamAName ?? current.teamAName,
    teamBName: input.teamBName ?? current.teamBName,
    teamAPlayerIds: input.teamAPlayerIds ?? current.teamAPlayerIds,
    teamBPlayerIds: input.teamBPlayerIds ?? current.teamBPlayerIds,
    benchPlayerIds: input.benchPlayerIds ?? current.benchPlayerIds,
    playerStats: input.playerStats ?? current.playerStats,
    mvpPlayerId:
      input.mvpPlayerId === null
        ? undefined
        : input.mvpPlayerId ?? current.mvpPlayerId,
    completedAt:
      nextStatus === 'completed' && !current.completedAt ? now : current.completedAt,
  };

  const games = [...session.games];
  games[gameIdx] = updatedGame;

  const updatedSession: SessionRecord = {
    ...session,
    games,
    participants: recalculateParticipantGamesPlayed(session.participants, games),
    updatedAt: now,
  };

  await repo.saveSession(updatedSession);
  return updatedSession;
}

export async function finalizeSession(
  sessionId: string,
  options: { sessionMvpPlayerId?: string; notes?: string } = {}
): Promise<{ session: SessionRecord; leaderboard: PlayerProfile[] }> {
  const repo = getRepository();
  const session = await repo.getSessionById(sessionId);
  if (!session) {
    throw new AppError(404, 'Session not found.', 'SESSION_NOT_FOUND');
  }
  if (session.status === 'completed') {
    throw new AppError(400, 'Session has already been finalized.', 'ALREADY_COMPLETED');
  }

  const now = new Date().toISOString();

  // Mark any still-live games as completed so their scores count
  const finalizedGames: SessionGame[] = session.games.map((g) =>
    g.status === 'live'
      ? { ...g, status: 'completed', completedAt: g.completedAt ?? now }
      : g
  );

  const draftSession: SessionRecord = {
    ...session,
    games: finalizedGames,
  };

  const suggestedMvp = getSuggestedSessionMvp(draftSession);
  const chosenSessionMvpId =
    options.sessionMvpPlayerId ?? session.sessionMvpPlayerId ?? suggestedMvp?.playerId;

  const completedSession: SessionRecord = {
    ...draftSession,
    status: 'completed',
    sessionMvpPlayerId: chosenSessionMvpId,
    notes: options.notes ?? session.notes,
    participants: recalculateParticipantGamesPlayed(session.participants, finalizedGames),
    updatedAt: now,
    completedAt: now,
  };

  // Compute deltas and commit to all-time player profiles
  const deltas = computeSessionPlayerDeltas(completedSession);
  const existingPlayers = await repo.listPlayers();
  const playerMap = new Map<string, PlayerProfile>(
    existingPlayers.map((p) => [p.id, p])
  );

  const updatedProfiles: PlayerProfile[] = [];

  for (const [playerId, delta] of deltas.entries()) {
    const existing = playerMap.get(playerId);
    if (!existing) continue;

    // Only increment sessionsPlayed if the player was active or played at least 1 game
    const playedInSession = delta.gamesPlayed > 0;
    const nextPoints = existing.points + delta.points;
    const nextGoals = existing.goals + delta.goals;
    const nextAssists = existing.assists + delta.assists;
    const nextGameMvps = existing.gameMvps + delta.gameMvps;
    const nextSessionMvps = existing.sessionMvps + delta.sessionMvps;

    const updated: PlayerProfile = {
      ...existing,
      gamesPlayed: existing.gamesPlayed + delta.gamesPlayed,
      sessionsPlayed: existing.sessionsPlayed + (playedInSession ? 1 : 0),
      wins: existing.wins + delta.wins,
      draws: existing.draws + delta.draws,
      losses: existing.losses + delta.losses,
      points: nextPoints,
      goals: nextGoals,
      assists: nextAssists,
      gameMvps: nextGameMvps,
      sessionMvps: nextSessionMvps,
      performanceIndex: computePerformanceIndex({
        points: nextPoints,
        goals: nextGoals,
        assists: nextAssists,
        gameMvps: nextGameMvps,
        sessionMvps: nextSessionMvps,
      }),
      updatedAt: now,
    };

    updatedProfiles.push(updated);
  }

  await repo.savePlayersBatch(updatedProfiles);
  await repo.saveSession(completedSession);
  await repo.setActiveSessionId(null);

  const leaderboard = await repo.listPlayers();
  return {
    session: completedSession,
    leaderboard,
  };
}

export async function updatePlayerProfile(
  playerId: string,
  input: { name?: string; skill?: SkillLevel; preferredPosition?: PositionLine }
): Promise<PlayerProfile> {
  const repo = getRepository();
  const existing = await repo.getPlayerById(playerId);
  if (!existing) {
    throw new AppError(404, 'Player not found.', 'PLAYER_NOT_FOUND');
  }

  const nextName = input.name?.trim() || existing.name;
  const updated: PlayerProfile = {
    ...existing,
    name: nextName,
    normalizedName: normalizePlayerName(nextName),
    skill: input.skill ?? existing.skill,
    preferredPosition: input.preferredPosition ?? existing.preferredPosition,
    updatedAt: new Date().toISOString(),
  };

  await repo.savePlayer(updated);
  return updated;
}
