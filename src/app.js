import { analyzeFeasibility } from "./analysisEngine.js";

const sample = {
  question: "Are response, survival, treatment, and immune-signature variables defined similarly enough across melanoma immunotherapy cohorts for harmonized analysis?",
  diseaseArea: "Melanoma",
  analysisGoal: "harmonized-pooling",
  localDataset: "local_age: age at anti-PD-1 start, years\nsex: sex assigned at birth, coded Female/Male\nstage_at_tx: AJCC stage at treatment start, coded III/IV\nline_of_therapy: treatment line number at anti-PD-1 start\nresponse_recist: best overall response by RECIST 1.1, coded CR/PR/SD/PD\npfs_months: months from anti-PD-1 start to progression or death, censored at last follow-up\nos_months: months from anti-PD-1 start to death, censored at last contact\nimmune_signature_score: RNA-derived interferon-gamma signature, continuous z-score",
  candidateDatasets: "### GEO GSE91061 data dictionary\nage = age at treatment, years\ngender = male/female\nstage = melanoma stage\nprior_treatment = previous systemic therapy\nresponse = RECIST response CR/PR/SD/PD\npfs = progression-free survival in months\nos = overall survival in months\nrnaseq_platform = bulk RNA-seq platform\n\n### GEO GSE78220 data dictionary\nage_years = age at biopsy\nsex = F/M\ntreatment = anti-PD-1\nresponse_group = responder/non-responder, response criteria described in publication\nsurvival_time = months follow-up\nsurvival_status = alive/dead\nexpression_signature = immune expression score, unit unclear\n\n### TCGA-SKCM data dictionary\nage_at_diagnosis = age in days\ngender = female/male\npathologic_stage = AJCC stage\ntreatment_response = mostly unavailable\ndays_to_death = survival endpoint in days\ndays_to_last_follow_up = censoring follow-up time in days\nRNA-seq expression = expression available\nimmunotherapy_exposure = unclear",
  variables: "age, sex, stage, treatment line, RECIST response, progression-free survival, overall survival, immune signature score"
};

let latestReport = null;

const form = document.querySelector("#analysisForm");
const report = document.querySelector("#report");
const emptyState = document.querySelector("#emptyState");
const downloadButton = document.querySelector("#downloadButton");
const downloadCrosswalkButton = document.querySelector("#downloadCrosswalkButton");
const localDictionaryFile = document.querySelector("#localDictionaryFile");
const candidateDictionaryFiles = document.querySelector("#candidateDictionaryFiles");
const localFileStatus = document.querySelector("#localFileStatus");
const candidateFileStatus = document.querySelector("#candidateFileStatus");
const fields = {
  question: document.querySelector("#question"),
  diseaseArea: document.querySelector("#diseaseArea"),
  analysisGoal: document.querySelector("#analysisGoal"),
  localDataset: document.querySelector("#localDataset"),
  candidateDatasets: document.querySelector("#candidateDatasets"),
  variables: document.querySelector("#variables"),
  userAttestation: document.querySelector("#userAttestation")
};

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

async function readUploadedFile(file) {
  const content = await file.text();
  return formatUploadedDictionary(file.name, content);
}

async function handleLocalUpload() {
  const [file] = localDictionaryFile.files;
  if (!file) return;

  fields.localDataset.value = await readUploadedFile(file);
  localFileStatus.textContent = `Uploaded ${file.name}`;
}

async function handleCandidateUpload() {
  const files = Array.from(candidateDictionaryFiles.files);
  if (!files.length) return;

  const dictionaries = await Promise.all(files.map(readUploadedFile));
  fields.candidateDatasets.value = dictionaries.join("\n\n");
  candidateFileStatus.textContent = `Uploaded ${files.length} file${files.length === 1 ? "" : "s"}`;
}

function loadSample() {
  Object.entries(sample).forEach(([key, value]) => {
    fields[key].value = value;
  });
  localDictionaryFile.value = "";
  candidateDictionaryFiles.value = "";
  localFileStatus.textContent = "Sample dictionary loaded";
  candidateFileStatus.textContent = "Sample dictionaries loaded";
  fields.userAttestation.checked = true;
}

function collectInput() {
  return {
    mode: "cohort",
    question: fields.question.value.trim(),
    diseaseArea: fields.diseaseArea.value.trim(),
    analysisGoal: fields.analysisGoal.value,
    localDataset: fields.localDataset.value.trim(),
    candidateDatasets: fields.candidateDatasets.value.trim(),
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
                <td colspan="7">${escapeHtml(row.rationale)}</td>
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
  const response = await fetch("api/analyze", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });

  if (!response.ok) {
    throw new Error("Live model is not configured or did not return a report.");
  }

  return response.json();
}

document.querySelector("#loadSampleButton").addEventListener("click", loadSample);
localDictionaryFile.addEventListener("change", handleLocalUpload);
candidateDictionaryFiles.addEventListener("change", handleCandidateUpload);

document.querySelector("#clearButton").addEventListener("click", () => {
  form.reset();
  localDictionaryFile.value = "";
  candidateDictionaryFiles.value = "";
  localFileStatus.textContent = "No file uploaded";
  candidateFileStatus.textContent = "No files uploaded";
  report.classList.add("hidden");
  emptyState.classList.remove("hidden");
  downloadButton.disabled = true;
  downloadCrosswalkButton.disabled = true;
  latestReport = null;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!fields.userAttestation.checked) {
    alert("Please confirm you are authorized to use these data dictionaries before generating a report.");
    return;
  }

  const input = collectInput();
  const submitButton = form.querySelector("button[type='submit']");
  submitButton.disabled = true;
  submitButton.textContent = "Generating...";

  try {
    latestReport = await requestLlmReport(input);
  } catch {
    latestReport = analyzeFeasibility(input);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Generate Crosswalk";
  }

  renderReport(latestReport);
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
