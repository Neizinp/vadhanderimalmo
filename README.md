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

Upcoming events are stored in `src/data/events.json` and loaded into the site at build time. The GitHub Actions workflow in `.github/workflows/refresh-events.yml` refreshes the list daily from Malmö City's event calendar, Visit Malmö, Kulturcentralen, Malmö Arena and Kulturbolaget. Run it manually from the repository's Actions tab with **Refresh Malmö events > Run workflow**.

To run the updater locally, use `npm run events:refresh`. Each source has its own fetcher and parsing rules. Successful results are merged by event ID with the previous dataset; matching IDs are refreshed, while unexpired events missing from a successful response are retained. Past events are removed by their end date (or start date if untimed), and starts more than 365 days ahead are excluded. If one source fails, its unexpired previous records are retained and the error is reported while the other sources continue. The updater validates records and refuses to replace the data if too few valid upcoming events remain. The workflow builds the app before committing changed data.

The collector uses Malmö City's publicly used paginated JSON endpoint, structured HTML parsing for Visit Malmö and Malmö Arena, Kulturcentralen's monthly calendar with a Malmö venue check on each detail page, and Kulturbolaget's RSS feed with a Malmö detail-page check. No AI key or database is needed. The collected records link to the event/organizer page. Collection is limited to these public calendars and should be reviewed against their terms before production use. Automatically imported prices, exact times, and cancellation status can be missing or become outdated; confirm details on the linked event page. Date-only entries remain untimed rather than receiving an invented time.

GitHub Actions has a free monthly allowance for private repositories. The workflow uses a small amount of it when the daily job runs. A GitHub-hosted static site or Pages deployment can be configured separately; because the scheduled job pushes commits using GitHub's built-in token, other GitHub Actions workflows are not automatically triggered by that push. For hosts integrated with GitHub, verify their deployment webhook behavior or configure deployment from this same workflow.

Saved events are stored in the browser's local storage.
