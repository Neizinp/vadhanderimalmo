# Vad händer i Malmö?

A Swedish-language event guide for discovering upcoming events around Malmö.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite (by default, http://localhost:5173).

## Checks

```sh
npm run build
npm run lint
```

The event list currently contains sample events and images. Replace the sample data in `src/EventGuide.tsx` with a live event source before publishing as a current guide. Saved events are stored in the browser's local storage.
