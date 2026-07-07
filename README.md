# CohortAI

CohortAI is a prototype I am building to compare cohort data dictionaries. The main idea is to make it easier to see whether variables from different cancer research cohorts are defined similarly enough to compare or combine.

For now, this is a local browser app. It does not use a live LLM yet. The scoring is still a basic placeholder, but the workflow is set up so a real model can be added later.

## What It Does Right Now

- Lets you upload or paste an investigator/local data dictionary.
- Lets you upload or paste one or more public cohort data dictionaries.
- Lets you list the variables you care about comparing.
- Gives a simple feasibility report that looks at:
  - variable name overlap
  - variable descriptions
  - coding and allowed values
  - units and time anchors
  - missingness or availability issues
  - possible harmonization problems
- Lets you download the report as a JSON file.

## How To Run It

From this project folder, run:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Sharing It

The easiest way to show this to other people is GitHub Pages.

After the project is pushed to GitHub:

1. Open the GitHub repo.
2. Go to **Settings**.
3. Click **Pages** in the left sidebar.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Pick the `main` branch and `/root`.
6. Click **Save**.

GitHub will give you a public link after it finishes deploying. It will look something like:

```text
https://aamuktha-ai.github.io/cohort_ai/
```

This version is still just a front-end prototype, so anything uploaded stays in the browser session and is not saved to a server.

## Example Data Dictionaries

I added two small example files in the `examples/` folder so the upload feature can be tested quickly:

- `examples/local-data-dictionary.tsv`
- `examples/public-data-dictionary.tsv`

## Files

```text
.
├── examples/
├── src/
│   ├── analysisEngine.js
│   ├── app.js
│   ├── modelAdapters.js
│   └── styles.css
├── index.html
├── package.json
├── server.js
└── README.md
```

## Notes

This is still an early version. The app is mainly meant to show the workflow:

1. Add data dictionaries.
2. Compare the variable descriptions.
3. Flag differences in coding, units, endpoints, and missingness.
4. Produce a report that can guide harmonization decisions.

## Next Things To Add

- Better CSV/TSV parsing instead of just reading uploaded files as text.
- A variable crosswalk table in the report.
- A real LLM comparison step in `src/modelAdapters.js`.
- Saved projects or previous runs.
- Tests once the comparison logic is more stable.


