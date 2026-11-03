# Fieldnote · NGO funder report demo

A local React + Vite + TypeScript prototype for preparing one grant report from budget, expense, and programme-result CSV records. The initial organization, grant, records, amounts, evidence references, and reporting period are fictional.

## Run locally

Requires Node.js 20.19 or later and npm.

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. To make a static production build, run `npm run build`; to serve that build locally, run `npm run preview`.

## Use the prototype

- Start on the report overview, which loads the fictional Sahaya Learning Collective sample.
- Download the example CSVs in `public/examples/` or from the Import records page. Their headers are the required import columns.
- Import budget, expenses, and programme-results CSVs. The first successfully applied import clears all sample records; later imports add to the active workspace.
- Review invalid rows in the import queue. Correct editable cells in place; valid rows can be applied while rows with issues remain visible. Source filename and CSV row are shown throughout the report.
- Review category spending, target progress, and evidence statuses. Evidence status is taken from the CSV and is not independently verified.
- Open Draft report and use **Print / save PDF**. In the browser print dialog, select a printer or “Save as PDF.”
- Use **Clear session data** to clear records stored by the demo in this browser. With an empty workspace, **Restore sample** reloads the fictional example.

## Local data handling

CSV files are parsed in the browser. This project has no server, sign-in, cloud storage, external integration, or AI feature. Records are stored in this browser's local storage so the page can be refreshed during a demo. Use fictional or anonymized data only. Clearing the session removes the app's saved workspace from this browser.

## Adapting for an NGO pilot

Confirm the funder's reporting template, grant identifiers and period, currency and budget categories, source system export formats, programme indicator names/units/targets, expected evidence types and status vocabulary, and staff review/approval steps. Agree on a safe data-minimization approach and use anonymized records for the pilot. This prototype is a reporting aid and does not certify legal, regulatory, accounting, or funder compliance.
