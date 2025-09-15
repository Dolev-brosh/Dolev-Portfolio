import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir, copyFile } from 'fs/promises';
import { watch } from 'fs';
import esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');

async function copyStatic() {
  await copyFile(join(root, 'manifest.json'), join(distDir, 'manifest.json'));
  await copyFile(join(srcDir, 'ui.html'), join(distDir, 'ui.html'));
}

async function run() {
  await mkdir(distDir, { recursive: true });
  await copyStatic();

  const uiContext = await esbuild.context({
    entryPoints: [join(srcDir, 'ui.ts')],
    outfile: join(distDir, 'ui.js'),
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2019',
    sourcemap: true,
    loader: {
      '.css': 'css',
    },
  });
  await uiContext.watch();

  const codeContext = await esbuild.context({
    entryPoints: [join(srcDir, 'code.ts')],
    outfile: join(distDir, 'code.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2019',
    sourcemap: true,
    loader: {
      '.html': 'text',
    },
  });
  await codeContext.watch();

  watch(join(root, 'manifest.json'), copyStatic);
  watch(join(srcDir, 'ui.html'), copyStatic);

  console.log('Watching for changes... Press Ctrl+C to stop.');
  process.stdin.resume();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
