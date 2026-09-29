import { analyzeFeasibility, parseDictionary } from "./analysisEngine.js";

const sample = {
  question: "Are response, survival, treatment, and immune-signature variables defined similarly enough across melanoma immunotherapy cohorts for harmonized analysis?",
  diseaseArea: "Melanoma",
  analysisGoal: "harmonized-pooling",
  localDataset: "local_age: age at anti-PD-1 start, years\nsex: sex assigned at birth, coded Female/Male\nstage_at_tx: AJCC stage at treatment start, coded III/IV\nline_of_therapy: treatment line number at anti-PD-1 start\nresponse_recist: best overall response by RECIST 1.1, coded CR/PR/SD/PD\npfs_months: months from anti-PD-1 start to progression or death, censored at last follow-up\nos_months: months from anti-PD-1 start to death, censored at last contact\nimmune_signature_score: RNA-derived interferon-gamma signature, continuous z-score",
  candidateDatasets: "### GEO GSE91061 data dictionary\nage = age at treatment, years\ngender = male/female\nstage = melanoma stage\nprior_treatment = previous systemic therapy\nresponse = RECIST response CR/PR/SD/PD\npfs = progression-free survival in months\nos = overall survival in months\nrnaseq_platform = bulk RNA-seq platform\n\n### GEO GSE78220 data dictionary\nage_years = age at biopsy\nsex = F/M\ntreatment = anti-PD-1\nresponse_group = responder/non-responder, response criteria described in publication\nsurvival_time = months follow-up\nsurvival_status = alive/dead\nexpression_signature = immune expression score, unit unclear\n\n### TCGA-SKCM data dictionary\nage_at_diagnosis = age in days\ngender = female/male\npathologic_stage = AJCC stage\ntreatment_response = mostly unavailable\ndays_to_death = survival endpoint in days\ndays_to_last_follow_up = censoring follow-up time in days\nRNA-seq expression = expression available\nimmunotherapy_exposure = unclear",
  variables: "age, sex, stage, treatment line, RECIST response, progression-free survival, overall survival, immune signature score"
};

const panReferenceSample = {
  question: "Which investigator variables can be compared or harmonized with the Precision Aging Network data dictionary?",
  diseaseArea: "Aging and dementia research",
  analysisGoal: "harmonized-pooling",
  localDataset: "local_age: Age at baseline visit in years\nsex: Sex assigned at birth, coded female/male\neducation_years: Years of formal education\nrace: Self-reported race\nmoca_score: Montreal Cognitive Assessment total score, 0-30\ntrail_a_seconds: Trail Making Test Part A completion time in seconds",
  variables: "age, sex, education, race, moca, trail making test a"
};

let latestReport = null;
let panReferenceDictionary = "";
let panReferenceLoadError = "";
const panReferenceMode = document.body.dataset.referenceCohort === "PAN";
const usePanReferenceLlm = document.body.dataset.usePanLlm === "true";

const form = document.querySelector("#analysisForm");
const generateButton = document.querySelector("#generateButton") || form.querySelector("button[type='submit']");
const report = document.querySelector("#report");
const emptyState = document.querySelector("#emptyState");
const formError = document.querySelector("#formError");
const analysisProgress = document.querySelector("#analysisProgress");
const downloadButton = document.querySelector("#downloadButton");
const downloadCrosswalkButton = document.querySelector("#downloadCrosswalkButton");
const localDictionaryFile = document.querySelector("#localDictionaryFile");
const candidateDictionaryFiles = document.querySelector("#candidateDictionaryFiles");
const localFileStatus = document.querySelector("#localFileStatus");
const candidateFileStatus = document.querySelector("#candidateFileStatus");
const panReferenceStatus = document.querySelector("#panReferenceStatus");
const fields = {
  question: document.querySelector("#question"),
  diseaseArea: document.querySelector("#diseaseArea"),
  analysisGoal: document.querySelector("#analysisGoal"),
  localDataset: document.querySelector("#localDataset"),
  candidateDatasets: document.querySelector("#candidateDatasets"),
  variables: document.querySelector("#variables"),
  userAttestation: document.querySelector("#userAttestation")
};

