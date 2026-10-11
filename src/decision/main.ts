import './style.css';
import { LESSONS, SOURCES } from './content';
import { diagramMarkup } from './diagrams';
import { inspectRequest, scoreDemo, thresholdSummary, type DecisionKind, type HistoricalCase } from './labs';

const BASE = import.meta.env.BASE_URL;
const REPO = 'https://github.com/minatoaquaMK2/kev-webgpu';
const app = document.querySelector<HTMLDivElement>('#app')!;
const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const $ = <T extends HTMLElement = HTMLElement>(selector: string, parent: ParentNode = document) => parent.querySelector<T>(selector)!;
const json = (value: unknown) => JSON.stringify(value, null, 2);
let version = 0;
let activeLesson = 0;
let activeNode = 0;

app.innerHTML = `<div class="dm-page">
  <header class="dm-header"><a class="dm-logo" href="${BASE}"><span class="dm-mark">k</span><span>kev / webgpu<small>DECISION MODEL FIELD GUIDE</small></span></a><nav aria-label="主导航"><a href="${BASE}">机制图解</a><a href="${BASE}decision-models/" aria-current="page">模型入门</a><a href="${BASE}demo/">实测 Demo ↗</a></nav></header>
  <main class="dm-main">
    <section class="dm-hero"><div><p class="dm-eyebrow">MEET JEV & KEV · 认识决策模型</p><h1>有些 AI 的工作，<br>是<span>选答案。</span></h1><p class="dm-intro">给出背景、问题和备选答案，模型给这些答案评分。通过五张可点击的图，了解 Jev、Kev 是什么，以及程序和人怎样使用模型的结果。</p><div class="dm-actions"><a class="dm-button primary" href="#contract">从一个问题开始 ↓</a><a href="${BASE}demo/">看一次真实查询 ↗</a></div><p class="dm-note">基于官方文档与可检查源码 · 资料核对于 2026-10-11</p></div>
    <div class="dm-hero-card"><div class="dm-card-top"><span>ONE QUESTION → A TYPED ANSWER</span><span>◇</span></div><p class="dm-ticket">“这条请求，应该交给哪个团队？”</p><svg viewBox="0 0 460 230" role="img" aria-labelledby="hero-svg-title"><title id="hero-svg-title">背景、问题和候选进入模型，输出候选分布，再由程序处理</title><defs><marker id="hero-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="none" stroke="#688f75"/></marker></defs><path d="M110 75H187M277 75H346M391 108V165H260" fill="none" stroke="#688f75" stroke-width="1.5" marker-end="url(#hero-arrow)"/><rect x="12" y="40" width="98" height="70" rx="10" fill="#fafbf5" stroke="#bdcbb7"/><text x="61" y="71" text-anchor="middle">背景 + 问题</text><text x="61" y="92" text-anchor="middle" class="small">你定义候选</text><rect x="187" y="30" width="90" height="90" rx="16" fill="#234f3e"/><text x="232" y="70" text-anchor="middle" fill="#fff">决策模型</text><text x="232" y="92" text-anchor="middle" fill="#c5dbb7" class="small">比较候选</text><rect x="346" y="40" width="100" height="70" rx="10" fill="#fafbf5" stroke="#bdcbb7"/><path d="M366 87V58M389 87V68M412 87V77" stroke="#90ad7d" stroke-width="12"/><rect x="154" y="147" width="106" height="42" rx="8" fill="#e4ecd9" stroke="#bdcbb7"/><text x="207" y="173" text-anchor="middle">程序决定下一步</text></svg><p class="dm-note">结构示意，柱形不代表模型实测分数。</p></div></section>
    <div class="dm-orientation"><p><b>Jev</b><span>TypeSafe 的托管模型</span></p><p><b>Kev</b><span>独立的开放模型家族</span></p><p><b>本站</b><span>在浏览器运行 Kev 0.8B q8</span></p></div>
    <section class="dm-learning" aria-label="决策模型教学"><aside class="dm-sidebar"><p class="dm-eyebrow">EXPLORE THE DECISION</p><h2>一步一步，拆开看。</h2><nav aria-label="学习章节">${LESSONS.map((lesson, i) => `<a href="#${lesson.id}" data-lesson="${lesson.id}"><span>${String(i+1).padStart(2,'0')}</span>${escape(lesson.short)}<b>↗</b></a>`).join('')}</nav><p class="dm-sidebar-note">点图中的节点查看说明。<br>本页不下载模型，也不调用 Jev API。</p></aside><div id="dm-lesson" class="dm-lesson"></div></section>
    <section class="dm-next"><div><p class="dm-eyebrow">FROM THE IDEA TO A REAL QUERY</p><h2>再看一次真正运行过的选择。</h2><p>现有 Demo 展开一条 Kev q8 历史查询：9 条观察、8 个候选、原始错误结果和资源开销。你可以逐项对照输入、模型返回值和最后的复核结果。</p></div><a class="dm-button primary" href="${BASE}demo/">打开完整 Demo ↗</a></section>
    <section class="dm-sources" id="sources"><div><p class="dm-eyebrow">READ THE ORIGINALS</p><h2>每个解释，都有出处。</h2><p>模型能力会随版本改变。内部结构按公开 Kev 实现讲解；Jev 的服务说明与本站的历史验收分别标注。</p><a href="${REPO}/blob/main/docs/decision-models-research.md" target="_blank" rel="noreferrer">研究笔记与章节依据 ↗</a></div><ol>${SOURCES.map(source=>`<li><a href="${escape(source.href)}" target="_blank" rel="noreferrer">${escape(source.label)} ↗</a><p>${escape(source.note)}</p></li>`).join('')}</ol></section>
  </main><footer class="dm-footer"><span>kev / webgpu · 决策模型入门</span><a href="${REPO}" target="_blank" rel="noreferrer">查看源码 ↗</a><a href="${BASE}">返回首页 ↑</a></footer></div>`;

