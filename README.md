# CohortAI

CohortAI is a small prototype for comparing cohort data dictionaries. The goal is to help researchers decide whether variables from different cancer research cohorts are similar enough to compare directly, harmonize for pooled analysis, or keep separate.

Right now the app runs locally in the browser. It does not call a live LLM yet. The current scoring logic is a placeholder so I can test the workflow before connecting Claude, Llama, or another model endpoint.

## What It Does

- Upload or paste a local/investigator data dictionary.
- Upload or paste one or more public cohort data dictionaries.
- List the target variables that need comparison.
- Generate a feasibility report about:
  - variable name overlap
  - variable description similarity
  - coding/value set compatibility
  - units and time anchors
  - missingness and availability
  - harmonization flags
- Download the report as JSON.

## Run Locally

From this folder:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Example Files

The `examples/` folder has two small TSV data dictionaries that can be uploaded into the app:

- `examples/local-data-dictionary.tsv`
- `examples/public-data-dictionary.tsv`

## Project Structure

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

## GitHub Setup

If this folder is not connected to GitHub yet:

1. Create a new empty repository on GitHub.
2. Do not add a README, license, or `.gitignore` on GitHub if you are pushing this existing folder.
3. Copy the repository URL.
4. Run these commands from this project folder:

```bash
git add .
git commit -m "Add CohortAI prototype"
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO-NAME.git
git push -u origin main
```

Replace `YOUR-USERNAME/YOUR-REPO-NAME` with the real GitHub repo path.

## Next Steps

- Add better parsing for CSV/TSV data dictionaries.
- Add a real variable crosswalk table to the report.
- Add LLM-based extraction and comparison through `src/modelAdapters.js`.
- Add project history so previous comparisons can be saved.
- Add tests once the scoring logic becomes less experimental.
