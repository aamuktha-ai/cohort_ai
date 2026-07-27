import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeFeasibility, matchTypes } from "../src/analysisEngine.js";

const fixturePath = new URL("../validation/fixtures/development-cases.json", import.meta.url);
const panReferencePath = new URL("../reference-data/PAN_Data_Dictionary.csv", import.meta.url);
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

test("PDF-text CSV exports reconstruct variable names and descriptions", () => {
  const report = analyzeFeasibility({
    question: "Compare age and sex",
    diseaseArea: "Cancer",
    analysisGoal: "direct-comparison",
    variables: "age, sex",
    localDataset: [
      "page,text",
      "8,A1 Subject Demographics NACCAGE Subject age at visit NACC derived variable v1-3",
      "8,A1 Subject Demographics SEX Subject sex Original UDS question v1-3"
    ].join("\n"),
    candidateDatasets: [
      "### PAN PDF export",
      "page,text",
      "143,age_hml",
      "143,Description: What is your current age?",
      "147,sex_hml",
      "147,Description: What is your biological sex?"
    ].join("\n"),
    userAttestation: true
  });

  assert.equal(report.crosswalk[0].localVariable, "NACCAGE");
  assert.equal(report.crosswalk[0].publicVariable, "age_hml");
  assert.equal(report.crosswalk[1].localVariable, "SEX");
  assert.equal(report.crosswalk[1].publicVariable, "sex_hml");
  assert.equal(report.provenance.dictionaryParsing[0].format, "PDF-text CSV reconstruction");
  assert.equal(report.provenance.dictionaryParsing[1].recordCount, 2);
});

test("cBioPortal-style five-row clinical files use the variable identifier row", () => {
  const report = analyzeFeasibility({
    question: "Compare age and stage",
    diseaseArea: "Cancer",
    analysisGoal: "harmonized-pooling",
    variables: "age, stage",
    localDataset: "variable\tdescription\tunits\nage\tAge at diagnosis\tyears\nstage\tAJCC clinical stage\tI; II; III; IV",
    candidateDatasets: [
      "#Patient Identifier\tAge at diagnosis\tClinical stage",
      "#Unique patient identifier\tAge at diagnosis in years\tAJCC clinical stage",
      "#STRING\tNUMBER\tSTRING",
      "#1\t1\t1",
      "PATIENT_ID\tAGE\tAJCC_STAGE",
      "P001\t61\tII"
    ].join("\n"),
    userAttestation: true
  });

  assert.deepEqual(report.crosswalk.map((row) => row.publicVariable), ["AGE", "AJCC_STAGE"]);
  assert.equal(report.provenance.dictionaryParsing[1].format, "cBioPortal clinical data format");
  assert.equal(report.provenance.dictionaryParsing[1].recordCount, 2);
});

test("JSON Schema properties retain descriptions and coded values", () => {
  const report = analyzeFeasibility({
    question: "Compare diagnosis age",
    diseaseArea: "Cancer",
    analysisGoal: "harmonized-pooling",
    variables: "age",
    localDataset: "variable,description,units\nage,Age at diagnosis,years",
    candidateDatasets: JSON.stringify({
      title: "Public cancer dictionary",
      properties: {
        age_at_diagnosis: { description: "Age at diagnosis", type: "integer", units: "years" },
        vital_status: { description: "Vital status", enum: ["Alive", "Dead"] }
      }
    }),
    userAttestation: true
  });

  assert.equal(report.crosswalk[0].publicVariable, "age_at_diagnosis");
  assert.match(report.crosswalk[0].publicDescription, /Age at diagnosis/);
});

test("YAML schema properties are parsed without treating references as missing fields", () => {
  const report = analyzeFeasibility({
    question: "Compare diagnosis age",
    diseaseArea: "Cancer",
    analysisGoal: "harmonized-pooling",
    variables: "age",
    localDataset: "variable,description,units\nage,Age at diagnosis,years",
    candidateDatasets: [
      "title: Diagnosis",
      "properties:",
      "  age_at_diagnosis:",
      "    description: Age at diagnosis in days",
      "    type: integer",
      "  vital_status:",
      "    $ref: _definitions.yaml#/vital_status"
    ].join("\n"),
    userAttestation: true
  });

  assert.equal(report.crosswalk[0].publicVariable, "age_at_diagnosis");
  assert.equal(report.provenance.dictionaryParsing[1].format, "YAML schema");
  assert.equal(report.provenance.dictionaryParsing[1].recordCount, 2);
});

test("weak token overlap is not reported as a collected target variable", () => {
  const report = analyzeFeasibility({
    question: "Compare Trail Making Test A",
    diseaseArea: "Cancer",
    analysisGoal: "harmonized-pooling",
    variables: "trail making test a",
    localDataset: "variable,description\ntraila,Trail Making Test Part A completion time",
    candidateDatasets: "variable,description\nrepeat_test_taker,Participant has completed a repeat test\nvisit_date,Date of test visit",
    userAttestation: true
  });

  assert.equal(report.crosswalk[0].matchType, "No match");
  assert.equal(report.crosswalk[0].publicVariable, "Not found");
});

test("bundled PAN reference dictionary supports fixed-reference comparisons", async () => {
  const panDictionary = await readFile(panReferencePath, "utf8");
  const report = analyzeFeasibility({
    mode: "pan-reference",
    referenceCohort: "PAN",
    question: "Compare core cognitive and demographic variables with PAN.",
    diseaseArea: "Aging",
    analysisGoal: "harmonized-pooling",
    variables: "age, education, moca, trail making test a",
    localDataset: [
      "variable,description,units",
      "age,Age at baseline visit,years",
      "education_years,Years of formal education,years",
      "moca_score,Montreal Cognitive Assessment total score,0-30 score",
      "trail_a_seconds,Trail Making Test Part A completion time,seconds"
    ].join("\n"),
    candidateDatasets: `### Precision Aging Network (PAN)\n${panDictionary}`,
    userAttestation: true
  });

  assert.equal(report.candidateCount, 1);
  assert.equal(report.provenance.dictionaryParsing[1].recordCount, 3086);
  assert.equal(report.crosswalk[0].candidateCohort, "Precision Aging Network (PAN)");
  assert.equal(report.crosswalk[0].publicVariable, "age_hml");
  assert.equal(report.crosswalk[1].publicVariable, "edu_yrs_hml");
  assert.equal(report.crosswalk[2].publicVariable, "moca_total");
  assert.equal(report.crosswalk[3].matchType, "No match");
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
