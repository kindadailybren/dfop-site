import http from 'node:http';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from './handlers/apiHandler.js';

const PORT = Number(process.env.PORT ?? 4000);

const server = http.createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks).toString('utf-8');
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  const event: APIGatewayProxyEventV2 = {
    version: '2.0',
    routeKey: `${req.method ?? 'GET'} ${url.pathname}`,
    rawPath: url.pathname,
    rawQueryString: url.searchParams.toString(),
    headers: Object.fromEntries(
      Object.entries(req.headers).map(([k, v]) => [
        k,
        Array.isArray(v) ? v.join(',') : v ?? '',
      ])
    ),
    requestContext: {
      accountId: 'local',
      apiId: 'local',
      domainName: 'localhost',
      domainPrefix: 'localhost',
      http: {
        method: req.method ?? 'GET',
        path: url.pathname,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: req.headers['user-agent'] ?? 'local',
      },
      requestId: 'local-req',
      routeKey: `${req.method ?? 'GET'} ${url.pathname}`,
      stage: '$default',
      time: new Date().toISOString(),
      timeEpoch: Date.now(),
    },
    body: rawBody || undefined,
    isBase64Encoded: false,
  };

  const result = await handler(event);
  res.writeHead(result.statusCode ?? 200, result.headers as Record<string, string>);
  res.end(result.body ?? '');
});

server.listen(PORT, () => {
  console.log(`DFOP Local API Server listening on http://localhost:${PORT}`);
});
