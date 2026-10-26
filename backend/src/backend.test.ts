import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { generateSampleCsv } from '@dfop/shared';
import { handler } from './handlers/apiHandler.js';
import {
  InMemoryDfopRepository,
  setRepositoryForTesting,
} from './repositories/dfopRepository.js';

function createEvent(
  method: string,
  path: string,
  body?: unknown
): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: { 'content-type': 'application/json' },
    requestContext: {
      accountId: 'test',
      apiId: 'test',
      domainName: 'dfop.breindel.me',
      domainPrefix: 'dfop',
      http: {
        method,
        path,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'node-test',
      },
      requestId: 'req-1',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  };
}

describe('DFOP Backend API Handler', () => {
  beforeEach(() => {
    setRepositoryForTesting(new InMemoryDfopRepository(false));
  });

  it('creates a session from CSV, generates 7-aside teams, logs game results, and finalizes stats', async () => {
    // 1. Create session via CSV upload
    const csvText = generateSampleCsv();
    const createRes = await handler(
      createEvent('POST', '/api/admin/sessions', {
        title: 'Davao Open Play — Session 1',
        date: '2026-10-26',
        location: 'Azuela Cove Pitch',
        defaultFormat: '7-aside',
        csvText,
      })
    );
    assert.equal(createRes.statusCode, 201);
    const createdBody = JSON.parse(createRes.body!);
    const sessionId: string = createdBody.session.id;
    assert.equal(createdBody.session.participants.length, 16);

    // 2. Generate balanced 7-aside teams
    const genRes = await handler(
      createEvent('POST', `/api/admin/sessions/${sessionId}/generate-teams`, {
        format: '7-aside',
        seed: 101,
      })
    );
    assert.equal(genRes.statusCode, 200);
    const genBody = JSON.parse(genRes.body!);
    assert.equal(genBody.teamA.length, 7);
    assert.equal(genBody.teamB.length, 7);
    assert.equal(genBody.bench.length, 2);

    // 3. Create Game 1
    const teamAIds = genBody.teamA.map((p: { playerId: string }) => p.playerId);
    const teamBIds = genBody.teamB.map((p: { playerId: string }) => p.playerId);
    const gameRes = await handler(
      createEvent('POST', `/api/admin/sessions/${sessionId}/games`, {
        format: '7-aside',
        teamAName: 'DFOP Royal Blue',
        teamBName: 'DFOP Crest White',
        teamAPlayerIds: teamAIds,
        teamBPlayerIds: teamBIds,
      })
    );
    assert.equal(gameRes.statusCode, 201);
    const gameBody = JSON.parse(gameRes.body!);
    const gameId = gameBody.session.games[0].id;

    // 4. Update Game 1 score, goals, MVP, and mark completed
    const starPlayerId = teamAIds[0];
    const updateRes = await handler(
      createEvent(
        'PUT',
        `/api/admin/sessions/${sessionId}/games/${gameId}`,
        {
          scoreA: 3,
          scoreB: 1,
          status: 'completed',
          mvpPlayerId: starPlayerId,
          playerStats: {
            [starPlayerId]: { goals: 2, assists: 1 },
          },
        }
      )
    );
    assert.equal(updateRes.statusCode, 200);

    // 5. Generate teams for Game 2 -> the 2 players who sat on the bench in Game 1 MUST now be selected on the pitch
    const gen2Res = await handler(
      createEvent('POST', `/api/admin/sessions/${sessionId}/generate-teams`, {
        format: '7-aside',
        seed: 202,
      })
    );
    const gen2Body = JSON.parse(gen2Res.body!);
    const game2PitchIds = new Set([
      ...gen2Body.teamA.map((p: { playerId: string }) => p.playerId),
      ...gen2Body.teamB.map((p: { playerId: string }) => p.playerId),
    ]);
    for (const benchPlayer of genBody.bench) {
      assert.ok(
        game2PitchIds.has(benchPlayer.playerId),
        `Bench player ${benchPlayer.name} should rotate onto the pitch in Game 2`
      );
    }

    // 6. Finalize session and verify leaderboard persistence
    const finRes = await handler(
      createEvent('POST', `/api/admin/sessions/${sessionId}/finalize`, {
        sessionMvpPlayerId: starPlayerId,
      })
    );
    assert.equal(finRes.statusCode, 200);
    const finBody = JSON.parse(finRes.body!);
    assert.equal(finBody.session.status, 'completed');
    assert.equal(finBody.leaderboard[0].id, starPlayerId);
    assert.equal(finBody.leaderboard[0].wins, 1);
    assert.equal(finBody.leaderboard[0].points, 3);
    assert.equal(finBody.leaderboard[0].goals, 2);
    assert.equal(finBody.leaderboard[0].assists, 1);
    assert.equal(finBody.leaderboard[0].gameMvps, 1);
    assert.equal(finBody.leaderboard[0].sessionMvps, 1);
  });
});
