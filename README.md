# Letterquake

Letterquake is a fast-paced React word puzzle where you drag across adjacent letters to form words, trigger clears, and watch the board collapse into chain reactions.

## What It Is

The game is built around a 5x5 letter grid. Valid words clear tiles, gravity pulls the board downward, and refills can create bonus cascades automatically. The goal is to keep finding strong words while taking advantage of combos and special tiles.

## How To Play

1. Drag across adjacent letters to build a word.
2. Release to submit the selection.
3. If the word is valid, the selected tiles clear.
4. Tiles above fall into empty spaces.
5. New tiles refill from the top.
6. Any new horizontal or vertical words formed by gravity clear automatically as combo chains.

Rules:

- Words must be at least 3 letters long.
- Each tile can only be used once per selection.
- Paths must stay connected through adjacent cells, including diagonals.
- Invalid selections flash and reset without scoring.

## Special Tiles

- `Gold`: adds a score bonus when included in a valid word.
- `Cracked`: needs two word hits before it fully breaks.
- `Anchor`: blocks gravity and forces other tiles to fall around it.

## Stack

- React 19
- TypeScript
- Vite
- Vitest

## Development

Install dependencies:

```bash
npm ci
```

Start the dev server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

Preview the production build locally:

```bash
npm run preview
```

Run tests:

```bash
npm test
```

Run linting:

```bash
npm run lint
```

## Project Scripts

- `npm run dev`: start Vite in development mode
- `npm run build`: type-check and create a production build
- `npm run preview`: serve the production build locally
- `npm run test`: run the Vitest suite once
- `npm run test:watch`: run tests in watch mode
- `npm run lint`: run ESLint
- `npm run generate:dictionary`: regenerate the dictionary data source

## GitHub Pages Deployment

This repo includes a GitHub Actions workflow at [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) that deploys the app to GitHub Pages on every push to `main`.

The Vite config reads `VITE_BASE`, so the workflow can build the app with the correct repository subpath for Pages hosting.

## Repo Structure

- [`src/App.tsx`](src/App.tsx): main game UI and animation orchestration
- [`src/game/engine.ts`](src/game/engine.ts): board generation, word resolution, gravity, and scoring
- [`src/game/tileRegistry.ts`](src/game/tileRegistry.ts): special tile definitions and behavior
- [`src/game/constants.ts`](src/game/constants.ts): gameplay and animation tuning constants

## Status

Letterquake is a small self-contained game project built for fast iteration on gameplay feel, scoring, and animation polish.
