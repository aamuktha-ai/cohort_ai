export const pipelineVersion = "cohortai-prototype-0.4";

const matchDefinitions = {
  Direct: {
    definition: "Same instrument or variable definition, same scoring/coding, directly poolable.",
    action: "Primary analysis; compare directly after analyst confirmation."
  },
  Analogous: {
    definition: "Same construct, different instrument, variable name, scale, or coding.",
    action: "Create a harmonized derived variable before pooling."
  },
  Partial: {
    definition: "Same construct but subset availability, phase restriction, timing mismatch, or binary vs. continuous mismatch.",
    action: "Use where available; document missingness; consider sensitivity analysis."
  },
  Supplemental: {
    definition: "Unique to one cohort and useful as context only.",
    action: "Keep as cohort-specific context or sub-analysis variable."
  },
  "No match": {
    definition: "Not collected or not visible in the compared dictionary.",
    action: "Exclude from pooled analysis for this construct."
  },
  "Needs review": {
    definition: "Possible match, but the supplied dictionary text is too ambiguous for a clean label.",
    action: "Route to human reviewer before analytic use."
  }
};

export const matchTypes = Object.keys(matchDefinitions);

const dimensions = [
  "Construct availability",
  "Definition concordance",
  "Coding / scoring comparability",
  "Units and timing compatibility",
  "Human-review burden"
];

const constructAliases = {
  age: ["age", "age_years", "age_at_diagnosis", "age_at_tx", "age at", "naccage"],
  sex: ["sex", "gender", "biological sex", "ptgender"],
  education: ["education", "educ", "pteducat", "edu_yrs", "years of education"],
  bmi: ["bmi", "body mass index", "height", "weight"],
  race: ["race", "ethnicity", "hispanic", "ptraccat", "ptethcat"],
  apoe: ["apoe", "apoe4", "ε4", "e4", "apgen"],
  stage: ["stage", "ajcc", "pathologic_stage", "stage_at_tx"],
  treatment: ["treatment", "therapy", "line_of_therapy", "prior_treatment"],
  response: ["response", "recist", "responder", "non-responder", "best overall response"],
  "progression-free survival": ["pfs", "progression-free", "progression free"],
  "overall survival": ["os", "overall survival", "death", "last contact"],
  "immune signature": ["signature", "expression", "immune", "rna"],
  moca: ["moca", "montreal cognitive assessment"],
  mmse: ["mmse", "mmscore", "mini mental"],
  depression: ["depression", "gds", "phq", "phq-9", "depressed"],
  hypertension: ["hypertension", "hypertens"],
  diabetes: ["diabetes", "diab"],
  smoking: ["smoking", "smoke", "tobacco"],
  alcohol: ["alcohol", "drinks", "substance"]
};

