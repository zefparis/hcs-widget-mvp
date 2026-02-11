/**
 * HCS-U7 Widget v3 — Build script
 * Bundles src/widget-v3/index.ts → public/widget/v3/hcs-widget.js
 * Uses esbuild for fast, single-file IIFE output.
 *
 * Usage: node scripts/build-widget.mjs [--watch]
 */

import { build, context } from 'esbuild';
import { readFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8'));
const isWatch = process.argv.includes('--watch');

const ENTRY = resolve(ROOT, 'src/widget-v3/index.ts');
const OUT_DIR = resolve(ROOT, 'public/widget/v3');
const OUT_FILE = resolve(OUT_DIR, 'hcs-widget.js');

// Ensure output directory exists
mkdirSync(OUT_DIR, { recursive: true });

const banner = `/**
 * HCS-U7 Widget v3.0.0 — Enterprise Adaptive Engine
 * Copyright (c) 2025-2026 Benjamin BARRERE / IA SOLUTION
 * Patents Pending FR2514274 | FR2514546
 * Built: ${new Date().toISOString()}
 * DO NOT EDIT — generated from src/widget-v3/
 */`;

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  entryPoints: [ENTRY],
  outfile: OUT_FILE,
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2017'],
  sourcemap: false,
  legalComments: 'none',
  banner: { js: banner },
  define: {
    'HCS_WIDGET_VERSION': JSON.stringify('3.0.0'),
  },
  drop: ['debugger'],
  treeShaking: true,
  logLevel: 'info',
};

async function main() {
  if (isWatch) {
    console.log('[build-widget] Watching for changes...');
    const ctx = await context(buildOptions);
    await ctx.watch();
  } else {
    const result = await build(buildOptions);
    if (result.errors.length === 0) {
      console.log('[build-widget] ✅ Built → public/widget/v3/hcs-widget.js');
    }
  }
}

main().catch((err) => {
  console.error('[build-widget] ❌ Build failed:', err);
  process.exit(1);
});
