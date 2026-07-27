import assert from "node:assert/strict";
import { analyzeFeasibility } from "../src/analysisEngine.js";

const gdcDiagnosisSchemaUrl = "https://raw.githubusercontent.com/NCI-GDC/gdcdictionary/develop/src/gdcdictionary/schemas/diagnosis.yaml";

const response = await fetch(gdcDiagnosisSchemaUrl);
if (!response.ok) {
  throw new Error(`Unable to download the public NCI GDC diagnosis schema: ${response.status} ${response.statusText}`);
}

const gdcDiagnosisSchema = await response.text();
const report = analyzeFeasibility({
  question: "Can age at diagnosis and clinical stage be compared?",
  diseaseArea: "Cancer",
  analysisGoal: "harmonized-pooling",
  variables: "age, stage",
  localDataset: [
    "variable,description,units",
    "age,Age at diagnosis,years",
    "stage,AJCC clinical stage,I; II; III; IV"
  ].join("\n"),
  candidateDatasets: gdcDiagnosisSchema,
  userAttestation: true
});

const [localParsing, publicParsing] = report.provenance.dictionaryParsing;
assert.equal(localParsing.recordCount, 2);
assert.equal(publicParsing.format, "YAML schema");
assert.ok(publicParsing.recordCount >= 100, "Expected a substantial public GDC schema.");
assert.equal(report.crosswalk[0].publicVariable, "age_at_diagnosis");
assert.match(report.crosswalk[1].publicVariable, /^ajcc_/);

console.log(JSON.stringify({
  source: gdcDiagnosisSchemaUrl,
  pipelineVersion: report.provenance.pipelineVersion,
  publicRecordCount: publicParsing.recordCount,
  crosswalk: report.crosswalk.map(({ targetVariable, publicVariable, matchType }) => ({
    targetVariable,
    publicVariable,
    matchType
  }))
}, null, 2));