function showError(message) {
  if (!formError) return;
  formError.textContent = message;
  formError.classList.remove("hidden");
}

function clearError() {
  if (!formError) return;
  formError.textContent = "";
  formError.classList.add("hidden");
}

function setAnalysisProgress(message = "") {
  if (!analysisProgress) return;
  analysisProgress.textContent = message;
  analysisProgress.classList.toggle("hidden", !message);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatUploadedDictionary(fileName, content) {
  return `### ${fileName}\n${content.trim()}`;
}

function isPdfTextExport(content) {
  const firstLine = String(content || "").split(/\r?\n/, 1)[0].replace(/^\uFEFF/, "").trim().toLowerCase();
  return firstLine === "page,text" || firstLine === '"page","text"';
}

async function readUploadedFile(file) {
  const content = await readDictionaryFile(file);
  return {
    formatted: formatUploadedDictionary(file.name, content),
    isPdfTextExport: isPdfTextExport(content),
    isPdf: isPdfFile(file),
    characterCount: content.length
  };
}

function isPdfFile(file) {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

function pdfPageText(items) {
  const lines = new Map();
  items.forEach((item) => {
    const text = String(item.str || "").trim();
    if (!text) return;
    const transform = Array.isArray(item.transform) ? item.transform : [];
    const y = Math.round(Number(transform[5]) || 0);
    const x = Number(transform[4]) || 0;
    const line = lines.get(y) || [];
    line.push({ text, x });
    lines.set(y, line);
  });

  return [...lines.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, line]) => line.sort((a, b) => a.x - b.x).map((item) => item.text).join(" "))
    .join("\n");
}

async function extractPdfDictionaryText(file) {
  const pdfjs = await import(new URL("../vendor/pdfjs/pdf.min.mjs", import.meta.url));
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  task.onProgress = ({ loaded = 0, total = 0 }) => {
    if (total) setAnalysisProgress("Reading " + file.name + ": " + Math.round((loaded / total) * 100) + "%");
  };

  const pdf = await task.promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setAnalysisProgress("Extracting page " + pageNumber + " of " + pdf.numPages + " from " + file.name + "...");
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = pdfPageText(content.items);
    if (text) pages.push("Page " + pageNumber + "\n" + text);
  }
  await task.destroy();

  const extracted = pages.join("\n\n");
  if (extracted.replace(/\s/g, "").length < 100) {
    throw new Error("This PDF does not contain enough selectable text to read as a dictionary. Upload an OCRed/text-based PDF or a CSV/TSV export.");
  }
  return extracted;
}

async function readDictionaryFile(file) {
  return isPdfFile(file) ? extractPdfDictionaryText(file) : file.text();
}

async function handleLocalUpload() {
  const [file] = localDictionaryFile.files;
  if (!file) return;
  try {
    clearError();
    setAnalysisProgress("Reading " + file.name + "...");
    const uploaded = await readUploadedFile(file);
    if (!uploaded.formatted.trim() || uploaded.formatted.includes("\u0000")) {
      throw new Error("This file could not be read as a data dictionary.");
    }
    fields.localDataset.value = uploaded.formatted;
    localFileStatus.textContent = (uploaded.isPdf ? "Extracted " : "Uploaded ") + file.name + " (" + uploaded.characterCount.toLocaleString() + " characters)";
    setAnalysisProgress();
  } catch (error) {
    localDictionaryFile.value = "";
    localFileStatus.textContent = "No file uploaded";
    setAnalysisProgress();
    showError(error.message || "The selected investigator dictionary could not be read.");
  }
}

