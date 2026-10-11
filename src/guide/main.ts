import './style.css';
import { CHAPTERS, type GuideNode } from './content';
import { buildModelState, getCaseStage, parseEvidenceBundle, type EvidenceBundle } from '../evidence';
import { CANDIDATES, evaluateEvidence, type CandidateId } from '../domain';
import { buildQuestionRequest } from '../app/request';
import { inspectDevice } from '../runtime/device';

const BASE = import.meta.env.BASE_URL;
const REPO = 'https://github.com/minatoaquaMK2/kev-webgpu';
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const source = (path: string) => path.startsWith('https://') ? path : `${REPO}/blob/main/${path.replace(/docs\/(local-mac-validation|semantic-diagnostics)\.md|results\/local-real-model-final\.json/, 'docs/verification.md')}`;
const label = (id: string) => CANDIDATES.find(c => c.id === id)?.label ?? id;
const glyphs: Record<string,string> = {observations:'▤',question:'?',candidates:'☷',decision:'◈',ui:'▣',worker:'↔',kevjs:'{}',wasm:'W',gpu:'▦',validate:'✓',state:'▤',tokens:'01',budget:'≦',capability:'✓',q8:'8',download:'↓',cache:'▣',probabilities:'▥',rules:'≡',trace:'↗',review:'◎',engineering:'✓',numerical:'≈',semantic:'!',limits:'◌'};
let chapterIndex = 0, nodeIndex = 0, renderVersion = 0;
const bundleCache = new Map<string, Promise<EvidenceBundle>>();
function getBundle(id: string) {
  if (!bundleCache.has(id)) bundleCache.set(id, fetch(`${BASE}cases/${id}.json`).then(r => { if (!r.ok) throw new Error('案例读取失败'); return r.json(); }).then(parseEvidenceBundle));
  return bundleCache.get(id)!;
}
interface HistoryCase { id: string; selected: string; expected: string[]; probabilities: Record<string, number>; wallMs: number; correct: boolean }
interface History { cases: HistoryCase[]; recordedAt: string }
let historyPromise: Promise<History> | undefined;
function getHistory(): Promise<History> { return historyPromise ??= fetch(`${BASE}guide-validation.json`).then(r => { if (!r.ok) throw new Error('历史记录读取失败'); return r.json() as Promise<History>; }); }

