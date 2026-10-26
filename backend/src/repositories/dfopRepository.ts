import {
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  PlayerProfile,
  SessionRecord,
  computePerformanceIndex,
  normalizePlayerName,
  rankPlayersForLeaderboard,
} from '@dfop/shared';
import { docClient, getTableName } from '../lib/db.js';

export interface DfopRepository {
  getActiveSessionId(): Promise<string | null>;
  setActiveSessionId(sessionId: string | null): Promise<void>;
  getSessionById(sessionId: string): Promise<SessionRecord | null>;
  saveSession(session: SessionRecord): Promise<void>;
  listSessions(limit?: number): Promise<SessionRecord[]>;
  listPlayers(): Promise<PlayerProfile[]>;
  getPlayerById(playerId: string): Promise<PlayerProfile | null>;
  savePlayer(player: PlayerProfile): Promise<void>;
  savePlayersBatch(players: PlayerProfile[]): Promise<void>;
}

export class DynamoDfopRepository implements DfopRepository {
  private readonly tableName = getTableName();

  async getActiveSessionId(): Promise<string | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: 'STATE#CURRENT',
          SK: 'ACTIVE_SESSION',
        },
        ConsistentRead: true,
      })
    );
    return (res.Item?.activeSessionId as string | null | undefined) ?? null;
  }

  async setActiveSessionId(sessionId: string | null): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: 'STATE#CURRENT',
          SK: 'ACTIVE_SESSION',
          activeSessionId: sessionId,
          updatedAt: new Date().toISOString(),
        },
      })
    );
  }

  async getSessionById(sessionId: string): Promise<SessionRecord | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `SESSION#${sessionId}`,
          SK: 'METADATA',
        },
        ConsistentRead: true,
      })
    );
    if (!res.Item) return null;
    const { PK, SK, GSI1PK, GSI1SK, entityType, ...session } = res.Item;
    return session as SessionRecord;
  }

  async saveSession(session: SessionRecord): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `SESSION#${session.id}`,
          SK: 'METADATA',
          GSI1PK: 'SESSIONS',
          GSI1SK: `${session.date}#${session.createdAt}#${session.id}`,
          entityType: 'SESSION',
          ...session,
        },
      })
    );
  }

  async listSessions(limit = 20): Promise<SessionRecord[]> {
    const res = await docClient.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: {
          ':pk': 'SESSIONS',
        },
        ScanIndexForward: false,
        Limit: limit,
      })
    );
    return (res.Items ?? []).map((item) => {
      const { PK, SK, GSI1PK, GSI1SK, entityType, ...session } = item;
      return session as SessionRecord;
    });
  }

  async listPlayers(): Promise<PlayerProfile[]> {
    const items: PlayerProfile[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const res = await docClient.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: 'GSI1',
          KeyConditionExpression: 'GSI1PK = :pk',
          ExpressionAttributeValues: {
            ':pk': 'PLAYERS',
          },
          ExclusiveStartKey: exclusiveStartKey,
        })
      );

      for (const item of res.Items ?? []) {
        const { PK, SK, GSI1PK, GSI1SK, entityType, ...player } = item;
        items.push(player as PlayerProfile);
      }
      exclusiveStartKey = res.LastEvaluatedKey as Record<string, unknown> | undefined;
    } while (exclusiveStartKey);

    return rankPlayersForLeaderboard(items);
  }

  async getPlayerById(playerId: string): Promise<PlayerProfile | null> {
    const res = await docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          PK: `PLAYER#${playerId}`,
          SK: 'PROFILE',
        },
      })
    );
    if (!res.Item) return null;
    const { PK, SK, GSI1PK, GSI1SK, entityType, ...player } = res.Item;
    return player as PlayerProfile;
  }

  async savePlayer(player: PlayerProfile): Promise<void> {
    await docClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          PK: `PLAYER#${player.id}`,
          SK: 'PROFILE',
          GSI1PK: 'PLAYERS',
          GSI1SK: `NAME#${player.normalizedName}#${player.id}`,
          entityType: 'PLAYER',
          ...player,
        },
      })
    );
  }

  async savePlayersBatch(players: PlayerProfile[]): Promise<void> {
    for (const player of players) {
      await this.savePlayer(player);
    }
  }
}

