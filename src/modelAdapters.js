import { createInputFingerprint, matchTypes, pipelineVersion } from "./analysisEngine.js";

export const promptVersion = "cohortai-harmonization-rubric-1.0";

export const cohortAiModelSchema = {
  mode: "cohort",
  feasibilityScore: 0,
  candidateCount: 0,
  recommendation: "Direct comparison | Harmonized pooling | Federated analysis | Not poolable without major review",
  dimensions: [{ name: "string", score: 0, note: "string" }],
  sampleOverlapRisk: {
    level: "None expected | Possible | Likely",
    rationale: "string"
  },
  matchSummary: [
    {
      matchType: "Direct | Analogous | Partial | Supplemental | No match | Needs review",
      count: 0,
      proportion: 0
    }
  ],
  crosswalk: [
    {
      targetVariable: "string",
      candidateCohort: "string",
      localVariable: "string",
      publicVariable: "string",
      localDescription: "string",
      publicDescription: "string",
      matchType: "Direct | Analogous | Partial | Supplemental | No match | Needs review",
      confidence: 0,
      rationale: "string",
      harmonizationAction: "string",
      reviewerStatus: "Ready for analyst confirmation | Needs human review",
      localEvidenceLine: "string",
      publicEvidenceLine: "string"
    }
  ],
  flags: ["string"],
  nextSteps: ["string"]
};

export function buildCohortAiPrompt(input) {
  return `
You are CohortAI, a data-dictionary harmonization assistant.

Task:
Compare an investigator cohort data dictionary against one or more candidate cohort data dictionaries.
Do not analyze subject-level data. Use only the metadata/codebook text provided.

Use this exact match taxonomy:
- Direct: same instrument or variable definition, same scoring/coding, directly poolable.
- Analogous: same construct, different instrument, variable name, scale, or coding; harmonize first.
- Partial: same construct but subset availability, phase restriction, timing mismatch, or binary vs continuous mismatch.
- Supplemental: unique to one cohort; context only.
- No match: not collected or not visible in the compared dictionary.
- Needs review: possible match, but too ambiguous for a clean label.

Important decision rules:
- Prefer caution. Do not label a variable Direct unless definition, units/timing, and scoring/coding are visibly compatible.
- If a variable is conceptually similar but uses a different instrument or coding scheme, label Analogous.
- If a variable is only available for some visits, phases, subgroups, or as binary vs continuous, label Partial.
- If a construct appears in only one dictionary, label Supplemental or No match depending on whether it is useful context.
- Surface sample-overlap, unclear units, missing definitions, and timing mismatches as flags.
- Every rationale must point back to a source dictionary line or phrase.
- Return a sampleOverlapRisk level of None expected, Possible, or Likely, with evidence from the supplied metadata. Do not infer overlap from disease area alone.
- Do not add a new match category. Needs review is only for genuinely ambiguous cases and should not replace Direct, Analogous, Partial, Supplemental, or No match.
- Return structured JSON only. No markdown.

Scientific question:
${input.question}

Disease/research area:
${input.diseaseArea}

Desired analysis:
${input.analysisGoal}

Target variables:
${input.variables}

Investigator data dictionary:
${input.localDataset}

Candidate cohort data dictionaries:
${input.candidateDatasets}

Return JSON with this shape:
${JSON.stringify(cohortAiModelSchema, null, 2)}
`.trim();
}

export async function runModelAssessment(input) {
  const provider = process.env.COHORTAI_MODEL_PROVIDER || "none";

  if (provider === "anthropic") {
    return runAnthropicAssessment(input);
  }

  if (provider === "llama") {
    return runLlamaAssessment(input);
  }

  const error = new Error("No live model provider configured.");
  error.statusCode = 503;
  throw error;
}

async function runAnthropicAssessment(input) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const error = new Error("ANTHROPIC_API_KEY is not set.");
    error.statusCode = 503;
    throw error;
  }

  const model = process.env.COHORTAI_MODEL || "claude-3-5-sonnet-20241022";
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model,
      max_tokens: 6000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: buildCohortAiPrompt(input)
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic request failed: ${response.status} ${detail}`);
  }

  const payload = await response.json();
  const text = payload.content?.map((item) => item.text || "").join("\n") || "";
  return normalizeModelReport(JSON.parse(extractJson(text)), {
    provider: "anthropic",
    model
  }, input);
}

async function runLlamaAssessment(input) {
  const endpoint = process.env.LLAMA_API_URL;
  if (!endpoint) {
    const error = new Error("LLAMA_API_URL is not set.");
    error.statusCode = 503;
    throw error;
  }

  const model = process.env.COHORTAI_MODEL || process.env.LLAMA_MODEL || "llama";
  const apiKey = process.env.LLAMA_API_KEY;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: buildCohortAiPrompt(input)
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Llama request failed: ${response.status} ${detail}`);
  }

  const payload = await response.json();
  const text = payload.choices?.[0]?.message?.content || payload.output || payload.text || "";
  return normalizeModelReport(JSON.parse(extractJson(text)), {
    provider: "llama",
    model
  }, input);
}

function extractJson(text) {
  const trimmed = String(text || "").trim();
  if (trimmed.startsWith("{")) return trimmed;

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return parseable JSON.");
  }

  return trimmed.slice(start, end + 1);
}

function normalizeModelReport(report, modelInfo, input) {
  validateModelReport(report);
  return {
    ...report,
    llmStatus: `Live ${modelInfo.provider} assessment using ${modelInfo.model}.`,
    provenance: {
      ...(report.provenance || {}),
      pipelineVersion,
      promptVersion,
      inputFingerprint: createInputFingerprint(input),
      dictionaryScope: "metadata/data dictionaries only; no subject-level data",
      userAttestation: Boolean(input.userAttestation),
      modelProvider: modelInfo.provider,
      modelVersion: modelInfo.model
    }
  };
}

function validateModelReport(report) {
  if (!report || typeof report !== "object" || !Array.isArray(report.crosswalk)) {
    throw new Error("Model response is missing the required crosswalk array.");
  }

  const requiredTopLevel = ["recommendation", "dimensions", "matchSummary", "flags", "nextSteps", "sampleOverlapRisk"];
  const missing = requiredTopLevel.filter((key) => !(key in report));
  if (missing.length) {
    throw new Error(`Model response is missing required fields: ${missing.join(", ")}.`);
  }

  const invalidMatch = report.crosswalk.find((row) => !matchTypes.includes(row.matchType));
  if (invalidMatch) {
    throw new Error(`Model response contains an unsupported match type: ${invalidMatch.matchType}.`);
  }

  if (!report.sampleOverlapRisk || !["None expected", "Possible", "Likely"].includes(report.sampleOverlapRisk.level)) {
    throw new Error("Model response contains an invalid sample-overlap risk level.");
  }
}
