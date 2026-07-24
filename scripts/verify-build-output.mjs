import { statSync } from 'node:fs';

const workerBundle = 'dist/dash2/index.js';

let stat;
try {
  stat = statSync(workerBundle);
} catch {
  console.error(`Build verification failed: expected Worker bundle not found at ${workerBundle}.`);
  console.error(
    'This usually means wrangler.jsonc is missing or misconfigured, causing the Cloudflare Vite plugin to skip the Worker build silently.'
  );
  process.exit(1);
}

if (!stat.isFile() || stat.size === 0) {
  console.error(`Build verification failed: ${workerBundle} exists but is empty or not a file.`);
  process.exit(1);
}

console.log(`Build verification passed: ${workerBundle} (${stat.size} bytes).`);
