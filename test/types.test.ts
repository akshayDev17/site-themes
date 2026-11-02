import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

// Compiled to build/test/, so the package root is two levels up.
const PACKAGE_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..');

// A consumer app that imports every typed entry point the package exports.
const CONSUMER = `
import { THEMES, bootScript, STORAGE_KEY } from 'site-themes';
import { BOOT_CONFIG } from 'site-themes/boot';
import { defineThemePicker } from 'site-themes/picker';
import { ThemePicker } from 'site-themes/react';
import { BASE_THEME_ID } from 'site-themes/themes';

export const used: unknown[] = [THEMES, bootScript, STORAGE_KEY, BOOT_CONFIG, defineThemePicker, ThemePicker, BASE_THEME_ID];
`;

function typeCheckConsumer(compilerOptions: ts.CompilerOptions): string[] {
  const app = mkdtempSync(join(tmpdir(), 'site-themes-consumer-'));
  try {
    mkdirSync(join(app, 'node_modules'));
    symlinkSync(PACKAGE_ROOT, join(app, 'node_modules', 'site-themes'), 'dir');
    writeFileSync(join(app, 'package.json'), JSON.stringify({ name: 'consumer', type: 'module' }));
    const entry = join(app, 'consumer.ts');
    writeFileSync(entry, CONSUMER);
    const options: ts.CompilerOptions = { strict: true, noEmit: true, skipLibCheck: true, types: [], target: ts.ScriptTarget.ES2022, lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'], ...compilerOptions };
    const program = ts.createProgram([entry], options);
    return ts.getPreEmitDiagnostics(program).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  } finally {
    rmSync(app, { recursive: true, force: true });
  }
}

const RESOLUTIONS: [string, ts.CompilerOptions][] = [
  ['node10', { module: ts.ModuleKind.CommonJS, moduleResolution: ts.ModuleResolutionKind.Node10 }],
  ['bundler', { module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler }],
  ['nodenext', { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext }],
];

for (const [name, options] of RESOLUTIONS) {
  test(`a consumer type-checks every exported subpath under moduleResolution ${name}`, () => {
    assert.deepEqual(typeCheckConsumer(options), []);
  });
}
