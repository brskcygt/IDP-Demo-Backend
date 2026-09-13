'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createServer } = require('../server');

test('health and API expose the deployed version', async (t) => {
  const server = createServer({ version: '9.8.7-test', message: 'hello' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();

  const health = await fetch(`http://127.0.0.1:${address.port}/health`).then((response) => response.json());
  assert.deepEqual(health, { status: 'ok', service: 'idp-demo-backend', version: '9.8.7-test' });

  const info = await fetch(`http://127.0.0.1:${address.port}/api/info`).then((response) => response.json());
  assert.equal(info.message, 'hello');
  assert.equal(info.version, '9.8.7-test');
  assert.match(info.serverTime, /^\d{4}-\d{2}-\d{2}T/);
});

test('unknown route returns JSON 404', async (t) => {
  const server = createServer({ version: 'dev' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/missing`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).status, 'not_found');
});
