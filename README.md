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

The event list is a small curated prototype dataset in `src/data/events.ts`. Each event includes its date, venue, category, source link, image URL, and verification date. The entries were checked against the linked organizer pages on 2026-10-27; this static dataset does not refresh automatically. Confirm dates and prices with the organizer before attending. Saved events are stored in the browser's local storage.
