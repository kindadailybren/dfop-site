import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseParticipantsCsv,
  findFuzzyMatches,
  generateBalancedTeams,
  computeSessionPlayerDeltas,
  generateSampleCsv,
  SessionParticipant,
  SessionRecord,
  PlayerProfile,
} from './index.js';

describe('@dfop/shared', () => {
  it('parses valid DFOP sheet CSV with Payment, numbered names, Interm/Adv/Messi, and compound positions', () => {
    const csv = generateSampleCsv();
    const res = parseParticipantsCsv(csv);
    assert.equal(res.errors.length, 0);
    assert.equal(res.rows.length, 24);
    assert.equal(res.rows[0].name, 'Geolina, Jeffren John');
    assert.equal(res.rows[0].skill, 'Intermediate');
    assert.equal(res.rows[0].preferredPosition, 'DEF');
    // Row 15: Medina, Breindel Obtial (Messi -> Advanced, GK/Attack/Defense -> GK)
    assert.equal(res.rows[14].name, 'Medina, Breindel Obtial');
    assert.equal(res.rows[14].skill, 'Advanced');
    assert.equal(res.rows[14].preferredPosition, 'GK');
  });

  it('parses vertical multi-line Google Sheets copy-paste format and ignores empty numbered slots', () => {
    const rawSheetPaste = `
Payment
Name
Position
Experience
Games played
/
1. Geolina, Jeffren John
Defense
Interm

/
2. Lalong, Zainne Nazar
Attack/Defense
Beginner

15. Medina, Breindel Obtial
GK/Attack/Defense
Messi

25.

26.
`;
    const res = parseParticipantsCsv(rawSheetPaste);
    assert.equal(res.errors.length, 0);
    assert.equal(res.rows.length, 3);
    assert.equal(res.rows[0].name, 'Geolina, Jeffren John');
    assert.equal(res.rows[0].skill, 'Intermediate');
    assert.equal(res.rows[0].preferredPosition, 'DEF');
    assert.equal(res.rows[1].name, 'Lalong, Zainne Nazar');
    assert.equal(res.rows[1].preferredPosition, 'MID');
    assert.equal(res.rows[2].name, 'Medina, Breindel Obtial');
    assert.equal(res.rows[2].skill, 'Advanced');
    assert.equal(res.rows[2].preferredPosition, 'GK');
  });

  it('detects fuzzy matches against existing players', () => {
    const existing: PlayerProfile[] = [
      {
        id: 'p1',
        name: 'Marcus Vance',
        normalizedName: 'marcus vance',
        skill: 'Advanced',
        preferredPosition: 'MID',
        gamesPlayed: 10,
        sessionsPlayed: 3,
        wins: 6,
        draws: 2,
        losses: 2,
        points: 20,
        goals: 5,
        assists: 4,
        gameMvps: 2,
        sessionMvps: 1,
        performanceIndex: 92,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    ];

    const parsed = parseParticipantsCsv('Name,Skill,Preferred Position\nMarkus Vance,Advanced,MID');
    const matches = findFuzzyMatches(parsed.rows, existing);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].exactNormalized, false);
    assert.equal(matches[0].matchedPlayerId, 'p1');
    assert.equal(matches[0].distance, 1);
  });

  it('prioritizes players with fewer games played and balances skill across 7-aside teams', () => {
    const parsed = parseParticipantsCsv(generateSampleCsv());
    const participants: SessionParticipant[] = parsed.rows.map((r, i) => ({
      playerId: `p-${i + 1}`,
      name: r.name,
      normalizedName: r.name.toLowerCase(),
      skill: r.skill,
      preferredPosition: r.preferredPosition,
      active: true,
      sessionGamesPlayed: i < 2 ? 2 : 0, // First 2 players have already played 2 games
    }));

    const result = generateBalancedTeams({
      format: '7-aside',
      participants,
      games: [],
      seed: 42,
    });

    assert.equal(result.teamA.length, 7);
    assert.equal(result.teamB.length, 7);
    assert.equal(result.bench.length, 10);

    // The 2 players with 2 games played should be on the bench
    const benchIds = result.bench.map((b) => b.playerId);
    assert.ok(benchIds.includes('p-1'));
    assert.ok(benchIds.includes('p-2'));

    // Skill difference between Team A and Team B should be minimal (<= 1)
    assert.ok(
      Math.abs(result.metrics.teamASkillTotal - result.metrics.teamBSkillTotal) <= 1
    );
  });

  it('respects locked Team A and Team B overrides even if player has more games played', () => {
    const parsed = parseParticipantsCsv(generateSampleCsv());
    const participants: SessionParticipant[] = parsed.rows.map((r, i) => ({
      playerId: `p-${i + 1}`,
      name: r.name,
      normalizedName: r.name.toLowerCase(),
      skill: r.skill,
      preferredPosition: r.preferredPosition,
      active: true,
      sessionGamesPlayed: i === 0 ? 5 : 0,
    }));

    const result = generateBalancedTeams({
      format: '7-aside',
      participants,
      games: [],
      lockedTeamAIds: ['p-1'],
      lockedTeamBIds: ['p-3'],
      seed: 99,
    });

    assert.ok(result.teamA.some((p) => p.playerId === 'p-1'));
    assert.ok(result.teamB.some((p) => p.playerId === 'p-3'));
  });

  it('computes session player deltas accurately for completed games', () => {
    const session: SessionRecord = {
      id: 'sess-1',
      title: 'Tuesday Night Lights',
      date: '2026-10-26',
      location: 'Pitch 1',
      defaultFormat: '7-aside',
      status: 'active',
      sessionMvpPlayerId: 'p-1',
      createdAt: '2026-10-26T10:00:00Z',
      updatedAt: '2026-10-26T12:00:00Z',
      participants: [
        {
          playerId: 'p-1',
          name: 'Marcus Vance',
          normalizedName: 'marcus vance',
          skill: 'Advanced',
          preferredPosition: 'MID',
          active: true,
          sessionGamesPlayed: 1,
        },
        {
          playerId: 'p-2',
          name: 'Liam OConnor',
          normalizedName: 'liam oconnor',
          skill: 'Intermediate',
          preferredPosition: 'DEF',
          active: true,
          sessionGamesPlayed: 1,
        },
      ],
      games: [
        {
          id: 'g-1',
          gameNumber: 1,
          format: '7-aside',
          status: 'completed',
          teamAName: 'Bibs',
          teamBName: 'Colors',
          teamAPlayerIds: ['p-1'],
          teamBPlayerIds: ['p-2'],
          benchPlayerIds: [],
          scoreA: 3,
          scoreB: 1,
          playerStats: {
            'p-1': { goals: 2, assists: 1 },
            'p-2': { goals: 1, assists: 0 },
          },
          mvpPlayerId: 'p-1',
          startedAt: '2026-10-26T10:15:00Z',
          completedAt: '2026-10-26T10:35:00Z',
        },
      ],
    };

    const deltas = computeSessionPlayerDeltas(session);
    const p1 = deltas.get('p-1')!;
    const p2 = deltas.get('p-2')!;

    assert.equal(p1.gamesPlayed, 1);
    assert.equal(p1.wins, 1);
    assert.equal(p1.points, 3);
    assert.equal(p1.goals, 2);
    assert.equal(p1.assists, 1);
    assert.equal(p1.gameMvps, 1);
    assert.equal(p1.sessionMvps, 1);

    assert.equal(p2.gamesPlayed, 1);
    assert.equal(p2.losses, 1);
    assert.equal(p2.points, 0);
    assert.equal(p2.goals, 1);
  });
});
