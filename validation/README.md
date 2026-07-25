# CohortAI validation package

This folder makes the CohortAI validation process reproducible. It follows the supplied UACC/PAN validation protocol: freeze the tested version, compare structured output to expert-adjudicated labels, stratify by difficulty, retain a held-out set, and report uncertainty rather than only a single accuracy number.

## What is included now

- `fixtures/development-cases.json` contains deterministic engineering regression cases. They cover Direct, Analogous, Partial, Supplemental, No match, Needs review, and Likely sample-overlap risk.
- `score-benchmark.js` runs a benchmark fixture through the frozen local rule engine and prints reproducible JSON metrics: per-category precision/recall/F1, Wilson 95% confidence interval for overall agreement, cohort-recommendation exact match, overlap-risk sensitivity, and difficulty-stratified results.
- `check-adjudication.js` calculates Cohen's kappa from two independent adjudicator label sets and exits nonzero when match-type kappa is below 0.60.
- `../test/analysisEngine.test.js` checks that the output remains stable whenever the implementation changes.

These development fixtures are not evidence of real-world performance. They are software tests. Formal validation starts only after the expected labels are independently adjudicated by biostatisticians and stored in a locked benchmark file.

## Formal validation workflow

1. Create a benchmark JSON file by copying the fixture structure. Include a stable `id`, full input dictionaries, `difficulty`, expected match type, expected cohort recommendation, and expected sample-overlap risk for every case.
2. Use completed NACC/ADNI/PAN or MBAR/PAN/SARI crosswalks for retrospective cases. Add prospectively adjudicated cases with two independent biostatisticians and senior resolution of disagreements.
3. Record inter-rater Cohen's kappa before treating consensus labels as ground truth. Use `npm run adjudication -- path/to/adjudication-labels.json`; revise the rubric if kappa is below 0.60.
4. Lock the final held-out benchmark before changing prompts, aliases, or decision rules. Never use its results to tune the pipeline.
5. Freeze the CohortAI commit, pipeline version, prompt version, provider, model version, model endpoint, and input dictionary versions for the run.
6. Run `npm run benchmark -- path/to/locked-benchmark.json` and archive the JSON output with the exact Git commit hash.
7. Report the protocol thresholds: F1 at least 0.80 for No match and Partial; sensitivity at least 0.90 for known-overlap cases; cohort recommendation exact match at least 0.75; and mean human rationale-traceability rating at least 4/5.

## Reproducibility rules

- Do not place a provider API key, private endpoint, or restricted dictionary in Git.
- Each app report stores the pipeline version, prompt version, model version/provider, generation time, input fingerprint, and user attestation.
- Save the downloaded report JSON and crosswalk CSV as a run record. The app intentionally does not persist uploaded dictionaries.
- Re-run `npm run validate` before every tagged validation run.
