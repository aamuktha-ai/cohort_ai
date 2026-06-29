const cohortDimensions = [
  "Variable name overlap",
  "Description concordance",
  "Coding and value sets",
  "Units and time anchors",
  "Missingness and availability"
];

const keywordGroups = {
  strong: ["coded", "code", "units", "years", "months", "recist", "ajcc", "censored", "follow-up", "description", "dictionary"],
  caution: ["unknown", "missing", "unclear", "different", "limited", "unavailable", "mostly unavailable"],
  risk: ["unit unclear", "criteria unclear", "unavailable", "incompatible", "unmatched", "missing", "unknown"]
};

function countMatches(text, terms) {
  const normalized = text.toLowerCase();
  return terms.reduce((count, term) => count + (normalized.includes(term) ? 1 : 0), 0);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function splitLines(value) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function makeDimensionScore(name, text, index) {
  const strong = countMatches(text, keywordGroups.strong);
  const caution = countMatches(text, keywordGroups.caution);
  const base = 62;
  const score = clamp(base + strong * 5 - caution * 6 - index * 2, 25, 94);

  return {
    name,
    score,
    note: score >= 78
      ? "Strong alignment based on provided metadata."
      : score >= 58
        ? "Potentially usable with variable-level harmonization checks."
        : "Needs manual data dictionary review before cross-study analysis."
  };
}

function inferRecommendation(score) {
  if (score >= 80) return "Variable definitions are broadly comparable";
  if (score >= 62) return "Harmonization needed before pooling";
  return "Manual dictionary review recommended";
}

function buildFlags(text) {
  const flags = [];
  const lower = text.toLowerCase();

  if (lower.includes("unknown") || lower.includes("unclear")) {
    flags.push("Missing or unclear variable descriptions should be resolved before pooled analysis.");
  }
  if (lower.includes("unit unclear") || lower.includes("days") || lower.includes("months")) {
    flags.push("Unit conversion rules may be needed, especially for time-to-event variables.");
  }
  if (lower.includes("responder") || lower.includes("non-responder")) {
    flags.push("Binary response groups should be reconciled with detailed RECIST categories before analysis.");
  }
  if (lower.includes("survival") && !lower.includes("follow")) {
    flags.push("Survival analyses need compatible follow-up definitions and censoring rules.");
  }

  return flags.length ? flags : ["No high-severity dictionary incompatibilities were detected from the entered descriptions."];
}

function buildVariableFindings(text, variables) {
  const lower = text.toLowerCase();
  const targetVariables = splitLines(variables.replaceAll(",", "\n"));
  const findings = [];

  if (lower.includes("age")) {
    findings.push("Age appears available, but check whether cohorts use years, days, diagnosis date, or treatment-start date.");
  }
  if (lower.includes("sex") || lower.includes("gender")) {
    findings.push("Sex/gender fields appear mappable, but value labels should be normalized before analysis.");
  }
  if (lower.includes("recist") || lower.includes("response")) {
    findings.push("Response is present in multiple dictionaries; detailed RECIST categories and binary responder labels need a crosswalk.");
  }
  if (lower.includes("pfs") || lower.includes("progression-free")) {
    findings.push("Progression-free survival needs aligned start date, event definition, censoring rule, and unit conversion.");
  }
  if (lower.includes("os") || lower.includes("overall survival")) {
    findings.push("Overall survival appears feasible if death date/status and last-contact definitions are comparable.");
  }
  if (lower.includes("signature") || lower.includes("expression")) {
    findings.push("Expression-derived scores require assay/platform notes and score-scaling rules before pooling.");
  }

  const covered = findings.length;
  if (!covered && targetVariables.length) {
    findings.push(`Target variables listed: ${targetVariables.slice(0, 6).join(", ")}. Add descriptions, coding, units, and missingness notes for stronger comparison.`);
  }

  return findings.length ? findings : ["Add target variable descriptions to generate variable-level comparability findings."];
}

function buildNextSteps(dimensions) {
  const lowest = [...dimensions].sort((a, b) => a.score - b.score)[0];
  return [
    "Create a variable crosswalk with local name, public cohort name, description, allowed values, unit, and harmonized target field.",
    "Resolve ambiguous descriptions, coding systems, time anchors, units, and missingness conventions.",
    `Prioritize manual review of ${lowest.name.toLowerCase()}.`,
    "Attach source data dictionaries and publication methods sections for LLM-assisted extraction.",
    "Record final variable inclusion/exclusion and recoding decisions in a reproducible harmonization log."
  ];
}

export function analyzeFeasibility(input) {
  const text = [
    input.question,
    input.diseaseArea,
    input.analysisGoal,
    input.localDataset,
    input.candidateDatasets,
    input.variables
  ].join(" ");
  const candidateCount = splitLines(input.candidateDatasets).length;
  const dimensions = cohortDimensions.map((name, index) => makeDimensionScore(name, text, index));
  const avg = Math.round(dimensions.reduce((sum, item) => sum + item.score, 0) / dimensions.length);
  const completenessBonus = clamp(candidateCount * 2, 0, 8);
  const riskPenalty = countMatches(text, keywordGroups.risk) > 1 ? 6 : 0;
  const feasibilityScore = clamp(avg + completenessBonus - riskPenalty, 20, 96);

  return {
    generatedAt: new Date().toISOString(),
    mode: "cohort",
    question: input.question,
    diseaseArea: input.diseaseArea,
    candidateCount,
    feasibilityScore,
    recommendation: inferRecommendation(feasibilityScore),
    dimensions,
    variableFindings: buildVariableFindings(text, input.variables),
    flags: buildFlags(text),
    nextSteps: buildNextSteps(dimensions),
    llmStatus: "Prototype heuristic engine. LLM adapter boundary is ready for Claude/Llama integration."
  };
}
