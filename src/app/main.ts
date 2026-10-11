import "./style.css";
import { APP_REVISION, APP_VERSION } from "./build";
import { buildQuestionRequest } from "./request";
import { renderQueryStory, renderQueryCost } from "./query-story";
import { evidenceSummary } from "./evidence-language";
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
<header><a class="brand" href="${import.meta.env.BASE_URL}" target="_top"><span class="brand-mark">k</span><span>kev / webgpu<small>← 返回机制图解 · 本地故障排查</small></span></a><div class="header-tags"><a class="pill" href="${import.meta.env.BASE_URL}decision-models/" target="_top">模型入门 ↗</a><span class="pill">合成故障案例</span><span class="pill">KEV 0.8B · Q8</span></div></header>
<main><section class="demo-intro"><div class="eyebrow">别只看 AI 的答案，看看答案怎么来的</div><h1>一次查询，<em>从输入到结果。</em></h1><p>Kev 在浏览器里读取观察、比较候选原因，并给出排序。<br>通过一个真实运行过的案例，看看它做了什么、哪里会错，以及要付出多少成本。</p></section>
<div class="mode-switch" role="tablist" aria-label="演示方式"><button id="mode-story" role="tab" aria-selected="true" aria-controls="query-story">01 看懂一次真实查询 <span>无需下载模型</span></button><button id="mode-live" role="tab" aria-selected="false" aria-controls="live-query">02 用本机运行新查询 <span>主动加载后才推理</span></button></div>
<section id="query-story" role="tabpanel" aria-labelledby="mode-story" aria-busy="true"><p>正在读取已保存的真实运行记录…</p></section>
<section id="live-query" role="tabpanel" aria-labelledby="mode-live" hidden>
<div class="live-introduction"><h2>这次由你提供输入。</h2><p>在这里提交新的本机查询，结果与历史回放独立。你可以分阶段加入合成样本中的观察，也可以导入自己整理的 JSON。每次点击分析，提交当前勾选的证据、1 个问题和 8 个候选原因的定义。</p><p class="live-caution">当前合成开发集仅 8/34 命中。用于学习与验证，模型选择仍需结合事实人工复核。</p></div>
<nav class="query-map live-map" aria-label="实时查询流程"><a href="#live-input"><b>01</b><span>INPUT<strong id="live-input-count">选择证据</strong></span><i>→</i></a><a href="#runtime-controls"><b>02</b><span>MODEL<strong>加载模型 → 提交分析</strong></span><i>→</i></a><a href="#live-output"><b>03</b><span>OUTPUT<strong>查看 8 个候选分数</strong></span><i>→</i></a><a href="#live-outcome"><b>04</b><span>OUTCOME<strong>核对证据 → 人工判断</strong></span></a></nav>
<section class="runtime-panel" id="runtime-controls" aria-label="Model controls"><div><div class="eyebrow">② 模型准备 · 在你的设备执行</div><strong id="runtime-state">模型尚未加载</strong><p id="runtime-detail">首次约 827 MB · 点击加载后先检查 WebGPU 能力，再下载</p></div><div class="runtime-actions"><button id="load" class="primary">加载本机模型</button><button id="cancel" disabled>取消</button><button id="unload" disabled>卸载模型</button><button id="clear-cache">清除模型缓存</button></div><progress id="download-progress" hidden></progress></section>
<p class="runtime-explanation">kev.js 编码文本 → ONNX Runtime 的 WASM 核心安排计算 → WebGPU 执行模型主干 → CPU 候选评分模块给出分数。只有点击分析才进行推理；证据不发送到远程推理服务。</p>
<div id="notice" role="status" aria-live="polite" hidden></div>
<div class="workspace"><section class="evidence-panel" id="live-input"><div class="section-top"><div><div class="eyebrow">01 / INPUT</div><h2>① 你给模型哪些观察？</h2></div><label class="text-button">导入 JSON<input id="import" type="file" accept="application/json,.json" hidden></label></div>
<label class="field-label" for="case">选择合成故障案例</label><select id="case" aria-label="Synthetic incident"></select><div id="stages" class="stages"></div><p id="symptom" class="symptom"></p><div class="topology"><span>DPC 编排</span>→<span>ESXi 服务器</span>→<span>iSCSI 网络</span>→<span>PowerStore 存储</span></div><div class="section-top evidence-heading"><h3>待提交的事实证据</h3><span id="selection-count" class="muted"></span></div><p class="microcopy">勾选要提交的观察。中文摘要由原始字段转写，可逐条展开查看明细；这是模型的输入，并非模型生成的分析。</p><div id="evidence-list"></div><details><summary>编辑原始证据（JSON）</summary><textarea id="json-editor" spellcheck="false" aria-label="Evidence JSON editor"></textarea><button id="apply-json">校验并应用编辑</button><p class="microcopy">编辑会立即将旧预测标为过期。应用并通过校验后，才能再次分析。</p></details><details><summary>查看模型实际读取文本与长度限制</summary><p class="microcopy">背景（state）包含故障现象、设备关系、所选证据与术语定义；问题（questions）包含具体提问和全部候选定义。</p><pre id="state-preview"></pre><pre id="question-preview"></pre><p id="token-usage">实际 token 数由加载后的 Kev 编码器测量。</p><button id="measure" disabled>测量编码后的输入量</button></details><div class="live-question"><strong>本次问题</strong><p>“根据这些观察，哪个原因最能解释当前故障？”</p><span>8 个固定候选，包含证据不足、多种原因及无存储故障。</span></div><button id="analyze" class="primary analyze" disabled>提交 1 次原因查询 <span>↗</span></button><p class="microcopy">先加载模型，再提交查询。一次比较全部候选；页面不会自动开始推理。</p></section>
<section class="results-panel" id="live-output"><div class="section-top"><div><div class="eyebrow">03 / OUTPUT</div><h2>③ 查看模型输出与候选得分</h2></div><span id="freshness" class="pill">尚无预测</span></div><div id="prediction" class="prediction-empty"><span class="empty-mark">◎</span><h3>等待一次真实查询</h3><p>选择证据 → 加载模型 → 提交原因查询。<br>这里将显示选中项和全部 8 个候选分数。<br>历史示例不会被填入当前结果。</p></div><section id="live-outcome"><div class="eyebrow">04 / OUTCOME</div><h3>④ 核对证据，再决定下一步</h3><div id="outcome"><p>对照支持与反对证据，复核模型的选择。你会得到一份可检查、可导出的判断记录；页面不会自动修复设备。</p></div></section><section id="rules-section"><div class="section-top"><h3>对当前输入做独立规则核对</h3><span class="pill subtle">页面规则 · 非模型推理</span></div><p class="microcopy">逐一查看候选的支持证据、反对证据和缺失信息。这些规则独立执行，不修改模型得分，也不代表模型内部的思考过程。</p><div id="conflicts"></div><div id="rules"></div></section><section class="next-section"><h3>还缺什么检查？</h3><p class="microcopy">让 Kev 从只读检查清单中推荐一项。它会另发一次模型查询，单独记录耗时；只给建议，不执行检查。</p><button id="next-check" disabled>提交 1 次下一步检查查询</button><div id="next-result"></div></section><details><summary>原始响应数据与版本追溯</summary><pre id="raw">尚未运行推理。</pre></details><button id="export" disabled>导出输入、模型输出与复核记录 ↓</button></section></div>
<section class="live-cost-section"><div class="eyebrow">资源消耗 / 最近一次实际查询</div><h2>本次查询消耗了什么？</h2><div id="live-cost"><p>等待真实查询完成。这里会显示耗时、实际输入 token 数和成本说明；首次约 827 MB 下载另计，能耗与金额尚未测量。</p></div></section>
</section>
<footer><strong>合成案例 · 决策辅助 · 需要人工复核</strong><p>限 VMware vSphere、iSCSI 与 VMFS 场景。候选分数未经 PowerStore 诊断正确率校准。GPU 执行成功不等于故障判断正确。</p><span>Domain pack <span id="domain-version"></span> · 无统计追踪 · 无外部字体</span><details><summary>领域资料来源</summary><div id="domain-sources"></div></details></footer></main>`;
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
let lastQuery: any = null;
let lastQueryKind = "原因查询";
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
    ? "正在你的设备上处理…"
    : loaded
      ? "Kev q8 已就绪 · 使用 WebGPU"
      : "模型尚未加载";
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
    ? "已过期 · 输入有变化"
    : "尚无预测";
  $("freshness").className = "pill" + (result ? " stale" : "");
  if (lastQuery) { lastQuery.stale = true; showLiveCost(); }
  if (result) renderOutcome();
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
      `已选 ${selected.size} 条 · 排除 ${state.excludedCount} 条（最多 12）`;
    $("live-input-count").textContent = `${selected.size} 条证据 + 1 个问题`;
    $("question-preview").textContent = JSON.stringify(request("probable_cause").questions, null, 2);
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
      text("p", evidenceSummary(e), "evidence-summary"),
    );
    const rawFacts = document.createElement("details");
    rawFacts.append(text("summary", "查看原始字段"), text("pre", JSON.stringify(e.facts, null, 2)));
    row.append(rawFacts);
    if (e.excerpt) row.append(text("p", e.excerpt, "excerpt"));
    list.append(row);
  }
  void refresh();
}
function refs(ids: string[], label: string, parent: HTMLElement) {
  const line = text("p", `${label}: `, "microcopy");
  if (!ids.length) line.append(text("span", "尚未发现"));
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
    refs(r.supportingIds, "支持证据", d);
    refs(r.contradictingIds, "反对证据", d);
    for (const missing of r.missingObservations)
      d.append(text("p", `缺失观察：${missing}`, "microcopy"));
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
  card.replaceChildren(text("div", "模型原始得分 · 候选之间的偏好，不是正确率", "eyebrow"));
  const id = answer.choice;
  card.append(text("h3", CANDIDATES.find((c) => c.id === id)?.label || id));
  const probabilities = Object.entries(
    answer.probabilities as Record<string, number>,
  ).sort((a, b) => b[1] - a[1]);
  const facts = text(
    "p",
    `选中项的候选分数 ${(answer.probabilities[id] * 100).toFixed(2)}% · 原始 confidence ${answer.confidence}（不是正确率）`,
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
      `独立核对状态：${getReviewStatus(cross, id as any)} · 需要人工复核`,
      "review",
    ),
  );
  card.append(
    text(
      "p",
      result.stale
        ? "已过期：这个预测及复核属于之前保留的输入快照。证据台与规则区显示的是当前输入。"
        : "独立规则不会更改或纠正以上模型输出；这 8 个候选不覆盖所有实际故障。",
      "microcopy",
    ),
  );
  $("freshness").textContent = result.stale
    ? "已过期 · 输入有变化"
    : "当前输入";
  $("freshness").className = "pill" + (result.stale ? " stale" : "");
  $("raw").textContent = JSON.stringify(result, null, 2);
  renderOutcome();
  buttons();
}
function showLiveCost() {
  if (!lastQuery) return;
  renderQueryCost($("live-cost"), lastQuery, `${lastQuery.stale ? "已过期输入的实测，不代表当前编辑内容" : "本机本次实测"} · ${lastQueryKind} · ${lastQuery.includedIds.length} 条证据`);
}
function renderOutcome() {
  if (!result) return;
  const choice = result.response.answers.probable_cause.choice;
  const report = evaluateEvidence(result.inputSnapshot, result.includedIds);
  const finding = report.candidates.find(c => c.candidateId === choice);
  const host = $("outcome");
  host.replaceChildren();
  if (result.stale) host.append(text("p", "已过期：此处复核的是上次查询保留的输入快照，不是当前编辑的证据。", "conflict"));
  host.append(text("strong", finding?.contradictingIds.length ? "模型选择存在反对证据，不能据此确认故障。" : "得到一个待验证的候选原因，仍需人工核对。"));
  if (finding) {
    host.append(text("p", `针对这次模型选择，独立规则找到 ${finding.supportingIds.length} 条支持证据、${finding.contradictingIds.length} 条反对证据，以及 ${finding.missingObservations.length} 项待补充观察。`));
    host.append(text("p", `支持：${finding.supportingIds.join("、") || "尚无"}；反对：${finding.contradictingIds.join("、") || "尚无"}。对应内容保存在下方原始报告的 inputSnapshot 中。`, "microcopy"));
  }
  host.append(text("p", "你可以导出输入快照、候选分数与证据核对记录。先人工复核；需要更多线索时，再请求下一步只读检查建议。本页面没有执行检查、修改配置或修复故障。"));
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
    if (r === revision && question === "probable_cause") {
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
    lastQuery = saved;
    lastQueryKind = question === "probable_cause" ? "原因查询" : "下一步检查查询";
    showLiveCost();
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
        : `本次真实查询已完成，用时 ${out.wallMs.toFixed(0)} ms。结果与成本已按本次输入快照保留。`,
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
    ? `实际编码：证据前缀 ${usage.stateTokens}/1024 · 每个问题（含前缀）${usage.branchTokens.join(", ")}/1536 · 总编码输入 ${usage.totalTokens} tokens`
    : "加载模型后，由实际 Kev 编码器测量 token 数；此处不会估算。";
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
      `首次准备约 ${(826680926 / 1e6).toFixed(1)} MB · 固定单个文本 q8 模型 · 先检查设备能力`;
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

function setMode(mode: "story" | "live") {
  $("query-story").hidden = mode !== "story";
  $("live-query").hidden = mode !== "live";
  $("mode-story").setAttribute("aria-selected", String(mode === "story"));
  $("mode-live").setAttribute("aria-selected", String(mode === "live"));
}
$("mode-story").onclick = () => setMode("story");
$("mode-live").onclick = () => setMode("live");
void renderQueryStory($("query-story")).finally(() => {
  $("query-story").setAttribute("aria-busy", "false");
  const button = $("story-try-live");
  if (button) button.onclick = () => { setMode("live"); $("mode-live").scrollIntoView({ behavior: "smooth", block: "start" }); };
});
void init();
