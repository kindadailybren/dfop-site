import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(statusCode: number, message: string, code = 'APP_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

const DEFAULT_HEADERS: Record<string, string> = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': process.env.ALLOWED_ORIGIN ?? '*',
  'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'access-control-allow-headers': 'Content-Type,Authorization',
};

export function jsonResponse(
  statusCode: number,
  body: unknown
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(body),
  };
}

export function errorResponse(err: unknown): APIGatewayProxyStructuredResultV2 {
  if (err instanceof AppError) {
    return jsonResponse(err.statusCode, {
      error: err.message,
      code: err.code,
    });
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  console.error('Unhandled API error:', err);
  return jsonResponse(500, {
    error: message,
    code: 'INTERNAL_ERROR',
  });
}
