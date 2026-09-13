'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const ROOT = __dirname;

function loadEnv(filePath = path.join(ROOT, '.env')) {
  if (!fs.existsSync(filePath)) return;
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || process.env[key] !== undefined) continue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function readVersion(filePath = path.join(ROOT, 'version.json')) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8')).version;
    return typeof value === 'string' && value ? value : 'unknown';
  } catch {
    return 'unknown';
  }
}

function sendJson(response, statusCode, payload, corsOrigin) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'access-control-allow-origin': corsOrigin,
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
  });
  response.end(body);
}

function createServer(options = {}) {
  const version = options.version || readVersion();
  const message = options.message || process.env.DEMO_MESSAGE || 'IDP artifact deployment is working.';
  const corsOrigin = options.corsOrigin || process.env.CORS_ORIGIN || '*';
  const startedAt = new Date().toISOString();

  return http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-origin': corsOrigin,
      });
      return response.end();
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return sendJson(response, 200, { status: 'ok', service: 'idp-demo-backend', version }, corsOrigin);
    }
    if (request.method === 'GET' && url.pathname === '/api/info') {
      return sendJson(response, 200, {
        message,
        service: 'idp-demo-backend',
        version,
        startedAt,
        serverTime: new Date().toISOString(),
      }, corsOrigin);
    }
    return sendJson(response, 404, { status: 'not_found', version }, corsOrigin);
  });
}

function start() {
  loadEnv();
  const host = process.env.HOST || '0.0.0.0';
  const port = Number.parseInt(process.env.PORT || '8085', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  const server = createServer();
  server.listen(port, host, () => process.stdout.write(`idp-demo-backend ${readVersion()} listening on http://${host}:${port}\n`));
  const shutdown = (signal) => server.close(() => {
    process.stdout.write(`idp-demo-backend stopped by ${signal}\n`);
    process.exit(0);
  });
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  return server;
}

if (require.main === module) start();

module.exports = { createServer, loadEnv, readVersion, start };
