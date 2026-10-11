import "./style.css";
import { APP_REVISION, APP_VERSION } from "./build";
import { buildQuestionRequest } from "./request";
import {
  parseEvidenceBundle,
  parseEvidenceJson,
  buildModelState,
  hashEvidence,
  getCaseStage,
  type EvidenceBundle,
} from "../evidence";
import {
  CANDIDATES,
  CAUSE_CRITERIA,
  NEXT_CHECKS,
  SOURCES,
  DOMAIN_VERSION,
  evaluateEvidence,
  getReviewStatus,
} from "../domain";
import { KevClient } from "../runtime/client";
import type { SystemOneRequest } from "@ai-ecoverse/kev.js";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
<header><a class="brand" href="${import.meta.env.BASE_URL}" target="_top"><span class="brand-mark">k</span><span>kev / webgpu<small>← 返回机制图解 · LOCAL RCA</small></span></a><div class="header-tags"><span class="pill">SYNTHETIC DEMO</span><span class="pill">KEV 0.8B · Q8</span></div></header>
<main><section class="intro"><div><div class="eyebrow">EVIDENCE FIRST. HUMAN REVIEW ALWAYS.</div><h1>从一份证据，<br>到下一步判断。</h1><p>先选择合成案例与证据，再点击 Load 加载本机模型，最后点击 Analyze。Kev 比较候选原因，独立规则帮你核对支持与反对证据。</p></div><aside class="privacy-note"><span class="privacy-icon">↳</span><strong>真实本机推理</strong><p>首次下载约 827 MB。证据留在页面内存中；应用不连接真实设备，也不调用云端推理。</p><small>当前 RCA 开发集 8/34，语义验收未通过。用于学习和研究。</small></aside></section>
<section class="runtime-panel" aria-label="Model controls"><div><div class="eyebrow">INFERENCE ENGINE</div><strong id="runtime-state">Model not loaded</strong><p id="runtime-detail">Load only when ready · checking locked artifact size</p></div><div class="runtime-actions"><button id="load" class="primary">Load local model</button><button id="cancel" disabled>Cancel</button><button id="unload" disabled>Unload</button><button id="clear-cache">Clear model cache</button></div><progress id="download-progress" hidden></progress></section>
<div id="notice" role="status" aria-live="polite" hidden></div>
<div class="workspace"><section class="evidence-panel"><div class="section-top"><div><div class="eyebrow">01 / OBSERVATIONS</div><h2>The evidence desk</h2></div><label class="text-button">Import JSON<input id="import" type="file" accept="application/json,.json" hidden></label></div>
<label class="field-label" for="case">SYNTHETIC INCIDENT</label><select id="case" aria-label="Synthetic incident"></select><div id="stages" class="stages"></div><p id="symptom" class="symptom"></p><div class="topology"><span>DPC</span>→<span>vCenter / ESXi</span>→<span>iSCSI A · B</span>→<span>PowerStore / VMFS</span></div><div class="section-top evidence-heading"><h3>Timeline</h3><span id="selection-count" class="muted"></span></div><p class="microcopy">Choose the observations to include. Nothing is silently discarded.</p><div id="evidence-list"></div><details><summary>Edit evidence JSON</summary><textarea id="json-editor" spellcheck="false" aria-label="Evidence JSON editor"></textarea><button id="apply-json">Validate & apply edits</button><p class="microcopy">Edits mark earlier predictions stale immediately. Apply to validate and analyze.</p></details><details><summary>Exact model input & token budget</summary><pre id="state-preview"></pre><p id="token-usage">Actual token counts are measured by the loaded Kev encoder.</p><button id="measure" disabled>Measure encoded input</button></details><button id="analyze" class="primary analyze" disabled>Analyze current evidence <span>↗</span></button><p class="microcopy">One question, one real inference. Nothing runs automatically.</p></section>
<section class="results-panel"><div class="section-top"><div><div class="eyebrow">02 / ASSESSMENT</div><h2>Keep the uncertainty visible.</h2></div><span id="freshness" class="pill">NO PREDICTION</span></div><div id="prediction" class="prediction-empty"><span class="empty-mark">◎</span><h3>Ready for an evidence-led assessment</h3><p>Browse the incident, load Kev, then analyze.<br>No predictions are pre-filled.</p></div><section id="rules-section"><div class="section-top"><h3>Rule-based evidence cross-check</h3><span class="pill subtle">INDEPENDENT OF MODEL</span></div><p class="microcopy">Support, counter-evidence, and gaps for every candidate. These checks use the current evidence selection, not the model’s internal reasoning.</p><div id="conflicts"></div><div id="rules"></div></section><section class="next-section"><h3>Suggested verification</h3><p class="microcopy">Ask Kev to choose an allowlisted, read-only check that reduces remaining uncertainty. This does not execute anything.</p><button id="next-check" disabled>Suggest next check</button><div id="next-result"></div></section><details><summary>Raw upstream response & provenance</summary><pre id="raw">No inference has run.</pre></details><button id="export" disabled>Export local report ↓</button></section></div>
<footer><strong>Synthetic demo · Decision support, never automatic remediation</strong><p>VMware vSphere · iSCSI · VMFS only. Candidate probabilities are not calibrated PowerStore correctness rates. GPU execution and diagnostic quality require validation on your actual device.</p><span>Domain pack <span id="domain-version"></span> · No analytics · No external fonts</span><details><summary>Domain sources</summary><div id="domain-sources"></div></details></footer></main>`;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const text = (tag: string, value: string, cls?: string) => {
  const e = document.createElement(tag);
  e.textContent = value;
  if (cls) e.className = cls;
  return e;
};
let bundle: EvidenceBundle | null = null,
  original: EvidenceBundle | null = null,
  selected = new Set<string>();
let loaded = false,
  busy = false,
  dirty = false,
  caseLoading = false,
  revision = 0,
  currentHash = "",
  caseRequest = 0,
  operation = 0;
let result: any = null,
  nextResult: any = null,
  usage: any = null;
const client = new KevClient((event: any) => {
  if (event.type === "progress") {
    const p = $<HTMLProgressElement>("download-progress");
    p.hidden = false;
    if (event.total) {
      p.max = event.aggregateTotal || event.total;
      p.value = event.aggregateLoaded || event.loaded || 0;
    }
    $("runtime-detail").textContent =
      event.message ||
      `${event.file || "Model files"} · ${event.loaded || 0} bytes`;
  } else if (event.type === "status" && event.status === "unloaded") {
    loaded = false;
    buttons();
  } else if (event.type === "deviceLost") {
    operation++;
    loaded = false;
    void client.unload().catch((e) => notify(String(e), true));
    notify(
      "GPU device lost. Releasing the session; load again to create a fresh one.",
    );
    buttons();
  } else if (event.message) $("runtime-detail").textContent = event.message;
});
function notify(message: string, error = false) {
  $("notice").hidden = false;
  $("notice").textContent = message;
  $("notice").className = error ? "error" : "info";
}
function buttons() {
  for (const id of ["analyze", "measure", "next-check"])
    $<HTMLButtonElement>(id).disabled =
      !loaded ||
      busy ||
      caseLoading ||
      !bundle ||
      dirty ||
      !selected.size ||
      selected.size > 12;
  $<HTMLButtonElement>("load").disabled = loaded || busy;
  $<HTMLButtonElement>("unload").disabled = !loaded || busy;
  $<HTMLButtonElement>("cancel").disabled = !busy;
  $<HTMLButtonElement>("clear-cache").disabled = busy || loaded;
  $<HTMLButtonElement>("export").disabled = !result;
  $("runtime-state").textContent = busy
    ? "Working on your device…"
    : loaded
      ? "Kev q8 ready · WebGPU requested"
      : "Model not loaded";
}
function stale() {
  revision++;
  usage = null;
  showUsage();
  result && (result.stale = true);
  if (result) $("raw").textContent = JSON.stringify(result, null, 2);
  nextResult && (nextResult.stale = true);
  if (nextResult && !$("next-result").querySelector(".conflict"))
    $("next-result").prepend(
      text(
        "p",
        "STALE · This suggestion belongs to earlier evidence.",
        "conflict",
      ),
    );
  $("freshness").textContent = result
    ? "STALE · INPUT CHANGED"
    : "NO PREDICTION";
  $("freshness").className = "pill" + (result ? " stale" : "");
  buttons();
}
function request(question: "probable_cause" | "next_check"): SystemOneRequest {
  if (!bundle) throw Error("Choose an evidence bundle first.");
  return buildQuestionRequest(bundle, [...selected], question);
}
async function refresh() {
  if (!bundle) return;
  const r = revision;
  try {
    const state = buildModelState(bundle, [...selected]);
    $("state-preview").textContent = state.state;
    $("selection-count").textContent =
      `${selected.size} / 12 selected · ${state.excludedCount} excluded`;
    const hash = await hashEvidence(bundle, [...selected]);
    if (r === revision) currentHash = hash;
  } catch (e) {
    $("state-preview").textContent = String(e);
    notify(String(e), true);
  }
  if (selected.size <= 12) renderRules();
  else {
    $("rules").replaceChildren(
      text(
        "p",
        "Select at most 12 evidence items before evaluating the input.",
        "conflict",
      ),
    );
  }
  buttons();
}
function showBundle(b: EvidenceBundle) {
  caseLoading = false;
  bundle = b;
  selected = new Set(b.evidence.map((e) => e.id));
  dirty = false;
  usage = null;
  stale();
  $("symptom").textContent = b.incident.symptom;
  $<HTMLTextAreaElement>("json-editor").value = JSON.stringify(b, null, 2);
  const list = $("evidence-list");
  list.replaceChildren();
  for (const e of [...b.evidence].sort(
    (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
  )) {
    const row = text("article", "", "evidence-card");
    row.id = `evidence-${e.id}`;
    const label = document.createElement("label");
    const check = document.createElement("input");
    check.type = "checkbox";
    check.checked = true;
    check.setAttribute("aria-label", `Include ${e.id}`);
    check.onchange = () => {
      check.checked ? selected.add(e.id) : selected.delete(e.id);
      stale();
      void refresh();
    };
    label.append(
      check,
      text("strong", e.id),
      text("span", e.kind.replaceAll("_", " "), "kind"),
    );
    row.append(
      label,
      text(
        "p",
        `${e.entityId} · ${e.pathId || "no path"} · ${e.temporalState}`,
        "microcopy",
      ),
      text("time", e.observedAt),
      text("pre", JSON.stringify(e.facts, null, 2)),
    );
    if (e.excerpt) row.append(text("p", e.excerpt, "excerpt"));
    list.append(row);
  }
  void refresh();
}
function refs(ids: string[], label: string, parent: HTMLElement) {
  const line = text("p", `${label}: `, "microcopy");
  if (!ids.length) line.append(text("span", "none established"));
  for (const id of ids) {
    const a = document.createElement("a");
    a.href = `#evidence-${id}`;
    a.textContent = id;
    a.className = "evidence-ref";
    line.append(a);
  }
  parent.append(line);
}
function renderRules() {
  if (!bundle) return;
  const report = evaluateEvidence(bundle, [...selected]);
  const host = $("rules");
  host.replaceChildren();
  for (const r of report.candidates) {
    const d = document.createElement("details");
    const candidate = CANDIDATES.find((c) => c.id === r.candidateId);
    d.append(text("summary", candidate?.label || r.candidateId));
    refs(r.supportingIds, "Supporting", d);
    refs(r.contradictingIds, "Contradicting", d);
    for (const missing of r.missingObservations)
      d.append(text("p", `Missing: ${missing}`, "microcopy"));
    for (const f of r.findings)
      d.append(
        text("p", typeof f === "string" ? f : JSON.stringify(f), "microcopy"),
      );
    host.append(d);
  }
  $("conflicts").replaceChildren(
    ...report.conflicts.map((c) => text("p", c, "conflict")),
  );
}
function renderPrediction() {
  if (!result) return;
  const answer = result.response.answers.probable_cause;
  const card = $("prediction");
  card.className = "prediction-card";
  card.replaceChildren(text("div", "MODEL PREDICTION", "eyebrow"));
  const id = answer.choice;
  card.append(text("h3", CANDIDATES.find((c) => c.id === id)?.label || id));
  const probabilities = Object.entries(
    answer.probabilities as Record<string, number>,
  ).sort((a, b) => b[1] - a[1]);
  const facts = text(
    "p",
    `Upstream confidence: ${answer.confidence} · Selected-option probability: ${answer.probabilities[id]}`,
    "microcopy",
  );
  card.append(facts);
  for (const [i, [key, p]] of probabilities.entries()) {
    const row = text("div", "", "probability-row" + (i < 3 ? " top" : ""));
    row.append(
      text(
        "span",
        `${i + 1}. ${CANDIDATES.find((c) => c.id === key)?.label || key}`,
      ),
      text("strong", `${(p * 100).toFixed(2)}%`),
    );
    const bar = document.createElement("progress");
    bar.max = 1;
    bar.value = p;
    row.append(bar);
    card.append(row);
  }
  const cross = evaluateEvidence(result.inputSnapshot, result.includedIds);
  card.append(
    text(
      "p",
      `Review: ${getReviewStatus(cross, id as any)} · Human review required`,
      "review",
    ),
  );
  card.append(
    text(
      "p",
      result.stale
        ? "STALE: this prediction and review belong to the retained input snapshot. The evidence desk and rule panel show current input."
        : "Evidence cross-check does not change or correct this prediction. The candidate set is not exhaustive.",
      "microcopy",
    ),
  );
  $("freshness").textContent = result.stale
    ? "STALE · INPUT CHANGED"
    : "CURRENT INPUT";
  $("freshness").className = "pill" + (result.stale ? " stale" : "");
  $("raw").textContent = JSON.stringify(result, null, 2);
  buttons();
}
async function run(question: "probable_cause" | "next_check") {
  if (!bundle || dirty) return;
  const op = ++operation;
  const r = revision;
  const snapshot = structuredClone(bundle);
  const ids = [...selected];
  const req = request(question);
  busy = true;
  buttons();
  try {
    const hash = await hashEvidence(snapshot, ids);
    if (op !== operation)
      throw Error("Cancelled before inference was submitted.");
    const out = await client.analyze(req, hash);
    if (r === revision) {
      usage = out.usage;
      showUsage();
    }
    const saved = {
      ...out,
      appRevision: APP_REVISION,
      appVersion: APP_VERSION,
      includedIds: ids,
      excludedCount: snapshot.evidence.length - ids.length,
      inputSnapshot: snapshot,
      domainVersion: DOMAIN_VERSION,
      stale: r !== revision,
    };
    if (question === "probable_cause") {
      result = saved;
      renderPrediction();
    } else {
      nextResult = saved;
      const answer = out.response.answers.next_check as any;
      const check = NEXT_CHECKS.find((c) => c.id === answer.choice);
      $("next-result").replaceChildren(
        text("h4", check?.label || answer.choice),
        text(
          "p",
          check?.text || "Unknown check; no instruction will be generated.",
        ),
        text(
          "p",
          `Upstream confidence: ${answer.confidence} · ${saved.stale ? "STALE input" : "Current input"}`,
          "microcopy",
        ),
      );
    }
    notify(
      saved.stale
        ? "Input changed during inference. The response is retained as STALE and bound to its input snapshot; analyze the current evidence again."
        : `Real inference completed in ${out.wallMs.toFixed(0)} ms. GPU operator profiling is a separate validation requirement.`,
    );
  } catch (e) {
    notify(String(e), true);
  } finally {
    busy = false;
    buttons();
  }
}
function showUsage() {
  $("token-usage").textContent = usage
    ? `Actual encoder: state ${usage.stateTokens}/1024 · state + question ${usage.branchTokens.join(", ")}/1536 · encoded total ${usage.totalTokens}`
    : "Actual token counts require the loaded Kev encoder.";
}
$("analyze").onclick = () => void run("probable_cause");
$("next-check").onclick = () => void run("next_check");
$("measure").onclick = async () => {
  const r = revision;
  const req = request("probable_cause");
  busy = true;
  buttons();
  try {
    const measured = await client.measure(req);
    if (r === revision) {
      usage = measured;
      showUsage();
    } else
      notify("Input changed while measuring. Measure the new selection again.");
  } catch (e) {
    notify(String(e), true);
  } finally {
    busy = false;
    buttons();
  }
};
$("load").onclick = async () => {
  const op = ++operation;
  busy = true;
  buttons();
  try {
    const probe = await client.probe();
    if (op !== operation) throw Error("Loading cancelled before download.");
    if (!probe.available)
      throw Error(`${probe.code || "WEBGPU_UNAVAILABLE"}: ${probe.message}`);
    await client.load();
    if (op !== operation) {
      await client.unload();
      throw Error("Loading cancelled.");
    }
    loaded = true;
    notify(
      "Kev q8 loaded. Evidence is analyzed only when you click a question.",
    );
  } catch (e) {
    loaded = false;
    notify(String(e), true);
  } finally {
    busy = false;
    $("download-progress").hidden = true;
    buttons();
  }
};
$("cancel").onclick = async () => {
  operation++;
  try {
    await client.cancel();
    notify(
      "Cancellation requested. Submitted GPU work may finish; cancelled results will not be displayed.",
    );
  } catch (e) {
    notify(String(e), true);
  }
};
$("unload").onclick = async () => {
  busy = true;
  buttons();
  try {
    await client.unload();
    loaded = false;
    notify(
      "Runtime released and application references cleared. GPU driver memory reclamation is not instantaneous.",
    );
  } catch (e) {
    notify(String(e), true);
  } finally {
    busy = false;
    buttons();
  }
};
$("clear-cache").onclick = async () => {
  busy = true;
  buttons();
  try {
    await client.clearModelCache();
    notify(
      "This app’s versioned model cache was cleared. Other site caches are untouched.",
    );
  } catch (e) {
    notify(String(e), true);
  } finally {
    busy = false;
    buttons();
  }
};
$("json-editor").addEventListener("input", () => {
  dirty = true;
  stale();
  notify("Unapplied edits: validate and apply before running inference.");
});
$("apply-json").onclick = () => {
  try {
    caseRequest++;
    showBundle(parseEvidenceJson($<HTMLTextAreaElement>("json-editor").value));
    $("stages").replaceChildren();
    notify("Evidence validated locally. Previous predictions are stale.");
  } catch (e) {
    notify(String(e), true);
  }
};
$<HTMLInputElement>("import").onchange = async (event) => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const sequence = ++caseRequest;
    if (file.size > 256 * 1024)
      throw Error(
        "Import exceeds 256 KiB. Reduce the JSON file before importing.",
      );
    const imported = parseEvidenceJson(await file.text());
    if (sequence !== caseRequest) return;
    showBundle(imported);
    $("stages").replaceChildren();
    notify("JSON imported locally. No evidence was uploaded.");
  } catch (e) {
    notify(String(e), true);
  } finally {
    input.value = "";
  }
};
$("export").onclick = () => {
  if (!result || !bundle) return;
  const report = {
    schemaVersion: "1.0",
    appRevision: APP_REVISION,
    appVersion: APP_VERSION,
    synthetic: bundle.synthetic,
    exportedAt: new Date().toISOString(),
    humanReviewRequired: true,
    evidence: bundle,
    selection: [...selected],
    currentEvidenceHash: currentHash,
    prediction: result,
    nextCheck: nextResult,
    predictionCrossCheck: evaluateEvidence(
      result.inputSnapshot,
      result.includedIds,
    ),
    predictionReview: getReviewStatus(
      evaluateEvidence(result.inputSnapshot, result.includedIds),
      result.response.answers.probable_cause.choice,
    ),
    currentInputCrossCheck:
      selected.size <= 12 ? evaluateEvidence(bundle, [...selected]) : null,
    currentInputError:
      selected.size > 12 ? "Selected evidence exceeds the 12-item limit" : null,
    limitations: [
      "Synthetic decision-support demo; no diagnosis or remediation guarantee.",
      "GPU operator profiling, parity and diagnostic accuracy must be independently validated.",
    ],
  };
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "local-rca-report.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("domain-version").textContent = DOMAIN_VERSION;
for (const [id, url] of Object.entries(SOURCES)) {
  const a = document.createElement("a");
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.textContent = id;
  a.className = "evidence-ref";
  $("domain-sources").append(a);
}
async function init() {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}cases/index.json`);
    if (!res.ok) throw Error("Could not load the synthetic case index.");
    const data = await res.json();
    const cases = Array.isArray(data) ? data : data.cases;
    const selector = $<HTMLSelectElement>("case");
    for (const c of cases) {
      const o = document.createElement("option");
      o.value = c.file || `${c.id}.json`;
      o.textContent = `${c.id} · ${c.title}`;
      selector.append(o);
    }
    selector.onchange = () =>
      void selectCase(selector.value).catch((e) => notify(String(e), true));
    await selectCase(selector.value);
  } catch (e) {
    notify(String(e), true);
  }
  try {
    const lock = await import("../runtime/model-lock.json");
    const value: any = lock.default;
    $("runtime-detail").textContent =
      `One text q8 model · ${(826680926 / 1e6).toFixed(1)} MB locked download · no CPU fallback`;
    void value;
  } catch {}
}
async function selectCase(file: string) {
  const sequence = ++caseRequest;
  caseLoading = true;
  stale();
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}cases/${file}`);
    if (!response.ok) throw Error("Synthetic case could not be loaded.");
    const b = parseEvidenceBundle(await response.json());
    if (sequence !== caseRequest) return;
    original = b;
    const stages = b.demoStages;
    const target = $("stages");
    target.replaceChildren();
    if (stages) {
      for (const stage of stages) {
        const btn = text("button", `Stage ${stage.label}`) as HTMLButtonElement;
        btn.onclick = () => {
          for (const el of target.children) el.classList.remove("active");
          btn.classList.add("active");
          showBundle(getCaseStage(original!, stage.id));
        };
        target.append(btn);
      }
      if (target.firstElementChild) {
        (target.firstElementChild as HTMLButtonElement).click();
        return;
      }
    }
    showBundle(b);
  } finally {
    if (sequence === caseRequest) {
      caseLoading = false;
      buttons();
    }
  }
}

void init();