async function handleCandidateUpload() {
  if (panReferenceMode) return;
  const files = Array.from(candidateDictionaryFiles.files);
  if (!files.length) return;
  try {
    clearError();
    setAnalysisProgress("Reading " + files.length + " candidate dictionar" + (files.length === 1 ? "y" : "ies") + "...");
    const dictionaries = [];
    for (const file of files) {
      setAnalysisProgress("Reading " + file.name + "...");
      dictionaries.push(await readUploadedFile(file));
    }
    fields.candidateDatasets.value = dictionaries.map((item) => item.formatted).join("\n\n");
    const pdfCount = dictionaries.filter((item) => item.isPdf).length;
    candidateFileStatus.textContent = "Loaded " + files.length + " candidate dictionar" + (files.length === 1 ? "y" : "ies") + (pdfCount ? " (" + pdfCount + " PDF" + (pdfCount === 1 ? "" : "s") + " extracted)" : "");
    setAnalysisProgress();
  } catch (error) {
    candidateDictionaryFiles.value = "";
    candidateFileStatus.textContent = "No files uploaded";
    setAnalysisProgress();
    showError(error.message || "One or more candidate dictionaries could not be read.");
  }
}

async function loadPanReferenceDictionary() {
  if (!panReferenceMode) return;

  try {
    const response = await fetch(new URL("../reference-data/PAN_Data_Dictionary.csv", import.meta.url));
    if (!response.ok) throw new Error("PAN reference dictionary could not be loaded.");
    panReferenceDictionary = await response.text();
    parseDictionary(panReferenceDictionary, "Precision Aging Network (PAN)");
    fields.candidateDatasets.value = `### Precision Aging Network (PAN)\n${panReferenceDictionary}`;
    panReferenceStatus.textContent = "PAN reference dictionary loaded and locked for comparison.";
  } catch {
    panReferenceLoadError = "The PAN reference dictionary could not be loaded. Refresh the page before running an assessment.";
    panReferenceStatus.textContent = panReferenceLoadError;
  }
}

function loadSample() {
  const activeSample = panReferenceMode ? panReferenceSample : sample;
  Object.entries(activeSample).forEach(([key, value]) => {
    fields[key].value = value;
  });
  localDictionaryFile.value = "";
  if (candidateDictionaryFiles) candidateDictionaryFiles.value = "";
  localFileStatus.textContent = "Sample dictionary loaded";
  if (candidateFileStatus) candidateFileStatus.textContent = "Sample dictionaries loaded";
  fields.userAttestation.checked = true;
  setAnalysisProgress();
  clearError();
}

function collectInput() {
  return {
    mode: panReferenceMode ? "pan-reference" : "cohort",
    referenceCohort: panReferenceMode ? "PAN" : "",
    question: fields.question.value.trim(),
    diseaseArea: fields.diseaseArea.value.trim(),
    analysisGoal: fields.analysisGoal.value,
    localDataset: fields.localDataset.value.trim(),
    candidateDatasets: panReferenceMode
      ? `### Precision Aging Network (PAN)\n${panReferenceDictionary}`
      : fields.candidateDatasets.value.trim(),
    variables: fields.variables.value.trim(),
    userAttestation: fields.userAttestation.checked
  };
}

function renderMatchBadge(type) {
  return `<span class="match-badge ${type.toLowerCase().replaceAll(" ", "-")}">${escapeHtml(type)}</span>`;
}

function toCsvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function buildCrosswalkCsv(data) {
  const headers = [
    "target_variable",
    "candidate_cohort",
    "local_variable",
    "public_variable",
    "match_type",
    "confidence",
    "reviewer_status",
    "rationale",
    "harmonization_action",
    "local_description",
    "public_description"
  ];
  const rows = data.crosswalk.map((row) => [
    row.targetVariable,
    row.candidateCohort,
    row.localVariable,
    row.publicVariable,
    row.matchType,
    row.confidence,
    row.reviewerStatus,
    row.rationale,
    row.harmonizationAction,
    row.localDescription,
    row.publicDescription
  ]);

  return [headers, ...rows].map((row) => row.map(toCsvCell).join(",")).join("\n");
}

