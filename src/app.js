import { analyzeFeasibility } from "./analysisEngine.js";

const sample = {
  question: "Are response, survival, treatment, and immune-signature variables defined similarly enough across melanoma immunotherapy cohorts for harmonized analysis?",
  diseaseArea: "Melanoma",
  analysisGoal: "harmonized-pooling",
  localDataset: "local_age: age at anti-PD-1 start, years\nsex: sex assigned at birth, coded Female/Male\nstage_at_tx: AJCC stage at treatment start, coded III/IV\nline_of_therapy: treatment line number at anti-PD-1 start\nresponse_recist: best overall response by RECIST 1.1, coded CR/PR/SD/PD\npfs_months: months from anti-PD-1 start to progression or death, censored at last follow-up\nos_months: months from anti-PD-1 start to death, censored at last contact\nimmune_signature_score: RNA-derived interferon-gamma signature, continuous z-score",
  candidateDatasets: "GEO GSE91061 data dictionary: age = age at treatment, years; gender = male/female; stage = melanoma stage; prior_treatment = previous systemic therapy; response = RECIST response CR/PR/SD/PD; pfs = progression-free survival in months; os = overall survival in months; rnaseq_platform = bulk RNA-seq platform\n\nGEO GSE78220 data dictionary: age_years = age at biopsy; sex = F/M; treatment = anti-PD-1; response_group = responder/non-responder, response criteria described in publication; survival_time = months follow-up; survival_status = alive/dead; expression_signature = immune expression score, unit unclear\n\nTCGA-SKCM data dictionary: age_at_diagnosis = age in days; gender = female/male; pathologic_stage = AJCC stage; treatment_response = mostly unavailable; days_to_death and days_to_last_follow_up available; RNA-seq expression available; immunotherapy exposure unclear",
  variables: "age, sex, stage, treatment line, RECIST response, progression-free survival, overall survival, immune signature score"
};

let latestReport = null;

const form = document.querySelector("#analysisForm");
const report = document.querySelector("#report");
const emptyState = document.querySelector("#emptyState");
const downloadButton = document.querySelector("#downloadButton");
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
  variables: document.querySelector("#variables")
};

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
}

function collectInput() {
  return {
    mode: "cohort",
    question: fields.question.value.trim(),
    diseaseArea: fields.diseaseArea.value.trim(),
    analysisGoal: fields.analysisGoal.value,
    localDataset: fields.localDataset.value.trim(),
    candidateDatasets: fields.candidateDatasets.value.trim(),
    variables: fields.variables.value.trim()
  };
}

function renderReport(data) {
  emptyState.classList.add("hidden");
  report.classList.remove("hidden");
  downloadButton.disabled = false;
  report.innerHTML = `
    <article class="report-card score">
      <div class="score-ring" style="--score: ${data.feasibilityScore}%">${data.feasibilityScore}</div>
      <div>
        <span class="recommendation">${data.recommendation}</span>
        <p>${data.candidateCount} candidate data dictionar${data.candidateCount === 1 ? "y" : "ies"} assessed. ${data.llmStatus}</p>
      </div>
    </article>

    <article class="report-card">
      <h3>Data Dictionary Comparison</h3>
      <div class="dimension-grid">
        ${data.dimensions.map((item) => `
          <div class="dimension-row">
            <strong>${item.name}</strong>
            <div class="bar" aria-label="${item.name} score ${item.score}">
              <span style="--width: ${item.score}%"></span>
            </div>
            <span>${item.score}</span>
          </div>
        `).join("")}
      </div>
    </article>

    <article class="report-card">
      <h3>Variable-Level Findings</h3>
      <ul>${data.variableFindings.map((finding) => `<li>${finding}</li>`).join("")}</ul>
    </article>

    <article class="report-card">
      <h3>Harmonization Flags</h3>
      <ul>${data.flags.map((flag) => `<li>${flag}</li>`).join("")}</ul>
    </article>

    <article class="report-card">
      <h3>Recommended Next Steps</h3>
      <ul>${data.nextSteps.map((step) => `<li>${step}</li>`).join("")}</ul>
    </article>
  `;
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
  latestReport = null;
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  latestReport = analyzeFeasibility(collectInput());
  renderReport(latestReport);
});

downloadButton.addEventListener("click", () => {
  if (!latestReport) return;
  const blob = new Blob([JSON.stringify(latestReport, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "cohortai-feasibility-report.json";
  anchor.click();
  URL.revokeObjectURL(url);
});
