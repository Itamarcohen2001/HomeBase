import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Static export emits one HTML file per known route, but the dynamic route
// /transaction/[id] has no file for concrete ids. Hosts serve 404.html for
// unmatched paths, so making it a copy of the app shell lets the client
// router take over instead of showing a hosting error page.
const dist = join(process.cwd(), 'dist');
const index = join(dist, 'index.html');

if (!existsSync(index)) {
  console.error('dist/index.html not found - run `expo export --platform web` first.');
  process.exit(1);
}

copyFileSync(index, join(dist, '404.html'));
console.log('postexport-web: wrote dist/404.html');
