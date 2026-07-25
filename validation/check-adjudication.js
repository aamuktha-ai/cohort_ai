import { readFile } from "node:fs/promises";

const inputPath = process.argv[2];
if (!inputPath) {
  throw new Error("Usage: node validation/check-adjudication.js path/to/adjudication-labels.json");
}

const data = JSON.parse(await readFile(inputPath, "utf8"));
const cases = data.cases || [];
const completeCases = cases.filter((item) => item.adjudicatorA && item.adjudicatorB);

function cohenKappa(dimension) {
  const pairs = completeCases
    .map((item) => [item.adjudicatorA[dimension], item.adjudicatorB[dimension]])
    .filter(([left, right]) => left && right);

  if (!pairs.length) return { pairCount: 0, kappa: null, observedAgreement: null };

  const aCounts = new Map();
  const bCounts = new Map();
  let agreements = 0;
  for (const [left, right] of pairs) {
    if (left === right) agreements += 1;
    aCounts.set(left, (aCounts.get(left) || 0) + 1);
    bCounts.set(right, (bCounts.get(right) || 0) + 1);
  }

  const observedAgreement = agreements / pairs.length;
  const expectedAgreement = [...new Set([...aCounts.keys(), ...bCounts.keys()])]
    .reduce((sum, label) => sum + ((aCounts.get(label) || 0) / pairs.length) * ((bCounts.get(label) || 0) / pairs.length), 0);
  const kappa = expectedAgreement === 1 ? null : (observedAgreement - expectedAgreement) / (1 - expectedAgreement);

  return {
    pairCount: pairs.length,
    observedAgreement: Number(observedAgreement.toFixed(3)),
    kappa: kappa === null ? null : Number(kappa.toFixed(3))
  };
}

const result = {
  purpose: "Inter-rater agreement check before consensus labels are used as CohortAI validation ground truth.",
  totalCases: cases.length,
  completePairedCases: completeCases.length,
  matchType: cohenKappa("matchType"),
  sampleOverlapRisk: cohenKappa("sampleOverlapRisk"),
  cohortRecommendation: cohenKappa("recommendation")
};

console.log(JSON.stringify(result, null, 2));

if (completeCases.length && result.matchType.kappa !== null && result.matchType.kappa < 0.6) {
  process.exitCode = 2;
}