export class InMemoryDfopRepository implements DfopRepository {
  private activeSessionId: string | null = null;
  private sessions = new Map<string, SessionRecord>();
  private players = new Map<string, PlayerProfile>();

  constructor(seedDemoData = true) {
    if (seedDemoData) {
      this.seedInitialData();
    }
  }

  private seedInitialData(): void {
    const now = '2026-10-20T14:00:00.000Z';
    const initialRoster: Array<{
      id: string;
      name: string;
      skill: PlayerProfile['skill'];
      pos: PlayerProfile['preferredPosition'];
      gp: number;
      sp: number;
      w: number;
      d: number;
      l: number;
      g: number;
      a: number;
      gMvp: number;
      sMvp: number;
    }> = [
      { id: 'plr-1', name: 'Marco Santos', skill: 'Advanced', pos: 'MID', gp: 12, sp: 4, w: 8, d: 2, l: 2, g: 9, a: 7, gMvp: 3, sMvp: 1 },
      { id: 'plr-2', name: 'Paolo Reyes', skill: 'Advanced', pos: 'FWD', gp: 12, sp: 4, w: 7, d: 3, l: 2, g: 11, a: 4, gMvp: 2, sMvp: 1 },
      { id: 'plr-3', name: 'enzo Villanueva', skill: 'Intermediate', pos: 'DEF', gp: 11, sp: 4, w: 7, d: 2, l: 2, g: 2, a: 5, gMvp: 1, sMvp: 0 },
      { id: 'plr-4', name: 'Carlo Mendoza', skill: 'Intermediate', pos: 'GK', gp: 12, sp: 4, w: 6, d: 3, l: 3, g: 0, a: 2, gMvp: 2, sMvp: 1 },
      { id: 'plr-5', name: 'Anton Bautista', skill: 'Advanced', pos: 'DEF', gp: 10, sp: 3, w: 6, d: 2, l: 2, g: 3, a: 4, gMvp: 1, sMvp: 0 },
      { id: 'plr-6', name: 'Miguel Aquino', skill: 'Intermediate', pos: 'MID', gp: 10, sp: 3, w: 5, d: 3, l: 2, g: 4, a: 6, gMvp: 1, sMvp: 0 },
      { id: 'plr-7', name: 'Rafa Del Rosario', skill: 'Advanced', pos: 'FWD', gp: 9, sp: 3, w: 5, d: 2, l: 2, g: 8, a: 3, gMvp: 2, sMvp: 0 },
      { id: 'plr-8', name: 'Nico Soriano', skill: 'Beginner', pos: 'DEF', gp: 9, sp: 3, w: 4, d: 3, l: 2, g: 1, a: 2, gMvp: 0, sMvp: 0 },
      { id: 'plr-9', name: 'Javi Tan', skill: 'Intermediate', pos: 'GK', gp: 9, sp: 3, w: 5, d: 1, l: 3, g: 0, a: 1, gMvp: 1, sMvp: 0 },
      { id: 'plr-10', name: 'Vince Lim', skill: 'Intermediate', pos: 'MID', gp: 8, sp: 3, w: 4, d: 2, l: 2, g: 3, a: 3, gMvp: 0, sMvp: 0 },
      { id: 'plr-11', name: 'Gabby Limjoco', skill: 'Beginner', pos: 'FWD', gp: 8, sp: 3, w: 3, d: 2, l: 3, g: 4, a: 1, gMvp: 0, sMvp: 0 },
      { id: 'plr-12', name: 'Kiko Morales', skill: 'Intermediate', pos: 'DEF', gp: 8, sp: 3, w: 4, d: 1, l: 3, g: 1, a: 2, gMvp: 0, sMvp: 0 },
      { id: 'plr-13', name: 'Dani Alcaraz', skill: 'Advanced', pos: 'MID', gp: 7, sp: 2, w: 4, d: 2, l: 1, g: 5, a: 4, gMvp: 1, sMvp: 0 },
      { id: 'plr-14', name: 'Tomas Garcia', skill: 'Beginner', pos: 'MID', gp: 7, sp: 2, w: 3, d: 1, l: 3, g: 1, a: 2, gMvp: 0, sMvp: 0 },
      { id: 'plr-15', name: 'Luis Navarro', skill: 'Intermediate', pos: 'FWD', gp: 6, sp: 2, w: 3, d: 1, l: 2, g: 4, a: 2, gMvp: 0, sMvp: 0 },
      { id: 'plr-16', name: 'Basti Pascual', skill: 'Beginner', pos: 'DEF', gp: 6, sp: 2, w: 2, d: 2, l: 2, g: 0, a: 1, gMvp: 0, sMvp: 0 },
    ];

    for (const r of initialRoster) {
      const points = r.w * 3 + r.d;
      const displayName = r.name.charAt(0).toUpperCase() + r.name.slice(1);
      const profile: PlayerProfile = {
        id: r.id,
        name: displayName,
        normalizedName: normalizePlayerName(displayName),
        skill: r.skill,
        preferredPosition: r.pos,
        gamesPlayed: r.gp,
        sessionsPlayed: r.sp,
        wins: r.w,
        draws: r.d,
        losses: r.l,
        points,
        goals: r.g,
        assists: r.a,
        gameMvps: r.gMvp,
        sessionMvps: r.sMvp,
        performanceIndex: computePerformanceIndex({
          points,
          goals: r.g,
          assists: r.a,
          gameMvps: r.gMvp,
          sessionMvps: r.sMvp,
        }),
        createdAt: now,
        updatedAt: now,
      };
      this.players.set(profile.id, profile);
    }

    const activeParticipants = Array.from(this.players.values()).map((p, idx) => ({
      playerId: p.id,
      name: p.name,
      normalizedName: p.normalizedName,
      skill: p.skill,
      preferredPosition: p.preferredPosition,
      active: true,
      sessionGamesPlayed: idx < 14 ? 1 : 0,
    }));

    const liveSession: SessionRecord = {
      id: 'session-davao-open-05',
      title: 'Davao Open Play #05 — Floodlit 7s',
      date: '2026-10-26',
      location: 'Azuela Cove Pitch, Davao City',
      defaultFormat: '7-aside',
      status: 'active',
      participants: activeParticipants,
      games: [
        {
          id: 'game-1',
          gameNumber: 1,
          format: '7-aside',
          status: 'completed',
          teamAName: 'DFOP Royal Blue',
          teamBName: 'DFOP Crest White',
          teamAPlayerIds: ['plr-4', 'plr-3', 'plr-8', 'plr-1', 'plr-10', 'plr-2', 'plr-11'],
          teamBPlayerIds: ['plr-9', 'plr-5', 'plr-12', 'plr-6', 'plr-13', 'plr-7', 'plr-14'],
          benchPlayerIds: ['plr-15', 'plr-16'],
          scoreA: 2,
          scoreB: 1,
          playerStats: {
            'plr-2': { goals: 1, assists: 1 },
            'plr-1': { goals: 1, assists: 0 },
            'plr-7': { goals: 1, assists: 0 },
            'plr-13': { goals: 0, assists: 1 },
          },
          mvpPlayerId: 'plr-1',
          startedAt: '2026-10-26T19:00:00.000Z',
          completedAt: '2026-10-26T19:22:00.000Z',
        },
        {
          id: 'game-2',
          gameNumber: 2,
          format: '7-aside',
          status: 'live',
          teamAName: 'DFOP Royal Blue',
          teamBName: 'DFOP Crest White',
          teamAPlayerIds: ['plr-4', 'plr-5', 'plr-16', 'plr-1', 'plr-6', 'plr-15', 'plr-7'],
          teamBPlayerIds: ['plr-9', 'plr-3', 'plr-12', 'plr-13', 'plr-14', 'plr-2', 'plr-11'],
          benchPlayerIds: ['plr-8', 'plr-10'],
          scoreA: 1,
          scoreB: 1,
          playerStats: {
            'plr-15': { goals: 1, assists: 0 },
            'plr-6': { goals: 0, assists: 1 },
            'plr-2': { goals: 1, assists: 0 },
          },
          startedAt: '2026-10-26T19:26:00.000Z',
        },
      ],
      createdAt: '2026-10-26T18:45:00.000Z',
      updatedAt: '2026-10-26T19:35:00.000Z',
    };

    const completedArchive: SessionRecord = {
      id: 'session-davao-open-04',
      title: 'Davao Open Play #04 — Midweek 9-a-side',
      date: '2026-10-19',
      location: 'Tionko Football Grounds, Davao City',
      defaultFormat: '9-aside',
      status: 'completed',
      participants: activeParticipants.map((p) => ({ ...p, sessionGamesPlayed: 2 })),
      sessionMvpPlayerId: 'plr-2',
      games: [
        {
          id: 'g-04-1',
          gameNumber: 1,
          format: '9-aside',
          status: 'completed',
          teamAName: 'DFOP Royal Blue',
          teamBName: 'DFOP Crest White',
          teamAPlayerIds: ['plr-4', 'plr-3', 'plr-8', 'plr-1', 'plr-10', 'plr-2', 'plr-11', 'plr-15'],
          teamBPlayerIds: ['plr-9', 'plr-5', 'plr-12', 'plr-6', 'plr-13', 'plr-7', 'plr-14', 'plr-16'],
          benchPlayerIds: [],
          scoreA: 3,
          scoreB: 2,
          playerStats: {
            'plr-2': { goals: 2, assists: 1 },
            'plr-1': { goals: 1, assists: 1 },
            'plr-7': { goals: 2, assists: 0 },
          },
          mvpPlayerId: 'plr-2',
          startedAt: '2026-10-19T19:00:00.000Z',
          completedAt: '2026-10-19T19:30:00.000Z',
        },
      ],
      createdAt: '2026-10-19T18:50:00.000Z',
      updatedAt: '2026-10-19T20:45:00.000Z',
      completedAt: '2026-10-19T20:45:00.000Z',
    };

    this.sessions.set(liveSession.id, liveSession);
    this.sessions.set(completedArchive.id, completedArchive);
    this.activeSessionId = liveSession.id;
  }

