import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeFeasibility, matchTypes } from "../src/analysisEngine.js";

const fixturePath = new URL("../validation/fixtures/development-cases.json", import.meta.url);
const fixtures = JSON.parse(await readFile(fixturePath, "utf8"));

test("development fixtures cover every CohortAI match type", () => {
  const expectedTypes = new Set(fixtures.cases.map((item) => item.expected.matchType));
  for (const matchType of matchTypes) {
    assert.ok(expectedTypes.has(matchType), `Missing fixture for ${matchType}`);
  }
});

test("candidate dictionaries remain separate in the crosswalk", () => {
  const report = analyzeFeasibility({
    question: "Compare age",
    diseaseArea: "Cancer",
    analysisGoal: "direct-comparison",
    variables: "age",
    localDataset: "age: Age in years",
    candidateDatasets: "### Cohort A\nage: Age in years\n\n### Cohort B\nage_at_visit: Age at visit in years",
    userAttestation: true
  });

  assert.equal(report.candidateCount, 2);
  assert.equal(report.crosswalk.length, 2);
  assert.deepEqual(report.crosswalk.map((row) => row.candidateCohort), ["Cohort A", "Cohort B"]);
});

test("stage does not resolve to age through substring matching", () => {
  const report = analyzeFeasibility({
    question: "Compare stage",
    diseaseArea: "Cancer",
    analysisGoal: "direct-comparison",
    variables: "stage",
    localDataset: "age: Age in years",
    candidateDatasets: "age: Age in years",
    userAttestation: true
  });

  assert.equal(report.crosswalk[0].matchType, "No match");
  assert.equal(report.crosswalk[0].localVariable, "Not found");
});

for (const fixture of fixtures.cases) {
  test(`rubric regression: ${fixture.id}`, () => {
    const report = analyzeFeasibility(fixture.input);
    assert.equal(report.crosswalk[0].matchType, fixture.expected.matchType);
    assert.equal(report.recommendation, fixture.expected.recommendation);
    assert.equal(report.sampleOverlapRisk.level, fixture.expected.sampleOverlapRisk);
    assert.equal(report.provenance.userAttestation, true);
    assert.match(report.provenance.inputFingerprint, /^fnv1a-[a-f0-9]{8}$/);
    assert.equal(
      report.matchSummary.reduce((sum, item) => sum + item.count, 0),
      report.crosswalk.length,
      "Match summary should reconcile to the crosswalk."
    );
  });
}
