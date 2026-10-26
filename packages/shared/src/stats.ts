import { PlayerProfile, SessionGame, SessionRecord } from './types.js';

export interface PlayerSessionDelta {
  playerId: string;
  name: string;
  normalizedName: string;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goals: number;
  assists: number;
  gameMvps: number;
  sessionMvps: number;
}

export function computePerformanceIndex(stats: {
  points: number;
  goals: number;
  assists: number;
  gameMvps: number;
  sessionMvps: number;
}): number {
  return Number(
    (
      stats.points * 3 +
      stats.goals * 2 +
      stats.assists * 1.5 +
      stats.gameMvps * 4 +
      stats.sessionMvps * 8
    ).toFixed(1)
  );
}

export function computeSessionPlayerDeltas(
  session: SessionRecord
): Map<string, PlayerSessionDelta> {
  const deltas = new Map<string, PlayerSessionDelta>();

  for (const participant of session.participants) {
    deltas.set(participant.playerId, {
      playerId: participant.playerId,
      name: participant.name,
      normalizedName: participant.normalizedName,
      gamesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      points: 0,
      goals: 0,
      assists: 0,
      gameMvps: 0,
      sessionMvps: session.sessionMvpPlayerId === participant.playerId ? 1 : 0,
    });
  }

  for (const game of session.games) {
    if (game.status !== 'completed') {
      continue;
    }

    const isTeamAWin = game.scoreA > game.scoreB;
    const isTeamBWin = game.scoreB > game.scoreA;
    const isDraw = game.scoreA === game.scoreB;

    const recordGameForPlayer = (playerId: string, onTeamA: boolean) => {
      let delta = deltas.get(playerId);
      if (!delta) {
        delta = {
          playerId,
          name: playerId,
          normalizedName: playerId,
          gamesPlayed: 0,
          wins: 0,
          draws: 0,
          losses: 0,
          points: 0,
          goals: 0,
          assists: 0,
          gameMvps: 0,
          sessionMvps: session.sessionMvpPlayerId === playerId ? 1 : 0,
        };
        deltas.set(playerId, delta);
      }

      delta.gamesPlayed += 1;
      if (isDraw) {
        delta.draws += 1;
        delta.points += 1;
      } else if ((onTeamA && isTeamAWin) || (!onTeamA && isTeamBWin)) {
        delta.wins += 1;
        delta.points += 3;
      } else {
        delta.losses += 1;
      }

      const individual = game.playerStats?.[playerId];
      if (individual) {
        delta.goals += individual.goals ?? 0;
        delta.assists += individual.assists ?? 0;
      }

      if (game.mvpPlayerId === playerId) {
        delta.gameMvps += 1;
      }
    };

    for (const id of game.teamAPlayerIds) {
      recordGameForPlayer(id, true);
    }
    for (const id of game.teamBPlayerIds) {
      recordGameForPlayer(id, false);
    }
  }

  return deltas;
}

export function rankPlayersForLeaderboard(players: PlayerProfile[]): PlayerProfile[] {
  return [...players].sort((a, b) => {
    if (b.performanceIndex !== a.performanceIndex) {
      return b.performanceIndex - a.performanceIndex;
    }
    if (b.points !== a.points) {
      return b.points - a.points;
    }
    const aMvps = a.sessionMvps * 2 + a.gameMvps;
    const bMvps = b.sessionMvps * 2 + b.gameMvps;
    if (bMvps !== aMvps) {
      return bMvps - aMvps;
    }
    if (b.goals !== a.goals) {
      return b.goals - a.goals;
    }
    if (b.wins !== a.wins) {
      return b.wins - a.wins;
    }
    return a.name.localeCompare(b.name);
  });
}

export function getSuggestedSessionMvp(
  session: SessionRecord
): { playerId: string; name: string; score: number } | null {
  const completedGames: SessionGame[] = session.games.filter((g) => g.status === 'completed');
  if (completedGames.length === 0) return null;

  const deltas = computeSessionPlayerDeltas(session);
  let best: { playerId: string; name: string; score: number } | null = null;

  for (const delta of deltas.values()) {
    if (delta.gamesPlayed === 0) continue;
    const score = computePerformanceIndex({
      points: delta.points,
      goals: delta.goals,
      assists: delta.assists,
      gameMvps: delta.gameMvps,
      sessionMvps: 0,
    });
    if (!best || score > best.score) {
      best = {
        playerId: delta.playerId,
        name: delta.name,
        score,
      };
    }
  }

  return best;
}