$('#app').innerHTML = `<div class="guide-page">
  <header class="site-header"><a class="logo" href="${BASE}" aria-label="Kev WebGPU 首页"><span class="logo-symbol">k<span>·</span></span><span>kev<span class="logo-light"> / webgpu</span></span></a><nav aria-label="主导航"><a href="${BASE}decision-models/">模型入门</a><a href="#learn">机制图解</a><a href="${REPO}" target="_blank" rel="noreferrer">GitHub ↗</a></nav><span class="header-note"><i></i> 在你的浏览器里</span></header>
  <main>
    <section class="hero"><div class="hero-copy"><p class="eyebrow"><span class="tiny-square"></span> A LITTLE MODEL. A LOCAL DECISION.</p><h1>一份证据，<br>怎样变成<span>一次判断？</span></h1><p class="hero-intro">跟着数据走一遍：看 Kev 如何比较候选答案，WASM 如何运行推理引擎，WebGPU 如何让你的显卡参与计算。</p><div class="hero-actions"><a class="button primary" href="${BASE}demo/">看懂一次真实查询（Query） <span>↗</span></a><a class="text-link" href="#learn">继续看机制图解 ↓</a></div><p class="hero-caption">6 个章节 · 可点开的机制图 · 真实结果与失败记录</p></div>
    <div class="hero-visual" role="img" aria-label="证据进入 Kev，经过浏览器中的 WASM 推理引擎与 WebGPU 计算，得到候选概率。"><div class="visual-topline"><span>INSIDE YOUR BROWSER</span><span>●</span></div><div class="evidence-ticket"><span class="ticket-icon">▤</span><div><small>01 / INPUT</small><strong>证据 + 问题 + 候选</strong></div><span class="ticket-id">[ ev-01 ]</span></div><div class="flow-line"></div><div class="hero-chip"><span class="chip-label">DECISION MODEL</span><strong>Kev<span>0.8B</span></strong><span class="chip-foot">TEXT · Q8 · LOCAL</span></div><div class="chip-platform p1">WASM <span>运行引擎</span></div><div class="chip-platform p2">WebGPU <span>显卡计算</span></div><div class="visual-result"><span>02 / OUTPUT</span><strong>候选概率</strong><div class="abstract-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></div><small>结构示意，非模型输出</small></div><div class="visual-bottom"><span>你的证据 → 本机计算</span><span>无需推理 API 密钥</span></div></div></section>
    <div class="role-strip"><div><span>01</span><strong>Kev</strong><p>比较候选答案</p></div><div><span>02</span><strong>WASM</strong><p>让推理引擎在浏览器运行</p></div><div><span>03</span><strong>WebGPU</strong><p>把主要计算交给显卡</p></div><div><span>04</span><strong>Worker</strong><p>让推理任务与界面分开</p></div></div>
    <section class="learning" id="learn" aria-label="交互机制图解"><aside class="chapter-nav"><p class="eyebrow">THE FIELD GUIDE</p><h2>拆开看，就明白了。</h2><p class="nav-hint">选择一章，再点图中的模块。</p><nav aria-label="图解章节">${CHAPTERS.map((c,i)=>`<button data-chapter="${c.id}" ${i===0?'aria-current="step"':''}><span>${String(i+1).padStart(2,'0')}</span>${c.title}<b aria-hidden="true">↗</b></button>`).join('')}</nav><div class="nav-note"><span>↳</span><p>这里的图解不下载模型。<br>真实推理在下方工作台中启动。</p></div></aside><div class="chapter-content"><div id="chapter"></div></div></section>
    <section class="try-section" id="try"><div class="try-copy"><p class="eyebrow">NOW, YOUR TURN</p><h2>把图解变成一次真实运行。</h2><p>先看一次真实查询：输入了什么、模型做了什么、输出了什么、怎样复核，以及消耗多少时间和资源。也可以切到实时工作台，在本机提交新查询。</p><ol><li><span>1</span> 浏览已保存的真实运行记录（无需下载模型）</li><li><span>2</span> 切到“用本机运行新查询”，手动加载约 827 MB 模型</li><li><span>3</span> 勾选证据、提交查询，查看候选分数和本次消耗</li></ol><p class="try-limit">需要支持 WebGPU 和 shader-f16 的浏览器。模型加载后可以断网分析新证据；首次离线打开或离线刷新仍不保证可用。当前故障判断未通过验收，仅供学习与研究。</p><div class="hero-actions"><button class="button primary" id="open-demo">打开真实工作台 <span>↗</span></button><a href="${BASE}demo/" target="_blank" rel="noreferrer" class="text-link">单独打开 ↗</a></div></div><div class="try-card"><span class="tiny-square"></span><p>ONE FIXED MODEL</p><h3>Kev 0.8B</h3><div class="model-tags"><span>text q8</span><span>kev.js 1.0.0</span><span>ORT 1.30.0</span></div><dl><div><dt>推理位置</dt><dd>当前设备</dd></div><div><dt>模型文件</dt><dd>33 个 · SHA-256 校验</dd></div><div><dt>证据数据</dt><dd>应用不上传到推理服务</dd></div><div><dt>外部请求</dt><dd>站点资源与公开模型下载</dd></div></dl></div><div id="demo-mount"></div></section>
  </main><footer><a class="logo" href="${BASE}"><span class="logo-symbol">k<span>·</span></span><span>kev / webgpu</span></a><p>看清运作原理，也正视当前局限。</p><div><a href="${REPO}/blob/main/docs/verification.md" target="_blank" rel="noreferrer">验收记录 ↗</a><a href="${REPO}" target="_blank" rel="noreferrer">源码 ↗</a><a href="https://github.com/minatoaquaMK2/intelligent-ui" target="_blank" rel="noreferrer">交互灵感 ↗</a></div></footer></div>`;

