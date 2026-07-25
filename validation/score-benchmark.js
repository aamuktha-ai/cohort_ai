import { readFile } from "node:fs/promises";
import { analyzeFeasibility, matchTypes, pipelineVersion } from "../src/analysisEngine.js";

const benchmarkPath = process.argv[2];
if (!benchmarkPath) {
  throw new Error("Usage: node validation/score-benchmark.js path/to/benchmark.json");
}

const benchmark = JSON.parse(await readFile(benchmarkPath, "utf8"));
const cases = benchmark.cases || [];
if (!cases.length) throw new Error("Benchmark has no cases.");

const results = cases.map((item) => {
  const report = analyzeFeasibility(item.input);
  return {
    id: item.id,
    difficulty: item.difficulty || "unstratified",
    expected: item.expected,
    observed: {
      matchType: report.crosswalk[0]?.matchType,
      recommendation: report.recommendation,
      sampleOverlapRisk: report.sampleOverlapRisk.level
    }
  };
});

function fraction(numerator, denominator) {
  return denominator ? Number((numerator / denominator).toFixed(3)) : null;
}

function wilsonInterval(successes, total, z = 1.96) {
  if (!total) return null;
  const p = successes / total;
  const denominator = 1 + (z ** 2 / total);
  const centre = (p + z ** 2 / (2 * total)) / denominator;
  const margin = (z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * total)) / total)) / denominator;
  return [Number((centre - margin).toFixed(3)), Number((centre + margin).toFixed(3))];
}

function perCategoryMetrics(label) {
  const truePositive = results.filter((row) => row.expected.matchType === label && row.observed.matchType === label).length;
  const falsePositive = results.filter((row) => row.expected.matchType !== label && row.observed.matchType === label).length;
  const falseNegative = results.filter((row) => row.expected.matchType === label && row.observed.matchType !== label).length;
  const precision = fraction(truePositive, truePositive + falsePositive);
  const recall = fraction(truePositive, truePositive + falseNegative);
  const f1 = precision !== null && recall !== null && precision + recall ? Number((2 * precision * recall / (precision + recall)).toFixed(3)) : null;
  return { precision, recall, f1, support: truePositive + falseNegative };
}

const matchCorrect = results.filter((row) => row.expected.matchType === row.observed.matchType).length;
const recommendationCorrect = results.filter((row) => row.expected.recommendation === row.observed.recommendation).length;
const knownOverlap = results.filter((row) => row.expected.sampleOverlapRisk === "Likely");
const overlapDetected = knownOverlap.filter((row) => row.observed.sampleOverlapRisk === "Likely").length;

const summary = {
  benchmarkPurpose: benchmark.purpose || "Not stated",
  pipelineVersion,
  caseCount: results.length,
  overallMatchAccuracy: fraction(matchCorrect, results.length),
  overallMatchWilson95: wilsonInterval(matchCorrect, results.length),
  cohortRecommendationExactMatch: fraction(recommendationCorrect, results.length),
  knownOverlapSensitivity: fraction(overlapDetected, knownOverlap.length),
  perMatchType: Object.fromEntries(matchTypes.map((label) => [label, perCategoryMetrics(label)])),
  byDifficulty: Object.fromEntries([...new Set(results.map((row) => row.difficulty))].map((difficulty) => {
    const group = results.filter((row) => row.difficulty === difficulty);
    return [difficulty, { caseCount: group.length, matchAccuracy: fraction(group.filter((row) => row.expected.matchType === row.observed.matchType).length, group.length) }];
  })),
  results
};

console.log(JSON.stringify(summary, null, 2));