function downloadBlob(content, fileName, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderReport(data) {
  emptyState.classList.add("hidden");
  report.classList.remove("hidden");
  downloadButton.disabled = false;
  downloadCrosswalkButton.disabled = false;
  report.innerHTML = `
    <article class="report-card score">
      <div class="score-ring" style="--score: ${data.feasibilityScore}%">${data.feasibilityScore}</div>
      <div>
        <span class="recommendation">${escapeHtml(data.recommendation)}</span>
        <p>${data.candidateCount} candidate data dictionar${data.candidateCount === 1 ? "y" : "ies"} assessed. ${escapeHtml(data.llmStatus)}</p>
      </div>
    </article>

    <article class="report-card">
      <h3>Data Dictionary Comparison</h3>
      <div class="dimension-grid">
        ${data.dimensions.map((item) => `
          <div class="dimension-row">
            <strong>${escapeHtml(item.name)}</strong>
            <div class="bar" aria-label="${escapeHtml(item.name)} score ${item.score}">
              <span style="--width: ${item.score}%"></span>
            </div>
            <span>${item.score}</span>
          </div>
        `).join("")}
      </div>
    </article>

    <article class="report-card">
      <h3>Match Summary</h3>
      <div class="summary-grid">
        ${data.matchSummary.map((item) => `
          <div class="summary-item">
            ${renderMatchBadge(item.matchType)}
            <strong>${item.count}</strong>
            <span>${Math.round(item.proportion * 100)}%</span>
          </div>
        `).join("")}
      </div>
      <p>${escapeHtml(data.disclaimer || "Decision support only. Confirm final decisions against the source documentation.")}</p>
    </article>

    <article class="report-card">
      <h3>Variable Crosswalk</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Target</th>
              <th>Candidate cohort</th>
              <th>Local</th>
              <th>Public</th>
              <th>Match</th>
              <th>Review</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${data.crosswalk.map((row) => `
              <tr>
                <td>${escapeHtml(row.targetVariable)}</td>
                <td>${escapeHtml(row.candidateCohort || "Candidate cohort")}</td>
                <td>${escapeHtml(row.localVariable)}</td>
                <td>${escapeHtml(row.publicVariable)}</td>
                <td>${renderMatchBadge(row.matchType)}</td>
                <td>${escapeHtml(row.reviewerStatus)}</td>
                <td>${escapeHtml(row.harmonizationAction)}</td>
              </tr>
              <tr class="rationale-row">
                <td colspan="7">
                  <strong>Why:</strong> ${escapeHtml(row.rationale)}<br>
                  <strong>Investigator definition:</strong> ${escapeHtml(row.localDescription)}<br>
                  <strong>Candidate definition:</strong> ${escapeHtml(row.publicDescription)}<br>
                  <strong>Evidence:</strong> ${escapeHtml(row.localEvidenceLine || "Investigator dictionary row")} | ${escapeHtml(row.publicEvidenceLine || "Candidate dictionary row")}
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </article>

    <article class="report-card">
      <h3>Harmonization Flags</h3>
      <ul>${data.flags.map((flag) => `<li>${escapeHtml(flag)}</li>`).join("")}</ul>
    </article>

    <article class="report-card">
      <h3>Sample-Overlap Risk</h3>
      <p><strong>${escapeHtml(data.sampleOverlapRisk?.level || "Not assessed")}</strong> - ${escapeHtml(data.sampleOverlapRisk?.rationale || "No structured overlap assessment was returned.")}</p>
    </article>

    <article class="report-card">
      <h3>Dictionary Parsing</h3>
      <ul>${(data.provenance.dictionaryParsing || []).map((item) => `<li><strong>${escapeHtml(item.cohort)}</strong>: ${escapeHtml(item.recordCount)} records using ${escapeHtml(item.format)}.${item.needsExtractionReview ? " Review source evidence before final sign-off." : ""}</li>`).join("")}</ul>
    </article>

    <article class="report-card">
      <h3>Recommended Next Steps</h3>
      <ul>${data.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ul>
    </article>

    <article class="report-card">
      <h3>Provenance</h3>
      <dl class="provenance-list">
        <div><dt>Pipeline</dt><dd>${escapeHtml(data.provenance.pipelineVersion)}</dd></div>
        <div><dt>Generated</dt><dd>${escapeHtml(data.provenance.generatedAt)}</dd></div>
        <div><dt>Model</dt><dd>${escapeHtml(data.provenance.modelVersion)}</dd></div>
        <div><dt>Prompt</dt><dd>${escapeHtml(data.provenance.promptVersion || "Not recorded")}</dd></div>
        <div><dt>Input fingerprint</dt><dd>${escapeHtml(data.provenance.inputFingerprint || "Not recorded")}</dd></div>
        <div><dt>Scope</dt><dd>${escapeHtml(data.provenance.dictionaryScope)}</dd></div>
        <div><dt>Attestation</dt><dd>${data.provenance.userAttestation ? "Confirmed" : "Missing"}</dd></div>
      </dl>
    </article>
  `;
}

async function requestLlmReport(input) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new Error("The CohortAI API did not return a valid report.");
  }
  if (!response.ok) throw new Error(payload.error || "Live model is unavailable.");
  return payload;
}

document.querySelector("#loadSampleButton").addEventListener("click", loadSample);
localDictionaryFile.addEventListener("change", handleLocalUpload);
if (candidateDictionaryFiles) candidateDictionaryFiles.addEventListener("change", handleCandidateUpload);

document.querySelector("#clearButton").addEventListener("click", () => {
  form.reset();
  localDictionaryFile.value = "";
  if (candidateDictionaryFiles) candidateDictionaryFiles.value = "";
  localFileStatus.textContent = "No file uploaded";
  if (candidateFileStatus) candidateFileStatus.textContent = "No files uploaded";
  report.classList.add("hidden");
  emptyState.classList.remove("hidden");
  downloadButton.disabled = true;
  downloadCrosswalkButton.disabled = true;
  latestReport = null;
  setAnalysisProgress();
  clearError();
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearError();
  if (!fields.userAttestation.checked) {
    showError("Please confirm that you are authorized to use these data dictionaries.");
    return;
  }

  if (panReferenceMode && (!panReferenceDictionary || panReferenceLoadError)) {
    showError(panReferenceLoadError || "The PAN reference dictionary is still loading. Please try again in a moment.");
    return;
  }

  if (!fields.localDataset.value.trim()) {
    showError("Add an investigator data dictionary before generating a crosswalk.");
    return;
  }

  if (!panReferenceMode && !fields.candidateDatasets.value.trim()) {
    showError("Add at least one candidate cohort data dictionary before generating a crosswalk.");
    return;
  }

  const input = collectInput();
  generateButton.disabled = true;
  generateButton.textContent = "Generating...";
  setAnalysisProgress("Comparing the supplied dictionary descriptions and generating the crosswalk...");

  try {
    if (panReferenceMode && !usePanReferenceLlm) {
      latestReport = analyzeFeasibility(input);
    } else {
      try {
        latestReport = await requestLlmReport(input);
      } catch (error) {
        latestReport = analyzeFeasibility(input);
        latestReport.llmStatus = "Deterministic comparison used for this report. A live model was not configured or available.";
      }
    }
    renderReport(latestReport);
    setAnalysisProgress("Crosswalk generated. Review the variable-level rows below.");
    report.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    showError(error.message || "CohortAI could not generate a crosswalk.");
    setAnalysisProgress();
  } finally {
    generateButton.disabled = false;
    generateButton.textContent = "Generate Crosswalk";
  }
});

downloadButton.addEventListener("click", () => {
  if (!latestReport) return;
  downloadBlob(
    JSON.stringify(latestReport, null, 2),
    "cohortai-feasibility-report.json",
    "application/json"
  );
});

downloadCrosswalkButton.addEventListener("click", () => {
  if (!latestReport) return;
  downloadBlob(
    buildCrosswalkCsv(latestReport),
    "cohortai-variable-crosswalk.csv",
    "text/csv"
  );
});

loadPanReferenceDictionary();
