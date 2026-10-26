import {
  FORMAT_TEAM_SIZE,
  POSITION_ORDER,
  PositionLine,
  SKILL_WEIGHTS,
  SessionGame,
  SessionParticipant,
  TeamBalanceMetrics,
  TeamGenerationInput,
  TeamGenerationResult,
} from './types.js';

function createPositionCounter(): Record<PositionLine, number> {
  return {
    GK: 0,
    DEF: 0,
    MID: 0,
    FWD: 0,
    ANY: 0,
  };
}

export function computeTeamMetrics(
  teamA: SessionParticipant[],
  teamB: SessionParticipant[],
  bench: SessionParticipant[]
): TeamBalanceMetrics {
  const teamAPositions = createPositionCounter();
  const teamBPositions = createPositionCounter();

  let teamASkillTotal = 0;
  let teamBSkillTotal = 0;

  for (const p of teamA) {
    teamASkillTotal += SKILL_WEIGHTS[p.skill];
    teamAPositions[p.preferredPosition] = (teamAPositions[p.preferredPosition] ?? 0) + 1;
  }

  for (const p of teamB) {
    teamBSkillTotal += SKILL_WEIGHTS[p.skill];
    teamBPositions[p.preferredPosition] = (teamBPositions[p.preferredPosition] ?? 0) + 1;
  }

  return {
    teamACount: teamA.length,
    teamBCount: teamB.length,
    benchCount: bench.length,
    teamASkillTotal,
    teamBSkillTotal,
    teamAAvgSkill: teamA.length > 0 ? Number((teamASkillTotal / teamA.length).toFixed(2)) : 0,
    teamBAvgSkill: teamB.length > 0 ? Number((teamBSkillTotal / teamB.length).toFixed(2)) : 0,
    teamAPositions,
    teamBPositions,
  };
}

function computeImbalanceCost(
  teamA: SessionParticipant[],
  teamB: SessionParticipant[]
): number {
  let skillA = 0;
  let skillB = 0;
  const posA = createPositionCounter();
  const posB = createPositionCounter();

  for (const p of teamA) {
    skillA += SKILL_WEIGHTS[p.skill];
    posA[p.preferredPosition]++;
  }
  for (const p of teamB) {
    skillB += SKILL_WEIGHTS[p.skill];
    posB[p.preferredPosition]++;
  }

  const skillDiff = Math.abs(skillA - skillB);
  const gkDiff = Math.abs(posA.GK - posB.GK);
  const defDiff = Math.abs(posA.DEF - posB.DEF);
  const midDiff = Math.abs(posA.MID - posB.MID);
  const fwdDiff = Math.abs(posA.FWD - posB.FWD);

  // Prioritize GK balance (so one team doesn't get 2 keepers and the other 0),
  // total skill balance, and positional line balance.
  return (
    skillDiff * 12 +
    gkDiff * 18 +
    defDiff * 6 +
    midDiff * 6 +
    fwdDiff * 6
  );
}

