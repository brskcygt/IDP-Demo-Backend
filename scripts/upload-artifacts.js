#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const options = { allowHttp: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--allow-http') { options.allowHttp = true; continue; }
    const key = { '--project-id': 'projectId', '--version': 'version', '--manifest': 'manifestPath', '--base-url': 'baseUrl' }[argv[index]];
    if (!key || !argv[index + 1]) throw new Error(`Invalid argument: ${argv[index]}`);
    options[key] = argv[++index];
  }
  return options;
}

function baseUrl(value, allowHttp) {
  const parsed = new URL(value);
  const local = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('IDP_URL must be a clean http(s) URL.');
  }
  if (parsed.protocol === 'http:' && !local && !allowHttp) throw new Error('Private-network HTTP requires --allow-http.');
  return parsed.toString().replace(/\/$/, '');
}

async function digest(filePath) {
  const stat = await fs.promises.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1) throw new Error(`Invalid artifact: ${filePath}`);
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  return { size: stat.size, sha256: hash.digest('hex') };
}

async function errorText(response, token) {
  const text = (await response.text()).slice(0, 2048).replace(/\s+/g, ' ');
  return `${response.status} ${text}`.replaceAll(token, '[REDACTED]');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const token = process.env.IDP_ARTIFACT_UPLOAD_TOKEN || '';
  if (token.length < 32 || /\s/.test(token)) throw new Error('IDP_ARTIFACT_UPLOAD_TOKEN is missing or invalid.');
  if (!options.projectId || !/^[A-Za-z0-9._-]+$/.test(options.version || '')) throw new Error('Project ID or version is invalid.');
  const origin = baseUrl(options.baseUrl || process.env.IDP_URL, options.allowHttp);
  const manifestPath = path.resolve(options.manifestPath);
  const manifest = JSON.parse(await fs.promises.readFile(manifestPath, 'utf8'));
  if (manifest.schema !== 1 || manifest.version !== options.version || !Array.isArray(manifest.artifacts) || !manifest.artifacts.length) {
    throw new Error('Manifest does not match the requested release.');
  }
  const releasePath = `${encodeURIComponent(options.projectId)}/${encodeURIComponent(options.version)}`;
  for (const artifact of manifest.artifacts) {
    const filePath = path.join(path.dirname(manifestPath), artifact.file);
    const actual = await digest(filePath);
    if (actual.size !== artifact.size || actual.sha256 !== artifact.sha256) throw new Error(`Artifact mismatch: ${artifact.file}`);
    const response = await fetch(`${origin}/api/artifact-uploads/${releasePath}/${encodeURIComponent(artifact.file)}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/gzip', 'content-length': String(actual.size), 'x-artifact-sha256': actual.sha256 },
      body: fs.createReadStream(filePath), duplex: 'half', redirect: 'error', signal: AbortSignal.timeout(1_800_000),
    });
    if (!response.ok) throw new Error(`Upload failed for ${artifact.file}: ${await errorText(response, token)}`);
    process.stdout.write(`uploaded ${artifact.file}\n`);
  }
  const response = await fetch(`${origin}/api/artifact-uploads/${releasePath}/finalize`, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(manifest), redirect: 'error', signal: AbortSignal.timeout(1_800_000),
  });
  if (!response.ok) throw new Error(`Finalize failed: ${await errorText(response, token)}`);
  process.stdout.write(`finalized ${manifest.project}@${manifest.version}\n`);
}

main().catch((error) => { process.stderr.write(`upload-artifacts: ${error.message}\n`); process.exitCode = 1; });
