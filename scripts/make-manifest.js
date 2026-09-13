#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const [project, version, commit, ...specs] = process.argv.slice(2);
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(project || '') || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version || '')) {
  throw new Error('Usage: make-manifest.js <project> <version> <commit> component:os:file [...]');
}
const artifacts = specs.map((spec) => {
  const [component, os, ...fileParts] = spec.split(':');
  const filePath = fileParts.join(':');
  const data = fs.readFileSync(filePath);
  return {
    component,
    os,
    file: path.basename(filePath),
    size: data.length,
    sha256: crypto.createHash('sha256').update(data).digest('hex'),
  };
});
if (!artifacts.length) throw new Error('At least one artifact is required.');
const manifest = { schema: 1, project, version, commit: commit || 'unknown', createdAt: new Date().toISOString(), artifacts };
const output = `${project}-${version}-manifest.json`;
fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${output}\n`);
