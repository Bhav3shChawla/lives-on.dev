import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { validateDefinition } from '../lib/validate-record.mjs';
const reserved = JSON.parse(await readFile('registry/reserved.json', 'utf8'));
const files = (await readdir('registry/domains')).filter(file => file.endsWith('.json'));
const owners = new Map();
for (const file of files) {
  const data = JSON.parse(await readFile(path.join('registry/domains', file), 'utf8'));
  validateDefinition(file.slice(0,-5), data, reserved);
  const root = file.slice(0,-5).split('.').at(-1), owner = data.owner.id || data.owner.username.toLowerCase();
  if (owners.has(root) && owners.get(root) !== owner) throw new Error('Nested name owner differs from its parent: ' + file);
  owners.set(root, owner);
}
console.log('Registry valid: ' + files.length + ' records checked.');
