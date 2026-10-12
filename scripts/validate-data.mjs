// Checks data/techniques.json before it ships: the tree shape, unique ids and field types.
// Run with: node scripts/validate-data.mjs
import { readFileSync } from 'node:fs';

const FILE = new URL('../data/techniques.json', import.meta.url);
const CHILD_KIND = { root: 'pillar', pillar: 'family', family: 'group', group: 'technique' };
const OPTIONAL_TEXT = ['full', 'desc', 'origin', 'flag'];

const errors = [];
const seen = new Set();
const counts = { root: 0, pillar: 0, family: 0, group: 0, technique: 0 };

let tree;
try {
  tree = JSON.parse(readFileSync(FILE, 'utf8'));
} catch (e) {
  console.error(`data/techniques.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

function check(n, expectedKind, path) {
  const where = `${path} (${n && n.id ? n.id : 'no id'})`;
  if (!n || typeof n !== 'object' || Array.isArray(n)) { errors.push(`${path}: not an object`); return; }

  if (typeof n.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(n.id)) errors.push(`${where}: id must use only letters, digits, - and _`);
  else if (seen.has(n.id)) errors.push(`${where}: duplicate id`);
  else seen.add(n.id);

  if (typeof n.name !== 'string' || !n.name.trim()) errors.push(`${where}: missing name`);
  if (n.kind !== expectedKind) errors.push(`${where}: kind is "${n.kind}", expected "${expectedKind}"`);
  else counts[n.kind] += 1;

  for (const k of OPTIONAL_TEXT) {
    if (n[k] !== undefined && (typeof n[k] !== 'string' || !n[k].trim())) errors.push(`${where}: ${k} must be non-empty text`);
  }
  if (expectedKind === 'pillar' && !/^#[0-9A-Fa-f]{6}$/.test(n.color || '')) errors.push(`${where}: pillars need a color like #2F5BD3`);

  const childKind = CHILD_KIND[expectedKind];
  if (!childKind) {
    if (n.children !== undefined) errors.push(`${where}: techniques cannot have children`);
    return;
  }
  if (!Array.isArray(n.children) || n.children.length === 0) {
    errors.push(`${where}: a ${expectedKind} needs at least one ${childKind}`);
    return;
  }
  n.children.forEach((c, i) => check(c, childKind, `${path} > ${i + 1}`));
}

check(tree, 'root', 'root');
if (tree && tree.id !== 'root') errors.push('the top node must have id "root"');

if (errors.length) {
  console.error(`data/techniques.json has ${errors.length} problem${errors.length === 1 ? '' : 's'}:`);
  errors.forEach((e) => console.error('  - ' + e));
  process.exit(1);
}
console.log(`data/techniques.json is valid: ${counts.technique} techniques, ${counts.pillar} pillars, ${counts.family} families, ${counts.group} groups.`);