function selectNode(index: number, focus = false) {
  const lesson = LESSONS[activeLesson];
  activeNode = index;
  const node = lesson.nodes[index];
  const nodes = [...document.querySelectorAll<SVGGElement>('[data-scene-node]')];
  nodes.forEach(element => element.setAttribute('aria-pressed', String(element.dataset.sceneNode === node.id)));
  $('#dm-inspector').innerHTML = `<p class="dm-eyebrow">图中节点 ${String(index+1).padStart(2,'0')} / ${lesson.nodes.length}</p><h3 id="dm-node-title">${escape(node.title)}</h3><p>${escape(node.body)}</p><dl><div><dt>输入</dt><dd>${escape(node.input)}</dd></div><div><dt>输出</dt><dd>${escape(node.output)}</dd></div></dl><a href="${escape(node.source.href)}" target="_blank" rel="noreferrer">${escape(node.source.label)} ↗</a>`;
  const active = nodes.find(element => element.dataset.sceneNode === node.id);
  if (focus && active) { active.focus(); active.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'}); }
  $('#dm-step').textContent = `${index+1} / ${lesson.nodes.length} · ${node.title}`;
}

function installDiagram() {
  const lesson = LESSONS[activeLesson];
  for (const element of document.querySelectorAll<SVGGElement>('[data-scene-node]')) {
    const index = lesson.nodes.findIndex(node=>node.id === element.dataset.sceneNode);
    element.addEventListener('click', ()=>selectNode(index));
    element.addEventListener('keydown', event=>{
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectNode(index); }
      else if (['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? lesson.nodes.length-1 : (index + (['ArrowLeft','ArrowUp'].includes(event.key)?-1:1) + lesson.nodes.length) % lesson.nodes.length;
        selectNode(next,true);
      }
    });
  }
  $('#dm-node-prev').onclick = ()=>selectNode((activeNode-1+lesson.nodes.length)%lesson.nodes.length,true);
  $('#dm-node-next').onclick = ()=>selectNode((activeNode+1)%lesson.nodes.length,true);
  selectNode(0);
}

const questionKinds: Record<DecisionKind,{label:string;summary:string}> = {
  choice:{label:'Choice · 选哪一项',summary:'返回一个候选键、各候选概率和 confidence。候选定义也是模型要读取的输入。模型只能给这些候选评分，不会临时增加新选项。'},
  noul:{label:'Noul · 是的可能性',summary:'返回“这个判断为真”的概率，介于 0 与 1。0.5 表示模型没有偏向“是”或“否”，不是“程度中等”；是否按“是”处理，由程序设定规则。'},
  score:{label:'Score · 落在哪一级',summary:'你先定义从低到高的等级，模型给每级概率，接口按等级位置和对应概率算出加权分数，可以落在两级之间。它不直接生成任意数值。'},
};
function inputLab(host: HTMLElement) {
  host.innerHTML = `<div class="dm-lab-heading"><div><p class="dm-eyebrow">TRY 01 / 真正组装一次输入</p><h3>同一段材料，可以问不同的问题。</h3></div><span class="dm-badge">纯函数 · 不推理</span></div><div class="dm-lab-body"><div class="dm-segments" aria-label="问题类型">${Object.entries(questionKinds).map(([kind,value])=>`<button data-kind="${kind}" aria-pressed="${kind==='choice'}">${value.label}</button>`).join('')}</div><p id="kind-summary"></p><label class="dm-field" for="teaching-state">背景材料（可编辑）<textarea id="teaching-state" maxlength="1200" rows="3">今天账户被扣了两次费用，两笔记录的订单号相同。其它功能正常。</textarea></label><div class="dm-code-grid"><div><h4>① 请求对象</h4><pre id="teaching-request"></pre></div><div><h4>② kev.js 实际整理后的文字</h4><pre id="teaching-record"></pre></div></div><p class="dm-scope">这里调用固定 kev.js 的 validate 和 toRecord，实际检查并整理输入。没有运行分词器或模型，因此修改背景不会生成新的预测答案。</p></div>`;
  let kind: DecisionKind = 'choice';
  const update = ()=> {
    const result = inspectRequest(kind,$<HTMLTextAreaElement>('#teaching-state',host).value);
    $('#kind-summary',host).textContent = questionKinds[kind].summary;
    $('#teaching-request',host).textContent = json(result.request);
    $('#teaching-record',host).textContent = json(result.record);
    for(const button of host.querySelectorAll<HTMLButtonElement>('[data-kind]')) button.setAttribute('aria-pressed',String(button.dataset.kind === kind));
  };
  for(const button of host.querySelectorAll<HTMLButtonElement>('[data-kind]')) button.onclick=()=>{kind=button.dataset.kind as DecisionKind;update();};
  $('#teaching-state',host).oninput=update;
  update();
}
function familyLab(host: HTMLElement) {
  host.innerHTML = `<div class="dm-lab-heading"><div><p class="dm-eyebrow">TRY 02 / 分清模型、服务和运行库</p><h3>名字相近，运行边界各不相同。</h3></div><span class="dm-badge">资料对照</span></div><div class="dm-lab-body"><div class="dm-table-scroll"><table><caption>按 2026-10-11 查阅的公开资料整理</caption><thead><tr><th>对象</th><th>你拿到什么</th><th>在哪里运行</th><th>本站关系</th></tr></thead><tbody><tr><th>Jev</th><td>TypeSafe 提供的模型 API</td><td>托管服务</td><td>介绍共同接口概念，未接入此服务</td></tr><tr><th>Kev</th><td>独立模型权重与训练代码</td><td>按模型与实现选择本机或服务器</td><td>本项目使用其 0.8B 固定 checkpoint</td></tr><tr><th>kev.js</th><td>适配接口与浏览器运行库</td><td>浏览器中的 JS / WASM / WebGPU</td><td>本项目锁定 1.0.0，不是另一个模型</td></tr></tbody></table></div><label class="dm-field compact" for="family-profile">选择一条运行路线<select id="family-profile"><option value="jev">Jev：应用调用托管 API</option><option value="kev">Kev：自己部署模型</option><option value="site">本站：浏览器本地 q8</option></select></label><div class="dm-observation" id="family-route" aria-live="polite"></div><p class="dm-scope">Jev 公开 SDK 是服务客户端，不是模型权重。本次查阅未发现官方公开 Jev 权重入口。Kev 不是 Jev 的官方开源版，也不能据此推断它们有相同架构或效果。</p></div>`;
  const routes = {
    jev:'你的应用 → TypeSafe 托管 API → 类型化结果。需要服务访问权限；本页没有发出请求。模型和接口版本应按官方文档确认。',
    kev:'你的应用 → 自行部署的 Kev 模型 → 类型化结果。模型权重、训练与推理代码可以检查；硬件需求随模型大小和运行实现变化。',
    site:'浏览器 → kev.js 1.0.0 → ONNX Runtime 1.30.0 → 本机 WebGPU。固定 Kev-0.8B text q8；证据不发送到远程推理服务，模型文件需主动加载。',
  };
  const update=()=> { const id=$<HTMLSelectElement>('#family-profile',host).value as keyof typeof routes;$('#family-route',host).textContent=routes[id];selectNode(LESSONS[activeLesson].nodes.findIndex(node=>node.id===id));};
  $('#family-profile',host).onchange=update; update();
}
function scoringLab(host: HTMLElement) {
  host.innerHTML = `<div class="dm-lab-heading"><div><p class="dm-eyebrow">TRY 03 / 从分数到概率</p><h3>改变分数，观察分布；再改变温度。</h3></div><span class="dm-badge amber">人工分数 · 数学演示</span></div><div class="dm-lab-body"><p>这里直接手动设定三个候选的原始分数，跳过模型。滑块运行 softmax 数学计算，再调用 kev.js 的 Choice confidence 公式。</p><div class="dm-math-grid"><div class="dm-sliders">${['候选 A','候选 B','候选 C'].map((label,i)=>`<label for="logit-${i}">${label} 原始分数 <output id="logit-value-${i}"></output><input type="range" id="logit-${i}" data-logit="${i}" min="-4" max="4" step="0.25" value="${2-i}"></label>`).join('')}<label for="temperature">温度 T <output id="temperature-value"></output><input type="range" id="temperature" min="0.5" max="4" step="0.25" value="1"></label><button class="dm-button" id="reset-scores">重置教学分数</button></div><div><div id="score-bars" aria-label="教学分数算出的概率"></div><div class="dm-math-result" aria-live="polite"><p>最高项 <strong id="score-winner"></strong></p><p>最高概率 <strong id="score-max"></strong></p><p>Choice confidence <strong id="score-confidence"></strong></p></div><code class="dm-formula">pᵢ = exp(zᵢ / T) / Σ exp(zⱼ / T)</code><p class="dm-small">confidence = (最高概率 − 1/选项数) ÷ (1 − 1/选项数)</p></div></div><p class="dm-observation">T 为正时，只改温度会让分布更集中或更平，不会改变这组固定分数的排序。高 confidence 只说明分布更偏向某项，不证明该项正确。</p><p class="dm-scope">这不是模型测试，也不是在真实任务上做校准。本站模型仍使用锁定的温度；这里的滑块不会修改它。同题选项的顺序可能影响模型算出的原始分数。</p></div>`;
  const update=()=> {
    const logits=[0,1,2].map(i=>Number($<HTMLInputElement>(`#logit-${i}`,host).value));
    const t=Number($<HTMLInputElement>('#temperature',host).value);
    const result=scoreDemo(logits,t);
    logits.forEach((value,i)=>{$(`#logit-value-${i}`,host).textContent=value.toFixed(2);});
    $('#temperature-value',host).textContent=t.toFixed(2);
    $('#score-bars',host).innerHTML=result.probabilities.map((p,i)=>`<div class="dm-probability"><div><span>候选 ${'ABC'[i]}</span><strong>${(p*100).toFixed(2)}%</strong></div><progress max="1" value="${p}" aria-label="候选 ${'ABC'[i]} 的教学概率"></progress></div>`).join('');
    $('#score-winner',host).textContent=`候选 ${'ABC'[result.winner]}`;
    $('#score-max',host).textContent=(Math.max(...result.probabilities)*100).toFixed(2)+'%';
    $('#score-confidence',host).textContent=result.confidence.toFixed(4);
  };
  host.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(input=>input.oninput=update);
  $('#reset-scores',host).onclick=()=>{[0,1,2].forEach(i=>$<HTMLInputElement>(`#logit-${i}`,host).value=String(2-i));$<HTMLInputElement>('#temperature',host).value='1';update();}; update();
}
function executionLab(host: HTMLElement) {
  host.innerHTML = `<div class="dm-lab-heading"><div><p class="dm-eyebrow">TRY 04 / 把开销分开看</p><h3>少了逐字生成，仍然需要模型计算。</h3></div><span class="dm-badge">机制示意 · 非速度测试</span></div><div class="dm-lab-body"><div class="dm-two-paths"><div><h4>生成式文本回答</h4><p>根据上下文预测下一个 token，再把新 token 接回输入，继续解码。结构化 JSON 也可以通过这种路径生成。</p><svg viewBox="0 0 380 100" role="img" aria-label="生成式输出示意：前一输出参与下一步解码"><path d="M65 48H125M185 48H245M305 48V86H65V64" fill="none" stroke="#718d68" stroke-width="2"/><g fill="#edf2e4" stroke="#a6ba95"><rect x="5" y="24" width="60" height="40" rx="7"/><rect x="125" y="24" width="60" height="40" rx="7"/><rect x="245" y="24" width="60" height="40" rx="7"/></g><g fill="#284d3c" text-anchor="middle" font-size="14"><text x="35" y="50">token₁</text><text x="155" y="50">token₂</text><text x="275" y="50">token₃</text><text x="95" y="40">→</text><text x="215" y="40">→</text><text x="185" y="82">继续解码…</text></g></svg></div><div><h4>Kev 的候选读出</h4><p>处理背景、问题和候选，从它们的表示直接读出分布。返回的 JSON 由程序组织，不逐 token 写答案。</p><svg viewBox="0 0 380 100" role="img" aria-label="Kev 读出示意：上下文计算后由评分头直接返回候选分布"><path d="M100 48H155M230 48H285" fill="none" stroke="#718d68" stroke-width="2"/><g fill="#edf2e4" stroke="#a6ba95"><rect x="5" y="24" width="95" height="46" rx="7"/><rect x="155" y="24" width="75" height="46" rx="7"/><rect x="285" y="24" width="90" height="46" rx="7"/></g><g fill="#284d3c" text-anchor="middle" font-size="14"><text x="52" y="52">上下文表示</text><text x="192" y="52">评分头</text><text x="330" y="52">候选分布</text><text x="126" y="40">→</text><text x="257" y="40">→</text></g></svg></div></div><p class="dm-small">图示强调输出方式，不比较所有模型实现。Jev 官方描述并行问答；本站固定的 kev.js 则先处理背景材料，再依次计算各个问题分支。“不用逐字解码”不等于一次 ORT 调用或一条 GPU 指令。</p><div class="dm-segments" aria-label="开销阶段"><button data-cost="setup" aria-pressed="true">首次准备</button><button data-cost="query" aria-pressed="false">单次查询</button><button data-cost="more" aria-pressed="false">更多问题</button></div><div class="dm-observation" id="execution-cost" aria-live="polite"></div><p class="dm-scope">具体速度取决于输入长度、候选数量、硬件与运行方式。本页不将官方宣传中的加速倍数当作本站实测。<a href="${BASE}demo/#story-cost">查看本站一条历史查询的真实成本 ↗</a></p></div>`;
  const costs = {
    setup:'本站首次主动加载固定 q8，需要约 827 MB 模型文件、校验和会话初始化。缓存命中时可省去重复下载。约 827 MB 是文件大小，不代表运行时占用的内存或显存。',
    query:'模型就绪后，查询仍需文本编码、主干运算和候选评分。单次查询没有云端推理费用；本机仍消耗电力与计算资源。电力、峰值显存与总货币成本尚未测量。',
    more:'问题可以共享背景处理结果，但额外的候选和问题仍带来输入与计算。本站每次按钮操作只问一个问题；“下一步检查”另发一次查询并单独计时。',
  };
  const update=(key:keyof typeof costs)=>{host.querySelectorAll<HTMLButtonElement>('[data-cost]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.cost===key)));$('#execution-cost',host).textContent=costs[key];};
  host.querySelectorAll<HTMLButtonElement>('[data-cost]').forEach(button=>button.onclick=()=>update(button.dataset.cost as keyof typeof costs));update('setup');
}
let history:Promise<{cases:HistoricalCase[];recordedAt:string}>|undefined;
async function reviewLab(host: HTMLElement, currentVersion: number) {
  host.innerHTML=`<div class="dm-lab-heading"><div><p class="dm-eyebrow">TRY 05 / 复核历史结果</p><h3>提高门槛，会留下哪些判断？</h3></div><span class="dm-badge">历史结果 · 真实后处理</span></div><div class="dm-lab-body"><p>读取已有的 34 条合成开发记录，按你设置的概率门槛重新统计：留下多少条，其中错了多少条。这里不重新运行模型，原始选择和概率保持不变。</p><p id="history-loading" role="status">正在读取历史记录…</p><div id="threshold-lab" hidden><label class="dm-field" for="decision-threshold">保留选中项概率 ≥ <output id="threshold-value"></output><input type="range" id="decision-threshold" min="0" max="100" value="30" step="5"></label><div class="dm-threshold-metrics" aria-live="polite"><div><span>保留建议</span><strong id="retained-count"></strong></div><div><span>其中错误</span><strong id="wrong-count"></strong></div><div><span>转交复核</span><strong id="review-count"></strong></div></div><div id="history-dots"></div><div class="dm-dot-legend"><span><i class="correct"></i>保留且符合开发标签</span><span><i class="wrong"></i>保留但不符合标签</span><span><i></i>低于门槛，转交复核</span></div><p id="threshold-observation" class="dm-observation"></p><details><summary>逐条查看本次筛选与原始分数</summary><div class="dm-table-scroll"><table><thead><tr><th>记录</th><th>模型原始选中项</th><th>该项概率</th><th>标签核对</th><th>演示处理</th></tr></thead><tbody id="history-rows"></tbody></table></div></details><p id="history-source" class="dm-small"></p></div><p class="dm-scope">门槛使用选中项概率，不是 confidence。校准要在足够、独立且贴近任务的带标签数据上验证；不能据这 34 条合成开发记录确定生产阈值。本页不重新推理，也不操作设备。</p></div>`;
  try {
    const data=await (history??=fetch(`${BASE}guide-validation.json`).then(response=>{if(!response.ok)throw Error('历史记录读取失败');return response.json();}));
    if(version!==currentVersion)return;
    $('#history-loading',host).hidden=true;$('#threshold-lab',host).hidden=false;
    const update=()=>{
      const threshold=Number($<HTMLInputElement>('#decision-threshold',host).value)/100;
      const result=thresholdSummary(data.cases,threshold);
      $('#threshold-value',host).textContent=`${(threshold*100).toFixed(0)}%`;
      $('#retained-count',host).textContent=`${result.retained} / ${result.total}`;
      $('#wrong-count',host).textContent=String(result.wrong);
      $('#review-count',host).textContent=String(result.review);
      $('#history-dots',host).innerHTML=`<svg viewBox="0 0 720 105" role="img" aria-label="${result.total} 条历史结果：保留 ${result.retained} 条，其中 ${result.wrong} 条错误，${result.review} 条转交复核">${result.rows.map((row,i)=>`<circle cx="${22+(i%17)*42}" cy="${28+Math.floor(i/17)*48}" r="12" fill="${row.retained?(row.correct?'#628b67':'#d39653'):'#dce2d4'}"><title>${escape(row.id)}：${(row.p*100).toFixed(2)}%，${row.retained?(row.correct?'保留，符合标签':'保留，不符合标签'):'转交复核'}</title></circle>`).join('')}</svg>`;
      $('#threshold-observation',host).textContent=result.retained===0?'这个门槛下没有保留建议。零条建议不等于 100% 准确，也不代表问题已经解决。':`保留的 ${result.retained} 条中，${result.correct} 条符合开发标签，${result.wrong} 条仍然错误。提高门槛只是在筛选输出，并没有修正模型判断。`;
      $('#history-rows',host).innerHTML=result.rows.map(row=>`<tr><th>${escape(row.id)}</th><td>${escape(row.selected)}</td><td>${(row.p*100).toFixed(2)}%</td><td>${row.correct?'符合':'不符合'}</td><td>${row.retained?'保留建议':'转交复核'}</td></tr>`).join('');
    };
    $('#decision-threshold',host).oninput=update;
    $('#history-source',host).textContent=`来源：guide-validation.json · 记录时间 ${data.recordedAt} · Apple M3 历史运行。未筛选时为 8/34 可接受首选答案；不是独立测试集或访问者设备的实测。`;
    update();
  } catch(error) {if(version===currentVersion)$('#history-loading',host).textContent=`${String(error)}。未显示替代或模拟结果。`;}
}
function renderLesson(index:number) {
  activeLesson=index;activeNode=0;
  const currentVersion=++version;
  const lesson=LESSONS[index];
  document.querySelectorAll<HTMLAnchorElement>('[data-lesson]').forEach(link=>{if(link.dataset.lesson===lesson.id)link.setAttribute('aria-current','step');else link.removeAttribute('aria-current');});
  const currentLink = $<HTMLAnchorElement>(`[data-lesson="${lesson.id}"]`);
  const chapterNav = currentLink.parentElement!;
  if (chapterNav.scrollWidth > chapterNav.clientWidth) {
    chapterNav.scrollLeft += currentLink.getBoundingClientRect().left - chapterNav.getBoundingClientRect().left - 12;
  }
  $('#dm-lesson').innerHTML=`<div class="dm-chapter-heading"><p class="dm-eyebrow">${String(index+1).padStart(2,'0')} / ${escape(lesson.short)}</p><h2 id="dm-chapter-title">${escape(lesson.title)}</h2><p>${escape(lesson.intro)}</p></div><div class="dm-explorer"><div class="dm-diagram-column"><div class="dm-diagram-bar"><span>SVG · 点节点看解释</span><span>路径是教学示意，不是实时推理</span></div><div class="dm-diagram-scroll" tabindex="0" aria-label="机制图，可横向滚动">${diagramMarkup(lesson.id,lesson.nodes[0].id)}</div><div class="dm-diagram-controls"><button id="dm-node-prev" aria-label="上一个图节点">←</button><span id="dm-step"></span><button id="dm-node-next" aria-label="下一个图节点">→</button></div></div><div class="dm-inspector" id="dm-inspector" aria-live="polite"></div></div><p class="dm-takeaway">${escape(lesson.takeaway)}</p><div class="dm-lab" id="dm-lab"></div><div class="dm-pagination"><span>${String(index+1).padStart(2,'0')} / ${LESSONS.length}</span><a href="#${LESSONS[(index+1)%LESSONS.length].id}">${index===LESSONS.length-1?'重新从输入开始':'下一章：'+LESSONS[index+1].short} →</a></div>`;
  installDiagram();
  const host=$('#dm-lab');
  if(lesson.id==='contract')inputLab(host);
  else if(lesson.id==='family')familyLab(host);
  else if(lesson.id==='scoring')scoringLab(host);
  else if(lesson.id==='execution')executionLab(host);
  else void reviewLab(host,currentVersion);
}
function chapterFromHash(){const found=LESSONS.findIndex(lesson=>`#${lesson.id}`===location.hash);return found<0?0:found;}
function scrollToLesson(){ $(matchMedia('(max-width: 850px)').matches ? '.dm-learning' : '#dm-lesson').scrollIntoView({block:'start',behavior:'instant'}); }
window.addEventListener('hashchange',()=>{if(location.hash==='#sources')return;renderLesson(chapterFromHash());scrollToLesson();});
renderLesson(chapterFromHash());
if (LESSONS.some(lesson=>location.hash===`#${lesson.id}`)) requestAnimationFrame(scrollToLesson);
