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

## Event updates

Upcoming events are stored in `src/data/events.json` and loaded into the site at build time. The GitHub Actions workflow in `.github/workflows/refresh-events.yml` refreshes the list daily from the Visit Malmö event calendar. Run it manually from the repository's Actions tab with **Refresh Malmö events > Run workflow**.

To run the updater locally, use `npm run events:refresh`. It validates the source response and event fields, skips past or incomplete entries, preserves reviewed times and prices where available, and refuses to replace the current data if too few valid events are found. The workflow builds the app before committing changed data.

The first version uses structured HTML parsing rather than an AI API, so no AI key or database is needed. The collected records link to the organizer's page. Collection is limited to the public Visit Malmö calendar and should be reviewed against that site's terms before production use. Automatically imported prices, exact times, and cancellation status can be missing or become outdated; confirm details on the organizer page. The source-listing date is used when the listing does not give a time.

GitHub Actions has a free monthly allowance for private repositories. The workflow uses a small amount of it when the daily job runs. A GitHub-hosted static site or Pages deployment can be configured separately; because the scheduled job pushes commits using GitHub's built-in token, other GitHub Actions workflows are not automatically triggered by that push. For hosts integrated with GitHub, verify their deployment webhook behavior or configure deployment from this same workflow.

Saved events are stored in the browser's local storage.
