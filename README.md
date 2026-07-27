# CohortAI

CohortAI is a prototype I am building to compare cohort data dictionaries. The main idea is to make it easier to see whether variables from different cancer research cohorts are defined similarly enough to compare, harmonize, or keep separate.

For now, this is a local browser app with an optional LLM backend. If no model is configured, it falls back to the built-in professor-aligned rule engine so the workflow can still be tested.

## What It Does Right Now

- Lets you upload or paste an investigator/local data dictionary.
- Lets you upload or paste one or more public cohort data dictionaries.
- Reconstructs variable records from common `page,text` CSV exports of PDF data dictionaries, while flagging them for source review.
- Reads standard CSV/TSV dictionaries, JSON Schema property lists, YAML schema property lists, and cBioPortal's five-row clinical-data metadata format.
- Lets you list the variables you care about comparing.
- Generates a variable crosswalk and feasibility report that looks at:
  - variable name overlap
  - variable descriptions
  - coding and allowed values
  - units and time anchors
  - missingness or availability issues
  - possible harmonization problems
- Classifies variable matches as Direct, Analogous, Partial, Supplemental, No match, or Needs review.
- Adds basic provenance information.
- Lets you download the full report as JSON and the variable crosswalk as CSV.

## PAN Reference Version

`pan.html` is a separate CohortAI version for a data website where the candidate cohort is always the Precision Aging Network (PAN). Users upload only their investigator dictionary; the PAN candidate dictionary is bundled as metadata in `reference-data/PAN_Data_Dictionary.csv` and is enforced again by the server for future LLM-backed analyses.

The PAN page uses the deterministic comparison engine by default, so it remains responsive when comparing against the full reference dictionary. A secured PAN-aware LLM route can be enabled later without allowing users to replace the fixed candidate cohort.

Open it locally at:

```text
http://localhost:5173/pan.html
```

After GitHub Pages deploys it, its sharing URL is:

```text
https://aamuktha-ai.github.io/cohort_ai/pan.html
```

## How To Run It

From this project folder, run:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Optional LLM Setup

The app has a server endpoint at `POST /api/analyze`. The browser sends the data dictionaries there, and the server calls the model so API keys are not exposed in the front end.

For Claude:

```bash
export COHORTAI_MODEL_PROVIDER=anthropic
export ANTHROPIC_API_KEY="your-key-here"
export COHORTAI_MODEL="claude-3-5-sonnet-20241022"
npm run dev
```

For a Llama/OpenAI-compatible endpoint:

```bash
export COHORTAI_MODEL_PROVIDER=llama
export LLAMA_API_URL="https://your-llama-endpoint.example.com/v1/chat/completions"
export LLAMA_API_KEY="optional-key"
export COHORTAI_MODEL="your-llama-model-name"
npm run dev
```

If those variables are not set, the app still works using the local rule engine.

Copy `.env.example` for a reminder of the required variables, but keep any real API key only in your local environment. Do not put a key in GitHub or in a browser file.

## Reproducible Validation

The project now includes a deterministic validation package in `validation/`.

```bash
npm run validate
npm run benchmark
npm run adjudication
npm run public-smoke
```

`npm run validate` runs the engineering regression fixtures for all CohortAI match types. `npm run benchmark` produces a structured metric report from those fixtures. `npm run adjudication` calculates Cohen's kappa from two independent expert label sets. These commands make implementation changes auditable, but they are not a substitute for the expert-adjudicated benchmark required by the UACC/PAN validation protocol. See `validation/README.md` for the formal study workflow and the required thresholds.

`npm run public-smoke` downloads the current public NCI GDC diagnosis schema and verifies CohortAI can read its YAML properties without saving the schema in this repository. It needs an internet connection and checks parser behavior, not clinical validity.

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

On GitHub Pages, this runs with the local rule-engine fallback only. The live LLM route needs the Node server because API keys should stay on the server, not in the browser.

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
├── test/
├── validation/
└── README.md
```

## Notes

This is still an early version. The app is mainly meant to show the workflow:

1. Add data dictionaries.
2. Compare the variable descriptions.
3. Build a draft variable crosswalk.
4. Flag differences in coding, units, endpoints, and missingness.
5. Produce a report that can guide harmonization decisions.

## Next Things To Add

- Direct PDF upload and table extraction for native PDF files.
- Better variable extraction and matching for arbitrary dictionary formats.
- Test the live Claude/Llama output against expert-adjudicated labels.
- Saved projects or previous runs.
- Locked, expert-adjudicated benchmark cases and a formal validation report.
