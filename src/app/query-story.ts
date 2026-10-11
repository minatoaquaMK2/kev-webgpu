import { CANDIDATES } from "../domain";
import { buildQuestionRequest } from "./request";
import { evidenceSummary } from "./evidence-language";
import type { AnalysisResult } from "../runtime/protocol";
import type { EvidenceBundle } from "../evidence";

type QueryCost = Pick<AnalysisResult, "wallMs" | "usage" | "timing">;
interface RecordedQuery extends QueryCost {
  timestamp: string;
  sourceCommit: string;
  inputSnapshot: EvidenceBundle;
  selectedIDs: string[];
  response: AnalysisResult["response"];
  gpuProof: AnalysisResult["gpuProof"];
}
function el(tag: string, value: string, cls = "") {
  const node = document.createElement(tag);
  node.textContent = value;
  node.className = cls;
  return node;
}

/** Costs stay bound to the query that actually ran, never to newly edited input. */
export function renderQueryCost(host: HTMLElement, query: QueryCost, label: string) {
  host.replaceChildren(el("p", label, "cost-scope"));
  const grid = el("div", "", "cost-grid");
  const metrics = [
    ["本次处理时间", `${(query.wallMs / 1000).toFixed(3)} 秒`, "后台计算线程完成单次推理所用的实际时间；不包含初次下载加载模型，也不代表页面从点击到渲染的全部时长。"],
    ["本次编码输入", `${query.usage.totalTokens.toLocaleString("en-US")} tokens`, "token 是模型处理文字的度量单位。此处为本地分词统计，并非任何云端按量计费。"],
    ["远程推理 API 调用", "0 次", "推理在你的设备执行，本应用没有云推理按次账单。"],
    ["本机能耗 / 金额", "未测量", "计算会占用本机显卡、CPU 和内存。电费、网络费与硬件成本尚未换算，不能把总成本写成 0 元。"],
  ];
  for (const [title, value, description] of metrics) {
    const card = el("div", "", "cost-metric");
    card.append(el("span", title), el("strong", value), el("p", description));
    grid.append(card);
  }
  host.append(grid);
  const incremental = query.usage.branchTokens.map(n => n - query.usage.stateTokens);
  host.append(el("p", `这次输入如何组成：证据与背景 ${query.usage.stateTokens} + 问题与候选 ${incremental.join(" / ")} = ${query.usage.totalTokens} tokens。其中问题分支的总计已包含背景，不能再重复加上背景数量。`, "token-equation"));
  const setup = el("div", "", "setup-cost");
  setup.append(el("strong", "首次准备 ≠ 每次查询"), el("p", "模型文件约 827 MB（826,680,926 字节）。首次使用或清除模型缓存后需要下载；加载完成后，查询直接使用内存中的权重。这里的历史回放只读取已保存记录，不下载模型。"));
  const technical = document.createElement("details");
  technical.append(el("summary", "查看这次计时口径与成本边界"), el("p", `上游状态前缀阶段 ${query.timing.state.toFixed(1)} ms；问题分支阶段 ${query.timing.branches.toFixed(1)} ms。它们是 SDK 的子阶段计时，不代表总墙钟时间的全部开销。`, "microcopy"), el("p", "一次原因查询给出 8 个候选分数和选中项，不逐字生成回答。再点“下一步检查查询”，会从 6 个只读检查候选中选择，新增一次模型查询并单独计时。峰值显存、能耗和总货币成本尚未测量。", "microcopy"));
  host.append(setup, technical);
}

