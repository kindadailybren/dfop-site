import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { AppError, errorResponse, jsonResponse } from '../lib/response.js';
import { getRepository } from '../repositories/dfopRepository.js';
import {
  createGame,
  createSession,
  finalizeSession,
  generateTeamsForSession,
  getPublicState,
  previewCsvUpload,
  updateGame,
  updatePlayerProfile,
  updateSessionParticipants,
} from '../services/sessionService.js';

function parseBody<T>(event: APIGatewayProxyEventV2): T {
  if (!event.body) {
    throw new AppError(400, 'Request body is required.', 'MISSING_BODY');
  }
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    return JSON.parse(raw) as T;
  } catch {
    throw new AppError(400, 'Invalid JSON body.', 'INVALID_JSON');
  }
}

export async function handler(
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyStructuredResultV2> {
  try {
    const method = event.requestContext.http.method.toUpperCase();
    const rawPath = event.rawPath.replace(/\/+$/, '') || '/';

    if (method === 'OPTIONS') {
      return jsonResponse(200, { ok: true });
    }

    // -------------------------------------------------------------------------
    // Public Routes (Players & Spectators)
    // -------------------------------------------------------------------------
    if (method === 'GET' && rawPath === '/api/health') {
      return jsonResponse(200, {
        status: 'ok',
        service: 'dfop-backend',
        timestamp: new Date().toISOString(),
      });
    }

    if (method === 'GET' && rawPath === '/api/state') {
      const state = await getPublicState();
      return jsonResponse(200, state);
    }

    if (method === 'GET' && rawPath === '/api/players') {
      const players = await getRepository().listPlayers();
      return jsonResponse(200, { players });
    }

    if (method === 'GET' && rawPath === '/api/sessions') {
      const sessions = await getRepository().listSessions(30);
      return jsonResponse(200, { sessions });
    }

    const sessionDetailMatch = rawPath.match(/^\/api\/sessions\/([^/]+)$/);
    if (method === 'GET' && sessionDetailMatch) {
      const sessionId = decodeURIComponent(sessionDetailMatch[1]);
      const session = await getRepository().getSessionById(sessionId);
      if (!session) {
        throw new AppError(404, 'Session not found.', 'SESSION_NOT_FOUND');
      }
      return jsonResponse(200, { session });
    }

    // -------------------------------------------------------------------------
    // Admin Routes (Protected by Cognito JWT Authorizer on API Gateway)
    // -------------------------------------------------------------------------
    if (method === 'POST' && rawPath === '/api/admin/csv/preview') {
      const body = parseBody<{ csvText: string }>(event);
      const preview = await previewCsvUpload(body.csvText ?? '');
      return jsonResponse(200, preview);
    }

    if (method === 'POST' && rawPath === '/api/admin/sessions') {
      const body = parseBody<Parameters<typeof createSession>[0]>(event);
      const session = await createSession(body);
      return jsonResponse(201, { session });
    }

    const participantsMatch = rawPath.match(
      /^\/api\/admin\/sessions\/([^/]+)\/participants$/
    );
    if (method === 'PUT' && participantsMatch) {
      const sessionId = decodeURIComponent(participantsMatch[1]);
      const body = parseBody<Parameters<typeof updateSessionParticipants>[1]>(event);
      const session = await updateSessionParticipants(sessionId, body);
      return jsonResponse(200, { session });
    }

    const generateTeamsMatch = rawPath.match(
      /^\/api\/admin\/sessions\/([^/]+)\/generate-teams$/
    );
    if (method === 'POST' && generateTeamsMatch) {
      const sessionId = decodeURIComponent(generateTeamsMatch[1]);
      const body = parseBody<Parameters<typeof generateTeamsForSession>[1]>(event);
      const generated = await generateTeamsForSession(sessionId, body);
      return jsonResponse(200, generated);
    }

    const gamesCollectionMatch = rawPath.match(
      /^\/api\/admin\/sessions\/([^/]+)\/games$/
    );
    if (method === 'POST' && gamesCollectionMatch) {
      const sessionId = decodeURIComponent(gamesCollectionMatch[1]);
      const body = parseBody<Parameters<typeof createGame>[1]>(event);
      const session = await createGame(sessionId, body);
      return jsonResponse(201, { session });
    }

    const gameItemMatch = rawPath.match(
      /^\/api\/admin\/sessions\/([^/]+)\/games\/([^/]+)$/
    );
    if (method === 'PUT' && gameItemMatch) {
      const sessionId = decodeURIComponent(gameItemMatch[1]);
      const gameId = decodeURIComponent(gameItemMatch[2]);
      const body = parseBody<Parameters<typeof updateGame>[2]>(event);
      const session = await updateGame(sessionId, gameId, body);
      return jsonResponse(200, { session });
    }

    const finalizeMatch = rawPath.match(
      /^\/api\/admin\/sessions\/([^/]+)\/finalize$/
    );
    if (method === 'POST' && finalizeMatch) {
      const sessionId = decodeURIComponent(finalizeMatch[1]);
      const body = event.body
        ? parseBody<Parameters<typeof finalizeSession>[1]>(event)
        : {};
      const result = await finalizeSession(sessionId, body);
      return jsonResponse(200, result);
    }

    const playerEditMatch = rawPath.match(/^\/api\/admin\/players\/([^/]+)$/);
    if (method === 'PUT' && playerEditMatch) {
      const playerId = decodeURIComponent(playerEditMatch[1]);
      const body = parseBody<Parameters<typeof updatePlayerProfile>[1]>(event);
      const player = await updatePlayerProfile(playerId, body);
      return jsonResponse(200, { player });
    }

    throw new AppError(404, `Route not found: ${method} ${rawPath}`, 'NOT_FOUND');
  } catch (err) {
    return errorResponse(err);
  }
}