  async getActiveSessionId(): Promise<string | null> {
    return this.activeSessionId;
  }

  async setActiveSessionId(sessionId: string | null): Promise<void> {
    this.activeSessionId = sessionId;
  }

  async getSessionById(sessionId: string): Promise<SessionRecord | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async saveSession(session: SessionRecord): Promise<void> {
    this.sessions.set(session.id, structuredClone(session));
  }

  async listSessions(limit = 20): Promise<SessionRecord[]> {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async listPlayers(): Promise<PlayerProfile[]> {
    return rankPlayersForLeaderboard(Array.from(this.players.values()));
  }

  async getPlayerById(playerId: string): Promise<PlayerProfile | null> {
    return this.players.get(playerId) ?? null;
  }

  async savePlayer(player: PlayerProfile): Promise<void> {
    this.players.set(player.id, structuredClone(player));
  }

  async savePlayersBatch(players: PlayerProfile[]): Promise<void> {
    for (const p of players) {
      this.players.set(p.id, structuredClone(p));
    }
  }
}

let activeRepository: DfopRepository | null = null;

export function getRepository(): DfopRepository {
  if (!activeRepository) {
    if (process.env.USE_IN_MEMORY_DB === 'true') {
      activeRepository = new InMemoryDfopRepository(true);
    } else {
      activeRepository = new DynamoDfopRepository();
    }
  }
  return activeRepository;
}

export function setRepositoryForTesting(repo: DfopRepository): void {
  activeRepository = repo;
}
