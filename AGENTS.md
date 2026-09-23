# AGENTS.md

## Project boundaries

- Tab Suspender is a Manifest V3 Chrome extension. `manifest.json` points to `worker.js` (from `worker.ts`) for the background service worker, `inject.js` (from `inject.ts`) for the content script, and `popup.html` for the popup. Extension behavior lives in root `.ts` files and `modules/`; options UI lives in `fancy-settings/`.
- `backup-server/` is a separate Node/Firebase Hosting project for backup sync/recovery pages. `test/puppeteer/` is a separate browser integration-test project; neither is covered by the root Jest suite.
- Keep the independent `pnpm-lock.yaml` files in the root, `backup-server/`, and `test/puppeteer/` aligned with their respective manifests. Install dependencies separately in each directory when working there.

## Setup and commands

- Use Node 24 and pnpm 12 from `mise.toml` (root `package.json` specifies pnpm 12.5.1). Run `pnpm install` at the repository root.
- Root: `pnpm run format:check`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run typecheck:puppeteer`, `pnpm run test`, `pnpm run build`. Use `pnpm run format` to apply Biome formatting; `pnpm run watch` rebuilds on TypeScript changes.
- Before committing, run `pnpm run quality:check` at the root; it checks format, lint, both TypeScript projects, Jest, and the build. The build clears and recreates `build_dir/`; do not edit that generated directory.
- For a single unit test, run `pnpm exec jest --runInBand --runTestsByPath test/modules/TabManager.test.ts` from the root (substitute the relevant test path). Jest uses ts-jest/jsdom and excludes `test/puppeteer/`.
- For a browser test, build the extension first, then run a declared script from `test/puppeteer/`, such as `pnpm run test:basic-suspend-restore`. These tests use Puppeteer/Chrome, not Jest; the CI browser job uses Xvfb on Linux.

## Editing and safety

- Biome (`biome.json`) controls formatting and linting: tabs, single quotes in JS/TS, no trailing commas, 140-column width. Its exclusions include `lib/`, `uninstall-survey/`, `popup.css`, minified JS, lockfiles, and `build_dir/`; do not apply blanket formatting to these excluded paths.
- `backup-server/` deploy scripts publish Firebase Hosting; do not run `deploy`, `deploy:preview`, or `firebase:init` for routine validation. Changes to backup sync must keep the origin in `offscreenDocument.ts` and iframe URL in `offscreenDocument.html` consistent with the hosted recovery pages.
- `.github/workflows/CI.yml` uses Node 24, pnpm 12.5.1, frozen pnpm lockfile installs, and pnpm cache keys. Keep CI aligned with the root and Puppeteer package manifests when changing dependencies.