const unitTerms = ["years", "year", "months", "month", "days", "day", "weeks", "week", "pg/ml", "lbs", "inches", "score", "z-score"];
const codingTerms = ["coded", "code", "values", "allowed", "0/1", "binary", "yes", "no", "female", "male", "cr", "pr", "sd", "pd", "normal", "mci"];
const riskTerms = ["unknown", "unclear", "unavailable", "missing", "not collected", "unit unclear", "criteria unclear", "limited", "mostly unavailable"];
const partialTerms = ["subset", "phase", "restriction", "restricted", "derived", "converted", "binary", "continuous", "criteria", "baseline only"];
const instrumentTerms = ["recist", "ajcc", "moca", "mmse", "gds", "phq", "avlt", "cdr", "trails", "simoa", "rbm", "millipore", "rna-seq"];

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[ε]/g, "e")
    .replace(/[_/-]+/g, " ")
    .replace(/[^a-z0-9\s.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLines(value) {
  return String(value || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitTargets(value) {
  return String(value || "")
    .split(/[,\n;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function containsAny(text, terms) {
  const normalized = ` ${normalize(text)} `;
  return terms.some((term) => normalized.includes(` ${normalize(term)} `));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function tokenize(value) {
  return unique(normalize(value).split(" ").filter((token) => token.length > 1));
}

function tokenSimilarity(a, b) {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  const overlap = aTokens.filter((token) => bSet.has(token)).length;
  return overlap / new Set([...aTokens, ...bTokens]).size;
}

function getAliases(variable) {
  const normalized = normalize(variable);
  const matchingKey = Object.keys(constructAliases).find((key) => {
    return containsAny(normalized, [key, ...constructAliases[key]]);
  });

  return matchingKey ? unique([matchingKey, ...constructAliases[matchingKey], variable]) : [variable];
}

function detectDelimiter(line) {
  if (line.includes("\t")) return "\t";
  if (line.includes(",")) return ",";
  if (line.includes("|")) return "|";
  return null;
}

function parseDelimitedLine(line, delimiter) {
  if (delimiter !== ",") return line.split(delimiter).map((item) => item.trim());

  const values = [];
  let current = "";
  let quoted = false;

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
}

function bestColumnIndex(headers, candidates) {
  return headers.findIndex((header) => candidates.some((candidate) => normalize(header).includes(candidate)));
}

function parseStructuredDictionary(text, cohortLabel) {
  const lines = splitLines(text).filter((line) => !line.startsWith("###"));
  if (!lines.length) return [];

  const delimiter = detectDelimiter(lines[0]);
  if (!delimiter) return parseFreeTextDictionary(text, cohortLabel);

  const headers = parseDelimitedLine(lines[0], delimiter);
  if (headers.length < 2) return parseFreeTextDictionary(text, cohortLabel);

  const variableIndex = bestColumnIndex(headers, ["variable", "field", "name", "column"]);
  const descriptionIndex = bestColumnIndex(headers, ["description", "definition", "label", "construct", "instrument"]);
  const valuesIndex = bestColumnIndex(headers, ["value", "coding", "allowed", "category"]);
  const unitsIndex = bestColumnIndex(headers, ["unit", "scale"]);
  const domainIndex = bestColumnIndex(headers, ["domain"]);

  if (variableIndex === -1 && descriptionIndex === -1) return parseFreeTextDictionary(text, cohortLabel);

  return lines.slice(1).map((line, index) => {
    const cells = parseDelimitedLine(line, delimiter);
    const variable = cells[variableIndex] || cells[0] || "";
    const description = cells[descriptionIndex] || cells[1] || "";
    const values = valuesIndex >= 0 ? cells[valuesIndex] : "";
    const units = unitsIndex >= 0 ? cells[unitsIndex] : "";
    const domain = domainIndex >= 0 ? cells[domainIndex] : "";

    return makeVariableRecord({
      cohortLabel,
      sourceLine: line,
      rowIndex: index + 2,
      variable,
      description,
      values,
      units,
      domain
    });
  }).filter((record) => record.variable || record.description);
}

function parseFreeTextDictionary(text, cohortLabel) {
  const chunks = splitLines(text).flatMap((line) => {
    const withoutHeading = line.replace(/^#+\s*/, "");
    const dictionaryBody = withoutHeading.includes("dictionary:")
      ? withoutHeading.slice(withoutHeading.indexOf("dictionary:") + "dictionary:".length).trim()
      : withoutHeading;

    if (dictionaryBody.includes(";") && (dictionaryBody.includes("=") || dictionaryBody.includes(":"))) {
      return dictionaryBody.split(";").map((chunk) => chunk.trim()).filter(Boolean);
    }

    return [dictionaryBody];
  });

  return chunks.map((line, index) => {
    const cleaned = line.replace(/^#+\s*/, "");
    const [variableCandidate, ...rest] = cleaned.split(/\s*[:=]\s*/);
    const variable = rest.length ? variableCandidate : cleaned.split(/\s+/)[0];
    const description = rest.length ? rest.join(": ") : cleaned;

    return makeVariableRecord({
      cohortLabel,
      sourceLine: line,
      rowIndex: index + 1,
      variable,
      description
    });
  });
}

function parseJsonDictionary(text, cohortLabel) {
  try {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([variable, value]) => ({ variable, ...value }));

    return rows.map((row, index) => makeVariableRecord({
      cohortLabel,
      sourceLine: JSON.stringify(row),
      rowIndex: index + 1,
      variable: row.variable || row.name || row.field || row.column || "",
      description: row.description || row.definition || row.label || row.construct || "",
      values: row.values || row.allowedValues || row.coding || "",
      units: row.units || row.unit || row.scale || "",
      domain: row.domain || ""
    }));
  } catch {
    return [];
  }
}

function makeVariableRecord({ cohortLabel, sourceLine, rowIndex, variable, description, values = "", units = "", domain = "" }) {
  const combined = [variable, description, values, units, domain].join(" ");
  const inferredUnits = inferUnits(combined);

  return {
    cohortLabel,
    rowIndex,
    variable: String(variable || "").trim(),
    description: String(description || "").trim(),
    values: String(values || "").trim(),
    units: String(units || "").trim(),
    domain: String(domain || "").trim(),
    sourceLine,
    normalized: normalize(combined),
    inferredUnits,
    hasUnit: Boolean(units) || inferredUnits.length > 0,
    hasCoding: Boolean(values) || containsAny(combined, codingTerms),
    hasInstrument: containsAny(combined, instrumentTerms),
    hasRisk: containsAny(combined, riskTerms),
    hasAmbiguity: containsAny(combined, ["unknown", "unclear", "not documented", "not specified"]),
    hasPartialCue: containsAny(combined, partialTerms),
    measurementType: inferMeasurementType(combined)
  };
}

function inferUnits(text) {
  const normalized = normalize(text);
  return unitTerms.filter((term) => normalized.includes(normalize(term)));
}

function inferMeasurementType(text) {
  if (containsAny(text, ["continuous", "years", "months", "days", "score", "z-score", "pg/ml", "lbs", "inches"])) {
    return "continuous";
  }
  if (containsAny(text, ["binary", "0/1", "yes", "no", "responder", "non-responder"])) {
    return "binary";
  }
  if (containsAny(text, ["coded", "values", "allowed", "female", "male", "cr", "pr", "sd", "pd", "normal", "mci"])) {
    return "categorical";
  }

  return "unknown";
}

function parseDictionary(text, cohortLabel) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return [];

  const jsonRows = parseJsonDictionary(trimmed, cohortLabel);
  if (jsonRows.length) return jsonRows;

  return parseStructuredDictionary(trimmed, cohortLabel);
}

function parseCandidateDictionaries(text) {
  const lines = splitLines(text);
  const blocks = [];
  let label = "Candidate cohort";
  let content = [];

  const saveBlock = () => {
    if (content.length) {
      blocks.push({
        label,
        records: parseDictionary(content.join("\n"), label)
      });
    }
  };

  lines.forEach((line) => {
    if (line.startsWith("###")) {
      saveBlock();
      label = line.replace(/^###\s*/, "").trim() || "Candidate cohort";
      content = [];
      return;
    }
    content.push(line);
  });
  saveBlock();

  return blocks.length ? blocks : [{ label: "Candidate cohort", records: parseDictionary(text, "Candidate cohort") }];
}

function scoreRecordAgainstTarget(record, target) {
  const aliases = getAliases(target);
  const aliasMatch = containsAny(record.normalized, aliases);
  const variableScore = Math.max(...aliases.map((alias) => tokenSimilarity(record.variable, alias)));
  const descriptionScore = Math.max(...aliases.map((alias) => tokenSimilarity(record.description, alias)));
  const constructScore = Math.max(variableScore, descriptionScore, aliasMatch ? 0.82 : 0);
  const evidenceBonus = (record.hasUnit ? 0.04 : 0) + (record.hasCoding ? 0.04 : 0) + (record.hasInstrument ? 0.03 : 0);

  return clamp(constructScore + evidenceBonus, 0, 1);
}

function findBestRecord(records, target) {
  const ranked = records
    .map((record) => ({ record, score: scoreRecordAgainstTarget(record, target) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];

  if (!best || best.score < 0.18) {
    return {
      found: false,
      score: 0,
      record: null
    };
  }

  return {
    found: true,
    score: best.score,
    record: best.record
  };
}

function compareRecords(localMatch, publicMatch, targetIsExplicit) {
  if (!localMatch.found && !publicMatch.found) {
    return {
      matchType: "No match",
      confidence: 30,
      rationale: "The target construct was not clearly found in either dictionary."
    };
  }

  if (localMatch.found && !publicMatch.found) {
    return {
      matchType: targetIsExplicit ? "No match" : "Supplemental",
      confidence: Math.round(localMatch.score * 70),
      rationale: targetIsExplicit
        ? "The requested construct appears in the investigator dictionary but is not collected or visible in the compared public dictionary."
        : "The construct appears in the investigator dictionary but not in the compared public dictionary."
    };
  }

  if (!localMatch.found && publicMatch.found) {
    return {
      matchType: targetIsExplicit ? "No match" : "Supplemental",
      confidence: Math.round(publicMatch.score * 70),
      rationale: targetIsExplicit
        ? "The requested construct appears in the public dictionary but is not collected or visible in the investigator dictionary."
        : "The construct appears in the public dictionary but not in the investigator dictionary."
    };
  }

  const local = localMatch.record;
  const candidate = publicMatch.record;
  const nameSimilarity = tokenSimilarity(local.variable, candidate.variable);
  const descriptionSimilarity = tokenSimilarity(local.description, candidate.description);
  const valueSimilarity = tokenSimilarity(local.values, candidate.values);
  const unitSimilarity = tokenSimilarity([local.units, ...local.inferredUnits].join(" "), [candidate.units, ...candidate.inferredUnits].join(" "));
  const sharedInferredUnit = local.inferredUnits.some((unit) => candidate.inferredUnits.includes(unit));
  const sameUnit = (local.units && candidate.units && normalize(local.units) === normalize(candidate.units)) || sharedInferredUnit || (local.hasUnit && candidate.hasUnit && unitSimilarity >= 0.25);
  const bothCoded = local.hasCoding && candidate.hasCoding;
  const compatibleMeasurementType = local.measurementType === candidate.measurementType && local.measurementType !== "unknown";
  const continuousDirect = compatibleMeasurementType && local.measurementType === "continuous" && sameUnit;
  const sameCoding = bothCoded && (valueSimilarity >= 0.35 || normalize(local.values) === normalize(candidate.values));
  const categoricalDirect = compatibleMeasurementType && ["binary", "categorical"].includes(local.measurementType) && sameCoding;
  const riskPresent = local.hasRisk || candidate.hasRisk;
  const ambiguityPresent = local.hasAmbiguity || candidate.hasAmbiguity;
  const partialCue = local.hasPartialCue || candidate.hasPartialCue;
  const sameInstrument = local.hasInstrument && candidate.hasInstrument && descriptionSimilarity >= 0.18;

  if (nameSimilarity >= 0.7 && descriptionSimilarity >= 0.25 && (continuousDirect || categoricalDirect) && !riskPresent && !partialCue) {
    return {
      matchType: "Direct",
      confidence: 90,
      rationale: "The variable name, description, unit, and coding/scoring details are closely aligned."
    };
  }

  if ((sameInstrument || descriptionSimilarity >= 0.22 || nameSimilarity >= 0.35) && (continuousDirect || categoricalDirect) && !riskPresent && !partialCue) {
    return {
      matchType: "Direct",
      confidence: 84,
      rationale: "The same instrument or scoring definition appears to be represented in both dictionaries."
    };
  }

  if ((descriptionSimilarity >= 0.18 || localMatch.score >= 0.55 || publicMatch.score >= 0.55) && !riskPresent && !partialCue) {
    return {
      matchType: "Analogous",
      confidence: 76,
      rationale: "The same construct appears in both dictionaries, but names, scales, or coding details need a harmonization rule."
    };
  }

  if (ambiguityPresent) {
    return {
      matchType: "Needs review",
      confidence: 45,
      rationale: "The construct may overlap, but the supplied dictionary leaves a material definition, unit, or coding detail unclear."
    };
  }

  if (partialCue || riskPresent || (local.hasCoding !== candidate.hasCoding) || (local.hasUnit !== candidate.hasUnit)) {
    return {
      matchType: "Partial",
      confidence: 66,
      rationale: "The construct appears in both dictionaries, but availability, timing, coding, unit, or definition details are incomplete or mismatched."
    };
  }

  return {
    matchType: "Needs review",
    confidence: 52,
    rationale: "There is possible construct overlap, but the supplied descriptions do not support a confident match type."
  };
}

function inferTargets(localRecords, publicRecords) {
  const text = [...localRecords, ...publicRecords].map((record) => record.normalized).join(" ");
  const knownTargets = Object.keys(constructAliases).filter((key) => containsAny(text, [key, ...constructAliases[key]]));
  const variableTargets = localRecords.slice(0, 10).map((record) => record.variable).filter(Boolean);

  return unique([...knownTargets, ...variableTargets]).slice(0, 12);
}

function buildCrosswalk(input) {
  const localRecords = parseDictionary(input.localDataset, "Investigator");
  const candidateDictionaries = parseCandidateDictionaries(input.candidateDatasets);
  const publicRecords = candidateDictionaries.flatMap((candidate) => candidate.records);
  const requestedTargets = splitTargets(input.variables);
  const targets = requestedTargets.length ? requestedTargets : inferTargets(localRecords, publicRecords);

  return targets.flatMap((target) => candidateDictionaries.map((candidateDictionary) => {
    const localMatch = findBestRecord(localRecords, target);
    const publicMatch = findBestRecord(candidateDictionary.records, target);
    const classification = compareRecords(localMatch, publicMatch, requestedTargets.length > 0);
    const local = localMatch.record;
    const candidate = publicMatch.record;

    return {
      targetVariable: target,
      candidateCohort: candidateDictionary.label,
      localVariable: local?.variable || "Not found",
      publicVariable: candidate?.variable || "Not found",
      localDescription: summarizeRecord(local),
      publicDescription: summarizeRecord(candidate),
      localEvidenceLine: local?.sourceLine || "",
      publicEvidenceLine: candidate?.sourceLine || "",
      matchType: classification.matchType,
      matchDefinition: matchDefinitions[classification.matchType].definition,
      confidence: classification.confidence,
      rationale: classification.rationale,
      harmonizationAction: matchDefinitions[classification.matchType].action,
      reviewerStatus: ["Partial", "No match", "Needs review"].includes(classification.matchType) ? "Needs human review" : "Ready for analyst confirmation"
    };
  }));
}

function summarizeRecord(record) {
  if (!record) return "No matching description found.";
  const parts = [
    record.description,
    record.values ? `Values: ${record.values}` : "",
    record.units ? `Units: ${record.units}` : "",
    record.domain ? `Domain: ${record.domain}` : ""
  ];
  return parts.filter(Boolean).join(" | ") || record.sourceLine;
}

function buildMatchSummary(crosswalk) {
  const summary = Object.fromEntries(matchTypes.map((type) => [type, 0]));
  crosswalk.forEach((row) => {
    summary[row.matchType] += 1;
  });

  return matchTypes.map((type) => ({
    matchType: type,
    count: summary[type],
    proportion: crosswalk.length ? Number((summary[type] / crosswalk.length).toFixed(2)) : 0,
    action: matchDefinitions[type].action
  }));
}

function buildDimensions(crosswalk) {
  const total = Math.max(crosswalk.length, 1);
  const available = crosswalk.filter((row) => !["No match", "Supplemental"].includes(row.matchType)).length;
  const direct = crosswalk.filter((row) => row.matchType === "Direct").length;
  const usable = crosswalk.filter((row) => ["Direct", "Analogous"].includes(row.matchType)).length;
  const highRisk = crosswalk.filter((row) => ["Partial", "No match", "Needs review"].includes(row.matchType)).length;
  const strongConfidence = crosswalk.filter((row) => row.confidence >= 75).length;

  const scores = [
    Math.round((available / total) * 100),
    Math.round(((direct + usable) / (total * 2)) * 100),
    Math.round((usable / total) * 100),
    Math.round((strongConfidence / total) * 100),
    Math.round(((total - highRisk) / total) * 100)
  ];

  return dimensions.map((name, index) => ({
    name,
    score: clamp(scores[index], 20, 96),
    note: scores[index] >= 80
      ? "Strong support from the supplied dictionary rows."
      : scores[index] >= 55
        ? "Usable for triage, but needs harmonization review."
        : "High-risk dimension that should be reviewed manually."
  }));
}

function inferRecommendation(crosswalk) {
  const total = Math.max(crosswalk.length, 1);
  const direct = crosswalk.filter((row) => row.matchType === "Direct").length / total;
  const usable = crosswalk.filter((row) => ["Direct", "Analogous"].includes(row.matchType)).length / total;
  const highRisk = crosswalk.filter((row) => ["No match", "Needs review"].includes(row.matchType)).length / total;

  if (direct >= 0.7 && highRisk <= 0.1) return "Direct comparison";
  if (usable >= 0.65 && highRisk <= 0.35) return "Harmonized pooling";
  if (usable >= 0.35) return "Federated analysis";
  return "Not poolable without major review";
}

function buildFlags(crosswalk, input) {
  const flags = [];
  const allText = normalize(`${input.localDataset}\n${input.candidateDatasets}`);

  if (crosswalk.some((row) => row.matchType === "Partial")) {
    flags.push("Partial matches should not be treated as directly poolable without an explicit restriction, recoding, or sensitivity-analysis plan.");
  }
  if (crosswalk.some((row) => row.matchType === "No match")) {
    flags.push("At least one target construct is not collected or not visible in the supplied dictionary text.");
  }
  if (crosswalk.some((row) => row.matchType === "Needs review")) {
    flags.push("Some possible matches are ambiguous enough to require human adjudication.");
  }
  if (containsAny(allText, ["days", "months", "years", "follow-up", "baseline"])) {
    flags.push("Confirm time anchors and unit conversions before using longitudinal or time-to-event variables.");
  }
  if (containsAny(allText, ["unknown", "unclear", "unavailable", "missing"])) {
    flags.push("Resolve missing or unclear dictionary entries before finalizing pooled analyses.");
  }
  const sampleOverlapRisk = inferSampleOverlapRisk(allText);
  if (sampleOverlapRisk.level !== "None expected") {
    flags.push(sampleOverlapRisk.rationale);
  }

  return flags.length ? flags : ["No high-severity dictionary issues were detected by this prototype pass."];
}

function inferSampleOverlapRisk(text) {
  if (containsAny(text, ["same participants", "shared participants", "duplicate subjects", "overlapping participants", "linked records"])) {
    return {
      level: "Likely",
      rationale: "Sample-overlap risk is likely based on language indicating shared, duplicate, overlapping, or linked participants."
    };
  }

  if (containsAny(text, ["site", "recruitment", "recruited", "overlap", "funding source", "same registry", "same study"])) {
    return {
      level: "Possible",
      rationale: "Review sample-overlap risk using cohort source, recruitment sites, time windows, funding source, and accession provenance."
    };
  }

  return {
    level: "None expected",
    rationale: "No sample-overlap evidence was visible in the supplied dictionary metadata."
  };
}

function buildNextSteps(crosswalk) {
  const reviewRows = crosswalk.filter((row) => ["Partial", "No match", "Needs review"].includes(row.matchType));
  const analogousRows = crosswalk.filter((row) => row.matchType === "Analogous");
  const firstReview = reviewRows[0]?.targetVariable;

  return [
    "Have a reviewer confirm each match type against the source dictionary row before treating the report as final.",
    analogousRows.length ? "For Analogous matches, write the exact recoding, rescaling, or derived-variable rule." : "For Direct matches, document why raw comparison is acceptable.",
    "For Partial or No match variables, decide whether to restrict the analysis, run sensitivity analyses, or exclude the construct.",
    firstReview ? `Start manual review with ${firstReview}, because it has the highest downstream harmonization risk.` : "Document final analyst sign-off for the crosswalk.",
    "Save the report JSON with dictionary version, model/pipeline version, and reviewer notes."
  ];
}

function buildProvenance(input) {
  return {
    pipelineVersion,
    generatedAt: new Date().toISOString(),
    modelProvider: "prototype rule engine",
    modelVersion: "LLM adapter not connected yet",
    promptVersion: "cohortai-harmonization-rubric-1.0",
    inputFingerprint: createInputFingerprint(input),
    dictionaryScope: "metadata/data dictionaries only; no subject-level data",
    userAttestation: Boolean(input.userAttestation),
    matchTaxonomy: matchDefinitions
  };
}

export function createInputFingerprint(input) {
  const canonical = [
    input.question,
    input.diseaseArea,
    input.analysisGoal,
    input.variables,
    input.localDataset,
    input.candidateDatasets
  ].map((value) => String(value || "").trim()).join("\\n---\\n");

  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function scoreFeasibility(dimensionsForReport, crosswalk) {
  const avg = Math.round(dimensionsForReport.reduce((sum, item) => sum + item.score, 0) / dimensionsForReport.length);
  const confidenceBonus = Math.round(
    crosswalk.reduce((sum, row) => sum + row.confidence, 0) / Math.max(crosswalk.length, 1) / 12
  );
  return clamp(avg + confidenceBonus - 5, 20, 96);
}

function countCandidateDictionaries(input) {
  return parseCandidateDictionaries(input.candidateDatasets).length;
}

export function analyzeFeasibility(input) {
  const crosswalk = buildCrosswalk(input);
  const reportDimensions = buildDimensions(crosswalk);
  const feasibilityScore = scoreFeasibility(reportDimensions, crosswalk);

  return {
    mode: "cohort",
    question: input.question,
    diseaseArea: input.diseaseArea,
    candidateCount: countCandidateDictionaries(input),
    feasibilityScore,
    recommendation: inferRecommendation(crosswalk),
    dimensions: reportDimensions,
    matchSummary: buildMatchSummary(crosswalk),
    crosswalk,
    sampleOverlapRisk: inferSampleOverlapRisk(normalize(`${input.localDataset}\\n${input.candidateDatasets}`)),
    flags: buildFlags(crosswalk, input),
    nextSteps: buildNextSteps(crosswalk),
    provenance: buildProvenance(input),
    disclaimer: "Decision support only. This report does not replace expert biostatistical review and does not grant or substitute for data access approval.",
    llmStatus: "Prototype professor-aligned rule engine. Connect the validated LLM adapter before production use."
  };
}