function seededNoise(playerId: string, seed: number): number {
  let hash = seed | 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = Math.imul(hash ^ playerId.charCodeAt(i), 2654435761);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function getPlayedLastGameSet(games: SessionGame[]): Set<string> {
  if (games.length === 0) return new Set();
  const sorted = [...games].sort((a, b) => b.gameNumber - a.gameNumber);
  const last = sorted[0];
  return new Set([...last.teamAPlayerIds, ...last.teamBPlayerIds]);
}

export function recalculateParticipantGamesPlayed(
  participants: SessionParticipant[],
  games: SessionGame[]
): SessionParticipant[] {
  const counts = new Map<string, number>();
  for (const game of games) {
    if (game.status === 'live' || game.status === 'completed') {
      for (const id of game.teamAPlayerIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      for (const id of game.teamBPlayerIds) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
  }

  return participants.map((p) => ({
    ...p,
    sessionGamesPlayed: counts.get(p.playerId) ?? 0,
  }));
}

export function generateBalancedTeams(input: TeamGenerationInput): TeamGenerationResult {
  const targetTeamSize = FORMAT_TEAM_SIZE[input.format];
  const maxOnPitch = targetTeamSize * 2;
  const seed = input.seed ?? Date.now();

  const updatedParticipants =
    input.games.length > 0
      ? recalculateParticipantGamesPlayed(input.participants, input.games)
      : input.participants;
  const activeParticipants = updatedParticipants.filter((p) => p.active);

  const lockedASet = new Set(input.lockedTeamAIds ?? []);
  const lockedBSet = new Set(input.lockedTeamBIds ?? []);
  const lockedBenchSet = new Set(input.lockedBenchIds ?? []);

  // Ensure mutual exclusivity of locks
  for (const id of lockedASet) {
    lockedBSet.delete(id);
    lockedBenchSet.delete(id);
  }
  for (const id of lockedBSet) {
    lockedBenchSet.delete(id);
  }

  const lockedA: SessionParticipant[] = [];
  const lockedB: SessionParticipant[] = [];
  const lockedBench: SessionParticipant[] = [];
  const pool: SessionParticipant[] = [];

  for (const p of activeParticipants) {
    if (lockedASet.has(p.playerId) && lockedA.length < targetTeamSize) {
      lockedA.push(p);
    } else if (lockedBSet.has(p.playerId) && lockedB.length < targetTeamSize) {
      lockedB.push(p);
    } else if (lockedBenchSet.has(p.playerId)) {
      lockedBench.push(p);
    } else {
      pool.push(p);
    }
  }

  const playedLastGame = getPlayedLastGameSet(input.games);

  // Step 1: Select who plays on the pitch vs sits on the bench.
  // Priority:
  // 1) Fewest games played in the current session (so everyone rotates in fairly)
  // 2) If tied, prefer players who sat out the most recent game
  // 3) Ensure at least 1-2 GKs are included if available among tied candidates
  // 4) Seeded tie-breaker for variety across runs
  const spotsRemaining = Math.max(0, maxOnPitch - lockedA.length - lockedB.length);

  const sortedPoolForPitch = [...pool].sort((a, b) => {
    if (a.sessionGamesPlayed !== b.sessionGamesPlayed) {
      return a.sessionGamesPlayed - b.sessionGamesPlayed;
    }
    const aPlayedLast = playedLastGame.has(a.playerId) ? 1 : 0;
    const bPlayedLast = playedLastGame.has(b.playerId) ? 1 : 0;
    if (aPlayedLast !== bPlayedLast) {
      return aPlayedLast - bPlayedLast;
    }
    return seededNoise(a.playerId, seed) - seededNoise(b.playerId, seed);
  });

  const selectedFromPool = sortedPoolForPitch.slice(0, spotsRemaining);
  const benchFromPool = sortedPoolForPitch.slice(spotsRemaining);

  const totalPitchCount = lockedA.length + lockedB.length + selectedFromPool.length;
  const maxTeamASize = Math.min(targetTeamSize, Math.ceil(totalPitchCount / 2));
  const maxTeamBSize = Math.min(targetTeamSize, totalPitchCount - maxTeamASize);

  const teamA: SessionParticipant[] = [...lockedA];
  const teamB: SessionParticipant[] = [...lockedB];

  // Step 2: Order selected unlocked players by position group (GK -> DEF -> MID -> FWD -> ANY)
  // and descending skill within each group for serpentine/greedy placement.
  const orderedUnlocked = [...selectedFromPool].sort((a, b) => {
    const posDiff =
      POSITION_ORDER.indexOf(a.preferredPosition) -
      POSITION_ORDER.indexOf(b.preferredPosition);
    if (posDiff !== 0) return posDiff;
    const skillDiff = SKILL_WEIGHTS[b.skill] - SKILL_WEIGHTS[a.skill];
    if (skillDiff !== 0) return skillDiff;
    return seededNoise(a.playerId, seed + 7) - seededNoise(b.playerId, seed + 7);
  });

  for (const candidate of orderedUnlocked) {
    const canJoinA = teamA.length < maxTeamASize;
    const canJoinB = teamB.length < maxTeamBSize;

    if (canJoinA && !canJoinB) {
      teamA.push(candidate);
    } else if (canJoinB && !canJoinA) {
      teamB.push(candidate);
    } else {
      // Compare cost if placed on Team A vs Team B, with preference for smaller team size
      const sizePenaltyA = teamA.length > teamB.length ? 8 : 0;
      const sizePenaltyB = teamB.length > teamA.length ? 8 : 0;
      const costIfA = computeImbalanceCost([...teamA, candidate], teamB) + sizePenaltyA;
      const costIfB = computeImbalanceCost(teamA, [...teamB, candidate]) + sizePenaltyB;

      if (costIfA < costIfB) {
        teamA.push(candidate);
      } else if (costIfB < costIfA) {
        teamB.push(candidate);
      } else if (teamA.length <= teamB.length) {
        teamA.push(candidate);
      } else {
        teamB.push(candidate);
      }
    }
  }

  // Step 3: Local search / 1-for-1 swap optimization among unlocked players on Team A & Team B
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 50) {
    improved = false;
    iterations++;
    let currentCost = computeImbalanceCost(teamA, teamB);

    for (let i = 0; i < teamA.length; i++) {
      if (lockedASet.has(teamA[i].playerId)) continue;
      for (let j = 0; j < teamB.length; j++) {
        if (lockedBSet.has(teamB[j].playerId)) continue;

        const nextA = [...teamA];
        const nextB = [...teamB];
        const temp = nextA[i];
        nextA[i] = nextB[j];
        nextB[j] = temp;

        const nextCost = computeImbalanceCost(nextA, nextB);
        if (nextCost < currentCost) {
          teamA[i] = nextA[i];
          teamB[j] = nextB[j];
          currentCost = nextCost;
          improved = true;
        }
      }
    }
  }

  // Sort rosters cleanly by position line (GK -> DEF -> MID -> FWD -> ANY)
  const sortRoster = (list: SessionParticipant[]) =>
    [...list].sort((a, b) => {
      const posDiff =
        POSITION_ORDER.indexOf(a.preferredPosition) -
        POSITION_ORDER.indexOf(b.preferredPosition);
      if (posDiff !== 0) return posDiff;
      return SKILL_WEIGHTS[b.skill] - SKILL_WEIGHTS[a.skill];
    });

  const finalTeamA = sortRoster(teamA);
  const finalTeamB = sortRoster(teamB);
  const finalBench = [...lockedBench, ...benchFromPool].sort(
    (a, b) => a.sessionGamesPlayed - b.sessionGamesPlayed
  );

  return {
    format: input.format,
    targetTeamSize,
    teamA: finalTeamA,
    teamB: finalTeamB,
    bench: finalBench,
    metrics: computeTeamMetrics(finalTeamA, finalTeamB, finalBench),
  };
}
