#!/usr/bin/env node
/**
 * Build gate: "it built" is NOT proof the types shipped (SDK_CONTRACT.md §4).
 * A production team once shipped 13 of 21 type modules silently missing from
 * dist/ because the declaration generator skipped .d.ts sources and a committed
 * dist/ masked the hole. This script makes the proof mechanical:
 *   1. every expected dist/ artifact exists;
 *   2. every public name is present in the emitted declarations.
 *
 * Runs as part of `npm run build`. Add new public names when you extend index.ts.
 */
import { existsSync, readFileSync } from 'node:fs';

const REQUIRED_FILES = [
  'dist/index.js',
  'dist/index.cjs',
  'dist/index.d.ts',
  'dist/index.d.cts',
  'dist/types/index.js',
  'dist/types/index.cjs',
  'dist/types/index.d.ts',
  'dist/types/index.d.cts',
];

// Names that consumers import — keep in sync with src/index.ts and src/types/index.ts.
const PUBLIC_SURFACE = {
  'dist/index.d.ts': [
    'createSdk',
    'SDKOptions',
    'ApiError',
    'AuthClient',
    'HttpClient',
    'HttpTransport',
    'createMemoryContext',
    'SDKContext',
    'SDKLogger',
    'TokenPair',
  ],
  'dist/types/index.d.ts': ['HttpMethod', 'TokenPair', 'ApiErrorBody'],
};

let failed = false;

for (const file of REQUIRED_FILES) {
  if (!existsSync(file)) {
    console.error(`✗ missing build artifact: ${file}`);
    failed = true;
  }
}

if (!failed) {
  for (const [file, names] of Object.entries(PUBLIC_SURFACE)) {
    const dts = readFileSync(file, 'utf8');
    for (const name of names) {
      if (!dts.includes(name)) {
        console.error(`✗ ${file}: public name "${name}" not found in emitted declarations`);
        failed = true;
      }
    }
  }
}

if (failed) {
  console.error('\ndist verification FAILED — do not tag this build.');
  process.exit(1);
}
console.log(`✓ dist verification OK (${REQUIRED_FILES.length} artifacts, declarations contain the public surface)`);
