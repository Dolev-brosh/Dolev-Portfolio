import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdir, rm, copyFile } from 'fs/promises';
import esbuild from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const srcDir = join(root, 'src');
const distDir = join(root, 'dist');

async function run() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  await esbuild.build({
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
    logLevel: 'info',
  });

  await esbuild.build({
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
    logLevel: 'info',
  });

  await copyFile(join(root, 'manifest.json'), join(distDir, 'manifest.json'));
  await copyFile(join(srcDir, 'ui.html'), join(distDir, 'ui.html'));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
