#!/usr/bin/env node
// Filter home.json down to AppHeader + KYC banner subtree.
// Source: docs/figma-home-redesign/fidelity/figma-dump/home.json
// Output: docs/figma-app-header-master/fidelity/figma-dump/app-header.json

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '../../figma-home-redesign/fidelity/figma-dump/home.json');
const DST = resolve(__dirname, 'figma-dump/app-header.json');

const home = JSON.parse(readFileSync(SRC, 'utf-8'));

// Keep nodes whose figmaId starts with one of these prefixes.
// Header: 619:8197 + all I619:8197;* instance descendants.
// KYC banner row: 619:8199 wrapper + 692:5294 compliance pill + 619:8201/8202/8203/8204 (查看详情 + arrow).
const KEEP_PREFIXES = [
  '619:8197',
  'I619:8197;',
  '619:8199',
  '692:5294',
  'I692:5294;',
  '619:8201',
  '619:8202',
  '619:8203',
  '619:8204',
];

function keep(id) {
  return KEEP_PREFIXES.some((p) => id === p || id.startsWith(p + (p.endsWith(';') ? '' : ';')) || id.startsWith(p));
}

// Drop figma sub-nodes the impl intentionally renders as a raster/font-glyph:
// - I619:8197;514:5532;460:3407..3428 — 22 wordmark vector paths/groups under
//   the SPX PAY accessory frame; impl ships assets/brand/spx-logo-wordmark.png
//   tagged with the parent accessory id (I619:8197;514:5532). The parent's
//   x/y/w/h tokens are the real proof of position; the per-glyph vectors are
//   waived under the documented "Whole-app icon system vs per-icon SVG" policy.
// - 619:8204 — the 0.75-stroke chevron Vector inside the KYC banner 查看详情
//   arrow frame; impl renders Feather 'chevron-right' as a font-glyph (same
//   app-wide icon policy). The parent frame 619:8203 still carries the box.
const DROP = (id) =>
  /^I619:8197;514:5532;460:3(4(0[7-9]|1\d|2[0-8]))$/.test(id) || id === '619:8204';

const nodes = home.nodes.filter((n) => keep(n.figmaId) && !DROP(n.figmaId));

// Synthetic frame: AppHeader starts y=66, banner row ends at y=137.
// Use 390-wide phone frame to keep coords comparable to home.
const out = {
  source: 'figma',
  frame: {
    id: 'app-header-master',
    name: 'AppHeader · brand + KYC banner (subset of 619:8194)',
    width: 390,
    height: 150,
    _note: 'Filtered from home.json — keeps only AppHeader instance 619:8197 + KYC compliance row (692:5294 + 619:8201/2/3/4). Coords are inherited (header at y=66, banner at y=111).',
  },
  nodes,
};

writeFileSync(DST, JSON.stringify(out, null, 2));
console.log(`Wrote ${DST} — ${nodes.length} nodes`);