export async function renderQueryStory(host: HTMLElement) {
  host.innerHTML = `
    <div class="record-banner"><span class="record-dot"></span><strong>真实历史回放</strong><span>读取已保存的本机 GPU 结果 · 回放不会触发新的推理</span></div>
    <div class="story-lead"><div><span class="eyebrow">ONE QUERY, END TO END</span><h2>新服务器连不上存储，<br>到底卡在哪一步？</h2><p>把这条链路想成货运通道：服务器通过网络读取存储。现在新加入的服务器超时，老服务器仍然能用。我们把这些观察交给 Kev，让它比较 8 个预设原因，选出最匹配的一项。</p></div><div class="incident-route" role="img" aria-label="服务器经交换机连接存储，交换机的 MTU 1500 小于两端 9000"><div><span>读取数据的机器</span><strong>ESXi 服务器</strong><small>MTU 9000</small></div><span class="route-arrow">→</span><div class="route-bottleneck"><span>传输路径</span><strong>交换机</strong><small>MTU 1500</small></div><span class="route-arrow">→</span><div><span>存放数据的设备</span><strong>PowerStore</strong><small>MTU 9000</small></div><p>MTU 可以理解为“单个数据包允许有多大”。图中是合成样本的配置记录，不是模型给出的解释。</p></div></div>
    <nav class="query-map" aria-label="一次查询的四个步骤"><a href="#story-input"><b>01</b><span>INPUT<strong>9 条观察 + 1 个问题</strong></span><i>→</i></a><a href="#story-model"><b>02</b><span>MODEL<strong>为 8 个候选打分</strong></span><i>→</i></a><a href="#story-output"><b>03</b><span>OUTPUT<strong>排序 + 选中项</strong></span><i>→</i></a><a href="#story-outcome"><b>04</b><span>OUTCOME<strong>形成待复核判断</strong></span></a></nav>
    <a class="query-cost-jump" href="#story-cost"><span>本次查询的时间与成本</span><strong id="example-cost-teaser">正在读取实测记录…</strong><span>看完整口径 ↓</span></a>
    <section id="story-input" class="story-section"><div class="story-heading"><span class="step-number">01</span><div><span class="eyebrow">输入 / 提交给模型什么</span><h2>给事实，也给问题和选项。</h2></div></div><p class="story-explain">输入来自本页提供的<strong>合成 JSON 样本</strong>：故障现象、设备关系、以下 9 条带时间和来源的观察，再加上一道选择题。真实使用时，需要你先整理这些观察；页面不会自动探测或采集设备。</p><div id="example-observations" class="observation-groups"></div><div class="query-question"><span class="eyebrow">提交的任务 · 中文释义</span><h3>“根据当前证据，哪个原因最能解释这次故障？”</h3><p>8 个候选原因及各自的定义也属于输入。预期答案只用于运行后的测试评分，不会交给模型。</p><div id="example-options" class="option-chips"></div></div><details class="exact-input"><summary>展开：这次模型真正收到的请求（含英文原文）</summary><pre id="example-request"></pre></details></section>
    <section id="story-model" class="story-section"><div class="story-heading"><span class="step-number">02</span><div><span class="eyebrow">计算环节 / 模型如何进行评估</span><h2>读入上下文，一次比较全部候选。</h2></div></div><div class="model-stations"><div><span class="station-badge">CPU · Kev.js</span><h3>① 整理并编码</h3><p>把背景、证据、问题和候选变成模型能处理的 token 编号。</p><strong>824 背景 + 238 问题 tokens</strong></div><span class="station-arrow">→</span><div><span class="station-badge">GPU · WebGPU</span><h3>② 计算模型表示</h3><p>Kev 0.8B q8 的主干执行注意力和矩阵计算，得到用于选择的数值表示。</p><strong>1 个问题包含 8 个选项</strong></div><span class="station-arrow">→</span><div><span class="station-badge">CPU · 候选评分头</span><h3>③ 产生分数</h3><p>候选评分头将表示转成每个候选的相对概率，再选出最高分。</p><strong>没有逐字生成长篇回答</strong></div></div><div class="wasm-explainer"><span class="wasm-symbol">W</span><div><h3>那 WASM 到底有什么用？</h3><p><strong>WASM 是让 ONNX Runtime 的底层运行时代码在浏览器中运行的方式。</strong>它参与模型会话、安排运算，并处理相关 CPU 工作；WebGPU 把主干中的大量矩阵和注意力运算交给显卡。两者配合，浏览器才能在本机完成推理。WASM 不是另一个模型，使用显卡也仍然需要 CPU。</p><p><strong>对使用者的意义：</strong>用浏览器就能调用本机推理引擎，无须另建云端推理服务。代价是首次模型准备，以及你这台设备的计算与内存开销。</p><p class="microcopy">上图解释实现过程，不展示模型的内心推理。当前示例固定 Kev 0.8B 文本 q8，不能切换为其他模型。</p></div></div></section>
    <div class="story-result-grid"><section id="story-output" class="story-section"><div class="story-heading"><span class="step-number">03</span><div><span class="eyebrow">输出环节 / 模型的原始得分记录</span><h2>这次，它选了“映射缺失”。</h2></div></div><p class="story-explain">存储映射好比给指定主机或主机组发放访问存储卷的通行证。有了通行证，仍需网络与读写路径正常。下面是模型为 8 个候选原因给出的真实分数。<strong>分数表示候选之间的偏好，不是事故真实发生的概率，也不是正确率。</strong></p><div id="example-probabilities"></div><details><summary>查看原始回答、GPU 记录与来源</summary><pre id="example-response"></pre></details></section>
    <section id="story-outcome" class="story-section"><div class="story-heading"><span class="step-number">04</span><div><span class="eyebrow">结果用途 / 人能带走什么</span><h2>一份能核对的判断，<br>还不能当成确诊。</h2></div></div><div class="outcome-verdict"><strong>这一次，模型选错了。</strong><p>它选择了“映射缺失”，但 ev-06 明确记录有效映射存在。独立规则因此给出反对证据。</p></div><div class="outcome-facts"><span>模型输出</span><p>主机到卷有效映射缺失</p><span>事实核对 · 页面规则</span><p>小包能通、大包不通；服务器和存储端 MTU 为 9000，而中间交换机只有 1500。证据指向路径上的 MTU 不一致。</p><span>人可以带走的结果</span><p>先核对这条路径各端口的 MTU，再判断是否需要变更配置。这是基于证据的人工复核方向；这次记录没有额外运行“下一步检查”模型查询。</p></div><p class="outcome-limit">本次完成的是候选排序与证据复核。没有连接真实设备、执行检查、修改配置或修复故障。当前合成开发集仅 8/34 命中，仍不适合直接据此做生产诊断。</p></section></div>
    <section class="story-section query-cost-section" id="story-cost"><div class="story-heading"><span class="step-number">¥</span><div><span class="eyebrow">成本 / 每次查询消耗什么</span><h2>时间、输入量，以及你的本机算力。</h2></div></div><div id="example-cost"></div><p id="example-source" class="microcopy"></p></section>
    <div class="try-query"><div><h3>现在知道发生了什么，试着自己跑一次。</h3><p>你可以选证据或导入 JSON。主动加载模型后，再提交一次新的真实查询。</p></div><button id="story-try-live" class="primary">用本机运行新查询 ↗</button></div>`;
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}query-example.json`);
    if (!response.ok) throw Error("真实示例记录暂时无法加载");
    const data: RecordedQuery = await response.json();
    const groups = [
      ["先看症状", "新增服务器超时，已有服务器正常", ["ev-01", "ev-02", "ev-03"]],
      ["再做路径检查", "小包、大包与访问权限的观察", ["ev-04", "ev-05", "ev-06"]],
      ["最后核对配置", "链路三处的包大小限制", ["ev-07", "ev-08", "ev-09"]],
    ] as const;
    const input = host.querySelector("#example-observations")!;
    for (const [title, description, ids] of groups) {
      const group = el("div", "", "observation-group");
      group.append(el("h3", title), el("p", description, "microcopy"));
      for (const id of ids) {
        const evidence = data.inputSnapshot.evidence.find(e => e.id === id);
        if (!evidence || !data.selectedIDs.includes(id)) continue;
        const row = el("p", "", "observation-summary");
        row.append(el("small", id), el("span", evidenceSummary(evidence)));
        group.append(row);
      }
      input.append(group);
    }
    for (const candidate of CANDIDATES) host.querySelector("#example-options")!.append(el("span", candidate.label));
    host.querySelector("#example-request")!.textContent = JSON.stringify(buildQuestionRequest(data.inputSnapshot, data.selectedIDs), null, 2);
    const answer = data.response.answers.probable_cause;
    if (!("probabilities" in answer) || !("choice" in answer)) throw Error("历史记录不是候选选择题响应");
    for (const [id, probability] of Object.entries(answer.probabilities).sort((a, b) => b[1] - a[1])) {
      const row = el("div", "", "probability-row" + (id === answer.choice ? " top" : ""));
      row.dataset.option = id;
      row.append(el("span", CANDIDATES.find(c => c.id === id)?.label || id), el("strong", `${(probability * 100).toFixed(2)}%`));
      const bar = document.createElement("progress"); bar.max = 1; bar.value = probability; row.append(bar);
      host.querySelector("#example-probabilities")!.append(row);
    }
    host.querySelector("#example-response")!.textContent = JSON.stringify({ response: data.response, gpuProof: data.gpuProof, sourceCommit: data.sourceCommit, exportedAt: data.timestamp }, null, 2);
    host.querySelector("#example-cost-teaser")!.textContent = `${(data.wallMs / 1000).toFixed(3)} 秒 · ${data.usage.totalTokens.toLocaleString("en-US")} 输入 tokens · 0 次云推理调用`;
    renderQueryCost(host.querySelector<HTMLElement>("#example-cost")!, data, "历史实测 · 仅对应这 9 条证据与这一个问题，不是你刚提交的新结果；与实时工作台独立");
    host.querySelector("#example-source")!.textContent = `来源：GitHub Pages 上的真实本机运行；Apple M3 / Chrome 154。导出记录时间：${data.timestamp}。源码版本：${data.sourceCommit.slice(0, 7)}。这一个样本的耗时不能代表所有设备或每次运行。`;
  } catch (error) {
    host.prepend(el("p", `${String(error)}。下方说明不代表已在当前设备运行模型。`, "conflict"));
  }
}
