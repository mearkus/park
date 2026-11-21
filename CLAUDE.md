# Wild Horizons

3D national-park building game (three.js + Vite), shipped as a website (GitHub Pages)
and as Android/iOS apps (Capacitor).

## Commands
- Dev server: `npm run dev`
- Build web: `npm run build` (output in `dist/`)
- Build + copy into the native apps: `npm run cap:sync` — run after any web change,
  before opening or building the native projects
- Regenerate app icons/splash from `assets/`: `npm run cap:assets`
  (keep the `--android --ios` flags — without them it rewrites the web manifest and icons)

## Conventions
- Native behaviour goes through `src/native.js`; every function there must be a
  no-op on the web. Never import `@capacitor/*` plugin code into game modules.
- Anything saved to `localStorage` must also be passed to `persist()` so the apps
  keep a native backup. Keys use the `wild-horizons-` prefix.
- The service worker and install button are web-only (`!isNative`).
- Fonts are bundled (`@fontsource-variable/*`); don't add CDN links — the apps run offline.
- CI: `deploy.yml` (Pages), `android.yml` (debug APK), `ios.yml` (Simulator build);
  pushes to `main` publish both app builds to the `latest-build` pre-release.
