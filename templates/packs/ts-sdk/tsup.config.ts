import { defineConfig } from 'tsup';

/**
 * Two entries, matching the exports map:
 *   "."        → dist/index.{js,cjs,d.ts,d.cts}
 *   "./types"  → dist/types/index.{js,cjs,d.ts,d.cts}   (types-only subpath)
 *
 * All sources are plain .ts — never author .d.ts files in src/ (declaration
 * generators skip them silently; see docs-architecture/CONVENTIONS_TS.md §1).
 * scripts/verify-dist.mjs gates the build on the emitted declarations.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'types/index': 'src/types/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
});
