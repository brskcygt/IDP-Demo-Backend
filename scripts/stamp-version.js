#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const [version, ...directories] = process.argv.slice(2);
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(version || '') || directories.length === 0) {
  throw new Error('Usage: stamp-version.js <version> <directory> [...]');
}
for (const directory of directories) {
  const output = path.resolve(directory, 'version.json');
  fs.writeFileSync(output, `${JSON.stringify({ version }, null, 2)}\n`);
  process.stdout.write(`stamped ${output}\n`);
}
