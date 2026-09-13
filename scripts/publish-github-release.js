#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

async function checked(url, options, token) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 2048).replace(/\s+/g, ' ').replaceAll(token, '[REDACTED]');
    throw new Error(`${response.status}: ${detail}`);
  }
  return response;
}

async function main() {
  const versionIndex = process.argv.indexOf('--version');
  const directoryIndex = process.argv.indexOf('--directory');
  const version = process.argv[versionIndex + 1];
  const directory = path.resolve(process.argv[directoryIndex + 1]);
  const token = process.env.GITHUB_RELEASE_TOKEN || '';
  const repository = process.env.GITHUB_REPOSITORY || '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version || '') || !/^[\w.-]+\/[\w.-]+$/.test(repository) || token.length < 20) {
    throw new Error('Release version, repository or token is invalid.');
  }
  const headers = { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'idp-demo-release', 'x-github-api-version': '2022-11-28' };
  const api = `https://api.github.com/repos/${repository}`;
  const tag = `v${version}`;
  let releaseResponse = await fetch(`${api}/releases`, { method: 'POST', headers, body: JSON.stringify({ tag_name: tag, target_commitish: process.env.GITHUB_SHA, name: tag, body: `IDP demo artifacts for ${version}.`, prerelease: /test|alpha|beta|rc/i.test(version) }) });
  if (releaseResponse.status === 422) releaseResponse = await checked(`${api}/releases/tags/${encodeURIComponent(tag)}`, { headers }, token);
  else if (!releaseResponse.ok) throw new Error(`Release creation failed: ${releaseResponse.status} ${(await releaseResponse.text()).slice(0, 1000)}`);
  const release = await releaseResponse.json();
  const existing = new Set((release.assets || []).map((asset) => asset.name));
  const files = (await fs.promises.readdir(directory)).filter((name) => name.endsWith('.tar.gz') || name.endsWith('-manifest.json')).sort();
  for (const name of files) {
    if (existing.has(name)) continue;
    const filePath = path.join(directory, name);
    const stat = await fs.promises.stat(filePath);
    await checked(`${release.upload_url.split('{')[0]}?name=${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { ...headers, 'content-type': name.endsWith('.json') ? 'application/json' : 'application/gzip', 'content-length': String(stat.size) },
      body: fs.createReadStream(filePath), duplex: 'half', signal: AbortSignal.timeout(1_800_000),
    }, token);
    process.stdout.write(`published ${name}\n`);
  }
  process.stdout.write(`GitHub Release ready: ${release.html_url}\n`);
}

main().catch((error) => { process.stderr.write(`publish-github-release: ${error.message}\n`); process.exitCode = 1; });