function selectNode(index: number) {
  nodeIndex = index;
  const c = CHAPTERS[chapterIndex], n = c.nodes[index];
  document.querySelectorAll<HTMLButtonElement>('[data-node]').forEach((b,i) => { b.classList.toggle('active', i===index); b.setAttribute('aria-pressed', String(i===index)); });
  $('#node-detail').innerHTML = `<div class="detail-top"><span class="eyebrow">${esc(n.tag)}</span><span class="node-counter">${index+1} / ${c.nodes.length}</span></div><h3 id="node-title">${esc(n.title)}</h3><p>${esc(n.summary)}</p><dl class="io"><div><dt>输入</dt><dd>${esc(n.input)}</dd></div><div><dt>输出</dt><dd>${esc(n.output)}</dd></div></dl><div class="detail-note">${esc(n.note)}</div><pre class="code-block"><code>${esc(n.code)}</code></pre><div class="detail-footer"><a href="${esc(source(n.source))}" target="_blank" rel="noreferrer">查看对应源码 ↗</a><button id="next-node" aria-label="查看下一个模块">下一步 →</button></div>`;
  $('#next-node').onclick = () => selectNode((nodeIndex+1)%c.nodes.length);
}
function nodeMarkup(n: GuideNode, i: number) {
  return `<button class="diagram-node" data-node="${n.id}" aria-pressed="${i===0}"><span class="node-number">${String(i+1).padStart(2,'0')}</span><span class="node-glyph" aria-hidden="true">${glyphs[n.id]}</span><strong>${esc(n.tag)}</strong><span class="node-caption">${esc(n.title)}</span><span class="node-open" aria-hidden="true">↗</span></button>`;
}
function diagramMarkup(index: number) {
  const {id,nodes} = CHAPTERS[index];
  const node = (i: number) => nodeMarkup(nodes[i],i);
  const arrow = '<span class="diagram-connector" aria-hidden="true">↓</span>';
  if(id==='engine') return `${node(0)}${arrow}<div class="worker-boundary"><span class="boundary-label">后台工作线程（Web Worker）</span>${node(1)}${arrow}${node(2)}${arrow}${node(3)}</div><span class="diagram-connector" aria-hidden="true">↕</span>${node(4)}<span class="boundary-label">本机 GPU · 浏览器接口</span>`;
  if(id==='evidence') return `<div class="diagram-shared">同一份所选证据</div><div class="parallel-arrows" aria-hidden="true">↙　　　　　　　　↘</div><div class="parallel-nodes">${node(0)}${node(1)}</div><div class="parallel-arrows" aria-hidden="true">↘　　　　　　　　↙</div>${node(2)}${arrow}${node(3)}`;
  if(id==='validation') return `<div class="diagram-shared">三类验收：能否运行、数值差多少、判断对不对</div><div class="validation-nodes">${node(0)}${node(1)}${node(2)}</div><div class="diagram-shared">分别查看测试结果与适用范围 ↓</div>${node(3)}`;
  return nodes.map(nodeMarkup).join(arrow);
}
async function renderChapter(index: number) {
  chapterIndex = index; nodeIndex = 0;
  const version = ++renderVersion, c = CHAPTERS[index];
  document.querySelectorAll<HTMLButtonElement>('[data-chapter]').forEach(b => { if(b.dataset.chapter === c.id)b.setAttribute('aria-current','step');else b.removeAttribute('aria-current'); });
  $('#chapter').innerHTML = `<div class="chapter-heading"><p class="eyebrow">${c.kicker}</p><h2 id="chapter-title">${c.headline}</h2><p>${c.intro}</p></div><div class="mechanism"><div class="diagram-side"><div class="diagram-toolbar"><span><i></i> INTERACTIVE MAP</span><span>点击模块探索</span></div><div class="diagram diagram-${c.id}" aria-label="${c.title}分工图">${diagramMarkup(index)}</div><div class="diagram-caption"><span>↳</span> ${c.takeaway}</div></div><div id="node-detail" class="node-detail"></div></div><div class="experiment-card"><div class="experiment-heading"><span class="experiment-icon">↔</span><div><p class="eyebrow">TRY THE IDEA</p><h3>${c.experimentTitle}</h3></div><span class="mini-badge">交互实验</span></div><div id="experiment" aria-live="polite"><p class="loading-note">正在读取站点中的示例数据…</p></div></div><div class="chapter-pagination"><span>${String(index+1).padStart(2,'0')} / 06</span><button id="next-chapter">${index<5?'下一章 · '+CHAPTERS[index+1].title:'重新从 Kev 开始'} →</button></div>`;
  document.querySelectorAll<HTMLButtonElement>('[data-node]').forEach((b,i) => b.onclick = () => selectNode(i));
  $('#next-chapter').onclick = () => { void renderChapter((chapterIndex+1)%CHAPTERS.length); $('#learn').scrollIntoView({behavior:'smooth',block:'start'}); };
  selectNode(0);
  try {
    let bundle: EvidenceBundle | undefined;
    if (['decision','encoding','evidence'].includes(c.id)) bundle = await getBundle('case-01');
    if(version !== renderVersion) return;
    const exp = $('#experiment');
    if(c.id === 'decision') {
      const b = getCaseStage(bundle!, 'C');
      const request = buildQuestionRequest(b, b.evidence.map(e=>e.id));
      exp.innerHTML = `<div class="request-grid"><div class="request-box"><span class="eyebrow">01 / CONTEXT</span><h4>新服务器加入后，访问存储超时了。</h4><p>已有 ${b.evidence.length} 条合成观测：小包可达、大包失败，以及交换机端口 MTU 配置等。</p><details><summary>查看实际证据文字</summary><pre>${esc(request.state)}</pre></details></div><div class="request-box"><span class="eyebrow">02 / QUESTION</span><h4>当前最受证据支持的直接原因是什么？</h4><p>模型只比较提供的候选。证据不足或存在多重原因，也有专门的选项。</p><details><summary>查看发送给模型的问题</summary><pre>${esc(JSON.stringify(request.questions,null,2))}</pre></details></div></div><div class="candidate-chips">${CANDIDATES.map((x,i)=>`<span><b>${i+1}</b>${x.label}</span>`).join('')}</div><p class="experiment-note">这是实际请求构造函数生成的输入预览。此处没有运行模型，也没有把参考答案交给模型。</p>`;
    } else if(c.id === 'encoding') {
      exp.innerHTML = `<div class="experiment-controls"><label for="evidence-stage">逐步补充证据</label><select id="evidence-stage"><option value="A">A · 只有症状</option><option value="B">B · 加入路径观测</option><option value="C">C · 加入配置观测</option></select><span id="input-count" class="mini-badge"></span></div><div id="evidence-summary" class="evidence-summary"></div><pre id="input-preview" class="input-preview"></pre><p class="experiment-note">上面是实际 buildModelState() 的输出；阶段名与预设答案不进入 state。token 计数需加载固定 tokenizer，文字长度不等于 token 数。</p>`;
      const update = () => { const b = getCaseStage(bundle!, $<HTMLSelectElement>('#evidence-stage').value); const model = buildModelState(b); $('#input-count').textContent = `${model.includedIds.length} 条证据`; $('#input-preview').textContent = model.state; $('#evidence-summary').innerHTML = b.evidence.map(e=>`<span>${esc(e.id)}<small>${esc(e.kind)}</small></span>`).join(''); };
      $('#evidence-stage').onchange = update; update();
    } else if(c.id === 'engine') {
      exp.innerHTML = `<div class="engine-comparison"><div><span class="engine-letter">W</span><h4>WASM：让计算引擎在浏览器运行</h4><p>可以把它理解成浏览器能执行的编译后程序格式。这里承载 ONNX Runtime 的核心，读取模型图并组织运算。</p><code>ort.env.wasm.numThreads = 1</code></div><div><span class="engine-letter gpu-letter">G</span><h4>WebGPU：调动本机显卡加速计算</h4><p>它是浏览器连接显卡的标准接口。计算引擎借此加速繁重的矩阵与注意力运算，完成后由 CPU 计算各候选选项得分。</p><code>executionProviders: ['webgpu']</code></div></div><p class="experiment-note">显卡计算仍需要 WASM 推理引擎配合。分词、小型候选评分模块、形状与控制逻辑可在 CPU 上执行；Worker 是后台线程，并不是显卡。</p><div class="device-box"><button id="device-probe" class="button secondary">检查当前浏览器能否运行 ↗</button><pre id="device-result">尚未检测。只读能力检查，不下载模型，不启动推理。</pre></div>`;
      $('#device-probe').onclick = async () => { const button = $<HTMLButtonElement>('#device-probe'); button.disabled = true; try { const {report} = await inspectDevice(); if(version===renderVersion) $('#device-result').textContent = `${report.available?'能力检查通过，可以尝试加载 q8。':'当前环境未满足固定 q8 要求。'}\n${report.message}\n${report.adapter?JSON.stringify(report.adapter,null,2):''}\n这不是推理成功证明；未下载模型文件。`; } catch (e) { if(version===renderVersion) $('#device-result').textContent = `能力检查失败：${String(e)}。未下载模型。`; } finally {button.disabled=false;} };
    } else if(c.id === 'loading') {
      exp.innerHTML = `<div class="experiment-controls"><span class="mini-badge amber">概念演示</span><div class="segmented"><button data-cache-mode="first">首次加载</button><button data-cache-mode="cached">缓存命中</button><button data-cache-mode="offline">加载后断网</button></div></div><div id="cache-path" class="cache-path"></div><p id="cache-explanation"></p><p class="experiment-note">切换按钮只解释流程，不会实际下载文件、清除缓存或改变网络。33 个锁定文件共 826,680,926 bytes；下载大小不是运行内存或显存大小。</p>`;
      const modes = {
        first:{steps:['检查 GPU','下载公开文件','校验 SHA-256','保存缓存','建立会话'],text:'第一次：设备能力通过后，从锁定的公开地址下载约 826.7 MB。文件校验通过后才交给运行时；模型首次进入 GPU 还需要初始化。'},
        cached:{steps:['检查 GPU','读取本地缓存','重新校验','建立会话'],text:'再次加载：完整且有效的模型缓存可以省去模型文件下载。仍需读取、校验并建立会话；浏览器可能清理缓存，也可能因空间不足无法保存。'},
        offline:{steps:['模型已加载','关闭外部网络','新证据 → 本机判断'],text:'加载完成后：同一页面会话已验证可断网分析新的证据。这里没有 Service Worker；首次离线打开、关闭后重开或离线刷新都不作可用保证。'}
      };
      const update = (mode: keyof typeof modes) => { document.querySelectorAll<HTMLButtonElement>('[data-cache-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cacheMode===mode))); $('#cache-path').innerHTML = modes[mode].steps.map((s,i)=>`<div><span>${i+1}</span><strong>${s}</strong></div>`).join('<b aria-hidden="true">→</b>'); $('#cache-explanation').textContent=modes[mode].text; };
      document.querySelectorAll<HTMLButtonElement>('[data-cache-mode]').forEach(b=>b.onclick=()=>update(b.dataset.cacheMode as keyof typeof modes)); update('first');
    } else if(c.id === 'evidence') {
      const history = await getHistory(); if(version!==renderVersion)return;
      exp.innerHTML = `<div class="experiment-controls"><label for="history-case">切换历史案例</label><select id="history-case"><option value="case-01-C">MTU 配置观测 · 模型答错</option><option value="case-02">主机卷映射 · 模型答对</option><option value="case-03">容量写保护 · 模型答错</option></select></div><div class="history-grid"><div id="history-results"></div><div id="rule-results"></div></div><p class="experiment-note">左侧为 Apple M3 历史实测，右侧为当前页面执行的确定性规则。规则不修改模型概率，也不是模型的思维链。没有在此重新运行模型。</p>`;
      let requestId=0;
      const update = async () => { const current=++requestId; const id=$<HTMLSelectElement>('#history-case').value; const h=history.cases.find(x=>x.id===id)!; const b=id==='case-01-C'?getCaseStage(bundle!,'C'):await getBundle(id); if(current!==requestId||version!==renderVersion)return; const report=evaluateEvidence(b); const target=(id==='case-01-C'?'storage_network_mtu_mismatch':id==='case-02'?'host_volume_mapping_gap':'powerstore_capacity_write_protect') as CandidateId; const r=report.candidates.find(x=>x.candidateId===target)!;
        $('#history-results').innerHTML=`<p class="eyebrow">KEV / 历史实测记录</p><h4>${h.correct?'这次选对了':'模型此次判断错误，数据如实保留'}</h4><p class="history-meta">${new Date(history.recordedAt).toISOString().slice(0,10)} · 本机 q8 · ${h.wallMs.toFixed(1)} ms</p>${Object.entries(h.probabilities).sort((a,b)=>b[1]-a[1]).map(([key,p])=>`<div class="prob-row ${key===h.selected?'selected':''}"><div><span>${esc(label(key))}</span><b>${(p*100).toFixed(2)}%</b></div><div class="prob-track"><i style="width:${p*100}%"></i></div></div>`).join('')}<p class="experiment-note">概率为给定候选间的模型偏好，尚未针对 RCA 校准。</p>`;
        $('#rule-results').innerHTML=`<p class="eyebrow">DETERMINISTIC / 证据复核</p><h4>对照：${label(target)}</h4><p class="history-meta">测试标签用于评分，未发送给模型。</p><div class="rule-group"><strong>支持证据 <span>${r.supportingIds.length}</span></strong><div>${r.supportingIds.map(id=>`<button data-evidence-id="${esc(id)}">${esc(id)} ↗</button>`).join('')||'<span>无匹配证据</span>'}</div></div><div class="rule-group"><strong>反对证据 <span>${r.contradictingIds.length}</span></strong><div>${r.contradictingIds.map(id=>`<button data-evidence-id="${esc(id)}">${esc(id)} ↗</button>`).join('')||'<span>无匹配证据</span>'}</div></div><div class="rule-group"><strong>缺失观测</strong><p>${esc(r.missingObservations.join('；')||'该候选规则没有报告缺失项。')}</p></div><pre id="fact-detail">点击证据 ID，查看原始事实。</pre>`;
        document.querySelectorAll<HTMLButtonElement>('[data-evidence-id]').forEach(button=>button.onclick=()=>{ $('#fact-detail').textContent=JSON.stringify(b.evidence.find(e=>e.id===button.dataset.evidenceId),null,2); });
      }; $('#history-case').onchange=()=>{ void update().catch(e=>{if(version===renderVersion) $('#rule-results').textContent=String(e);}); }; await update();
    } else {
      exp.innerHTML = `<div class="validation-grid"><article class="validation-card"><span class="mini-badge">数值诊断通过</span><strong>49<span> / 49</span></strong><h4>与上游参考相近吗？</h4><p>49 道题共 149 个候选概率符合既定误差容限，最高分选项没有改变；43 条记录的编码一致。</p><small>不等于 RCA 答对 49 次。</small></article><article class="validation-card failed"><span class="mini-badge amber">语义验收未通过</span><strong>8<span> / 34</span></strong><h4>领域判断正确吗？</h4><p>合成故障开发集中，可接受的首选答案为 8/34；9 个应选择“证据不足”等弃权选项的案例中，正确弃权为 0。</p><small>错误预测保留，未用规则覆盖。</small></article><article class="validation-card"><span class="mini-badge">历史本机计时</span><strong>401.5<span> ms</span></strong><h4>一次判断要多久？</h4><p>Apple M3 · Chrome 154，3 次预热后 30 次采样的 P50；P95 为 960.5 ms。</p><small>其他设备速度可能不同。</small></article></div><div class="validation-foot"><p>原生 GPU profile 中 840 次大矩阵／注意力算子事件由 WebGPU 执行。部分 CPU 运算是允许的。完整 formal parity、峰值 VRAM 与长期稳定性仍未验证。</p><a class="text-link" href="${REPO}/blob/main/docs/verification.md" target="_blank" rel="noreferrer">阅读验收条件与局限 ↗</a><a class="text-link" href="${BASE}guide-validation.json" target="_blank" rel="noreferrer">查看 34 条原始概率摘要 ↗</a></div>`;
    }
  } catch(e) { if(version===renderVersion) $('#experiment').textContent=`示例读取失败：${String(e)}。请刷新后重试；图解仍可使用。`; }
}
document.querySelectorAll<HTMLButtonElement>('[data-chapter]').forEach((b,i)=>b.onclick=()=>{void renderChapter(i);});
$('#open-demo').onclick = () => { if($('#demo-frame'))return; const frame=document.createElement('iframe'); frame.id='demo-frame'; frame.title='Kev 真实 RCA 工作台'; frame.src=`${BASE}demo/`; frame.loading='eager'; $('#demo-mount').append(frame); $('#open-demo').textContent='工作台已打开 ↓'; frame.scrollIntoView({behavior:'smooth',block:'start'}); };
void renderChapter(0);
