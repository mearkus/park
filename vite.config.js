import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Emits sw.js with a precache list of every built file so the game works offline.
function serviceWorker() {
  let outDir = 'dist';
  return {
    name: 'wild-horizons-sw',
    apply: 'build',
    configResolved(config) { outDir = config.build.outDir; },
    writeBundle() {
      const files = [];
      const walk = (dir) => {
        for (const f of fs.readdirSync(dir)) {
          const p = path.join(dir, f);
          if (fs.statSync(p).isDirectory()) walk(p);
          else if (f !== 'sw.js') files.push(path.relative(outDir, p).split(path.sep).join('/'));
        }
      };
      walk(outDir);
      const version = Date.now().toString(36);
      const template = fs.readFileSync('src/sw-template.js', 'utf8');
      const sw = template
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(['./', ...files.filter((f) => f !== 'index.html'), 'index.html']));
      fs.writeFileSync(path.join(outDir, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
  plugins: [serviceWorker()],
});
