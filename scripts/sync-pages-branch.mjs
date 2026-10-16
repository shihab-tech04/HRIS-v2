import { cp, copyFile, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = path.join(projectRoot, 'dist');
const builtAppHtml = path.join(distDirectory, 'app.html');
const builtIndexHtml = path.join(distDirectory, 'index.html');
const builtAssets = path.join(distDirectory, 'assets');
const branchAssets = path.join(projectRoot, 'assets');

// Vite builds app.html as the source template. GitHub Pages can also publish
// the repository root directly, so keep that root entry point and its assets
// synchronized with the same production bundle.
await rm(builtIndexHtml, { force: true });
await rename(builtAppHtml, builtIndexHtml);
await copyFile(builtIndexHtml, path.join(projectRoot, 'index.html'));
await rm(branchAssets, { recursive: true, force: true });
await mkdir(branchAssets, { recursive: true });
await cp(builtAssets, branchAssets, { recursive: true });
await writeFile(path.join(projectRoot, '.nojekyll'), '');
