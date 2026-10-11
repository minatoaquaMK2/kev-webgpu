/** Small, self-contained teaching diagrams. Values and vectors are illustrative. */
export type SceneId = 'contract' | 'family' | 'scoring' | 'execution' | 'review';

export const SCENE_NODES: Record<SceneId, { id: string; title: string }[]> = {
  contract: [
    { id: 'state', title: '背景' },
    { id: 'question', title: '问题' },
    { id: 'criteria', title: '候选定义' },
    { id: 'answer', title: '类型化输出' },
  ],
  family: [
    { id: 'jev', title: 'Jev · TypeSafe 托管' },
    { id: 'kev', title: 'Kev · 开放模型家族' },
    { id: 'kevjs', title: 'kev.js · 浏览器适配库' },
    { id: 'site', title: '本站 · 0.8B q8' },
  ],
  scoring: [
    { id: 'encode', title: '文字编码' },
    { id: 'backbone', title: '模型主干' },
    { id: 'head', title: '候选评分模块' },
    { id: 'probabilities', title: '概率与选中项' },
  ],
  execution: [
    { id: 'wasm', title: 'WASM 运行时' },
    { id: 'worker', title: 'Worker 后台任务' },
    { id: 'gpu', title: '显卡主干' },
    { id: 'cpu', title: 'CPU 编码与评分' },
  ],
  review: [
    { id: 'model', title: '模型分布' },
    { id: 'policy', title: '程序阈值' },
    { id: 'inspect', title: '人工复核' },
    { id: 'record', title: '保留记录' },
  ],
};

const esc = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

const sceneCopy: Record<SceneId, { title: string; description: string }> = {
  contract: {
    title: '先约定问题，再让模型作答',
    description: '背景、问题和候选定义汇合成一次请求。模型比较候选，再返回符合约定结构的输出。点击四个模块阅读说明。',
  },
  family: {
    title: 'Jev、Kev、kev.js 与本站的关系',
    description: 'Jev 是 TypeSafe 托管的服务，Kev 是开放模型家族，二者接口语义相似但独立实现。本站通过 kev.js 在浏览器运行 Kev 0.8B q8，没有调用 Jev。点击四个模块阅读说明。',
  },
  scoring: {
    title: '共享编码，再对候选位置评分',
    description: '文字编码进入同一个模型主干。主干中不同候选位置的表示进入评分模块，再形成概率和选中项。A、B、C 及向量均为结构示意，不是真实分数，也不是三次独立编码。点击四个模块阅读说明。',
  },
  execution: {
    title: '浏览器中的运行分工',
    description: 'Worker 把模型任务放在后台线程，减少对页面操作的影响。WASM 承载运行时，WebGPU 调用显卡执行主要模型运算，CPU 参与编码、候选评分和控制逻辑。Worker 是线程机制，不是显卡。点击四个模块阅读说明。',
  },
  review: {
    title: '模型输出之后，还需要程序判断与人工复核',
    description: '模型给出分布，程序按阈值形成提示或弃权，人工结合原始证据复核。记录同时保留模型分布和复核意见，此处没有自动修复设备的步骤。点击四个模块阅读说明。',
  },
};

function frame(scene: SceneId, content: string): string {
  const prefix = `dm-${scene}`;
  const copy = sceneCopy[scene];
  return `<svg class="dm-diagram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 880 420" role="group" aria-labelledby="${prefix}-title" aria-describedby="${prefix}-desc">
    <title id="${prefix}-title">${esc(copy.title)}</title>
    <desc id="${prefix}-desc">${esc(copy.description)}</desc>
    <defs>
      <pattern id="${prefix}-dots" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#d5dfce" /></pattern>
      <marker id="${prefix}-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 1 1 L 8 5 L 1 9" fill="none" stroke="#78917a" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></marker>
    </defs>
    <style>
      .dm-diagram{font-family:inherit;color:#233c32}
      .dm-diagram text{font-family:inherit}
      .dm-diagram .dm-edge{fill:none;stroke:#78917a;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
      .dm-diagram .dm-dashed{stroke-dasharray:5 6}
      .dm-diagram .dm-label{fill:#657968;font-size:14px}
      .dm-diagram .dm-note{fill:#6b7c6d;font-size:14px}
      .dm-diagram .dm-kicker{fill:#62775d;font-size:13px;letter-spacing:1px}
      .dm-diagram .dm-node{cursor:pointer;outline:none}
      .dm-diagram .dm-node-box{fill:#fffef8;stroke:#bacab3;stroke-width:1.3}
      .dm-diagram .dm-node-title{fill:#244934;font-size:18px;font-weight:600}
      .dm-diagram .dm-node-caption{fill:#6a7e68;font-size:14px}
      .dm-diagram .dm-node-dot{fill:#bdceb0}
      .dm-diagram .dm-node:hover .dm-node-box{stroke:#658762;stroke-width:2}
      .dm-diagram .dm-node[aria-pressed="true"] .dm-node-box{fill:#214d39;stroke:#214d39}
      .dm-diagram .dm-node[aria-pressed="true"] .dm-node-title{fill:#fffef5}
      .dm-diagram .dm-node[aria-pressed="true"] .dm-node-caption{fill:#d9e7ce}
      .dm-diagram .dm-node[aria-pressed="true"] .dm-node-dot{fill:#d2e590}
      .dm-diagram .dm-node:focus-visible .dm-node-box{stroke:#629837;stroke-width:4}
    </style>
    <rect width="880" height="420" rx="18" fill="#f6f8ef" />
    <rect width="880" height="420" rx="18" fill="url(#${prefix}-dots)" opacity=".72" />
    ${content}
  </svg>`;
}

function node(scene: SceneId, active: string, id: string, x: number, y: number, width: number, title: string, caption: string, height = 80): string {
  const label = SCENE_NODES[scene].find(item => item.id === id)!.title;
  return `<g class="dm-node" data-scene-node="${id}" role="button" tabindex="0" aria-label="${esc(label)}" aria-pressed="${active === id}">
    <rect class="dm-node-box" x="${x}" y="${y}" width="${width}" height="${height}" rx="12" />
    <circle class="dm-node-dot" cx="${x + width - 17}" cy="${y + 17}" r="3" aria-hidden="true" />
    <text class="dm-node-title" x="${x + 18}" y="${y + 32}">${esc(title)}</text>
    <text class="dm-node-caption" x="${x + 18}" y="${y + 58}">${esc(caption)}</text>
  </g>`;
}

function edge(scene: SceneId, path: string, dashed = false, arrow = true): string {
  return `<path class="dm-edge${dashed ? ' dm-dashed' : ''}" d="${path}"${arrow ? ` marker-end="url(#dm-${scene}-arrow)"` : ''} />`;
}

function label(x: number, y: number, text: string, anchor: 'start' | 'middle' = 'middle'): string {
  return `<text class="dm-label" x="${x}" y="${y}" text-anchor="${anchor}">${esc(text)}</text>`;
}

function contract(active: string): string {
  const scene = 'contract';
  return frame(scene, `
    ${edge(scene, 'M 266 82 H 312 V 211 H 375')}
    ${edge(scene, 'M 266 211 H 375')}
    ${edge(scene, 'M 266 340 H 312 V 211 H 375')}
    ${edge(scene, 'M 505 211 H 607')}
    ${label(319, 183, '一次请求', 'start')}
    ${label(556, 189, '比较后返回')}
    <rect x="375" y="173" width="130" height="76" rx="18" fill="#e4edda" stroke="#afc39d" />
    <text x="440" y="205" text-anchor="middle" fill="#315a3d" font-size="21" font-weight="600">模型</text>
    <text x="440" y="229" text-anchor="middle" class="dm-label">理解并比较</text>
    <path d="M 426 162 V 155 M 440 162 V 155 M 454 162 V 155 M 426 260 V 267 M 440 260 V 267 M 454 260 V 267" stroke="#9aaf8a" stroke-width="2" stroke-linecap="round" />
    <text class="dm-note" x="376" y="322">先定义允许的答案，</text>
    <text class="dm-note" x="376" y="345">再请模型在约定范围内作答。</text>
    ${node(scene, active, 'state', 36, 42, 230, '背景 · state', '提供当前已知的事实')}
    ${node(scene, active, 'question', 36, 171, 230, '问题 · question', '明确这次要判断什么')}
    ${node(scene, active, 'criteria', 36, 300, 230, '候选定义 · criteria', '说明选项与输出格式')}
    ${node(scene, active, 'answer', 607, 171, 237, '类型化输出', '按事先约定的结构返回')}
  `);
}

function family(active: string): string {
  const scene = 'family';
  return frame(scene, `
    <rect x="32" y="28" width="816" height="145" rx="16" fill="#fdfdf7" stroke="#d6dfce" />
    <rect x="32" y="235" width="816" height="159" rx="16" fill="#edf3e6" stroke="#c6d6bc" />
    ${edge(scene, 'M 176 153 V 286', true, false)}
    ${edge(scene, 'M 286 326 H 352')}
    ${edge(scene, 'M 570 326 H 633')}
    ${label(196, 211, '相似接口 · 各自实现', 'start')}
    ${label(319, 309, '权重')}
    ${label(601, 309, '适配')}
    <text class="dm-kicker" x="56" y="55">托管服务</text>
    <text class="dm-kicker" x="352" y="263">本站使用的本地运行路径</text>
    <text fill="#365640" font-size="18" x="352" y="97">Jev 由 TypeSafe 提供服务</text>
    <text class="dm-note" x="352" y="127">本站没有调用 Jev，也不通过它取得 Kev 权重。</text>
    ${node(scene, active, 'jev', 66, 73, 220, 'Jev', 'TypeSafe 托管', 80)}
    ${node(scene, active, 'kev', 66, 286, 220, 'Kev', '开放的决策模型家族')}
    ${node(scene, active, 'kevjs', 352, 286, 218, 'kev.js', '浏览器推理适配库')}
    ${node(scene, active, 'site', 633, 286, 193, '本站', 'Kev 0.8B · text q8')}
  `);
}

function vector(x: number, y: number, letter: string): string {
  return `<g aria-hidden="true"><rect x="${x}" y="${y}" width="96" height="44" rx="8" fill="#ebf1e2" stroke="#bbcfac" /><text x="${x + 11}" y="${y + 27}" fill="#607954" font-size="14">位置 ${letter}</text><path d="M ${x + 68} ${y + 14} v 16 M ${x + 75} ${y + 19} v 11 M ${x + 82} ${y + 11} v 19" stroke="#87a573" stroke-width="3" stroke-linecap="round" /></g>`;
}

function scoring(active: string): string {
  const scene = 'scoring';
  return frame(scene, `
    ${edge(scene, 'M 206 211 H 263')}
    ${edge(scene, 'M 445 211 H 470 V 119 H 487')}
    ${edge(scene, 'M 445 211 H 487')}
    ${edge(scene, 'M 445 211 H 470 V 303 H 487')}
    ${edge(scene, 'M 583 119 H 607 V 211 H 631')}
    ${edge(scene, 'M 583 211 H 631')}
    ${edge(scene, 'M 583 303 H 607 V 211 H 631')}
    ${edge(scene, 'M 736 251 V 316')}
    <text class="dm-kicker" x="36" y="41">一次共享编码，再比较候选位置</text>
    <text class="dm-note" x="36" y="68">A / B / C 与向量均为结构示意，不是真实模型结果。</text>
    ${label(233, 192, '编码')}
    ${label(752, 292, '归一化与选择', 'start')}
    <text class="dm-note" x="36" y="351">不是三个选项各跑一遍模型；</text>
    <text class="dm-note" x="36" y="377">也不是逐字生成一篇回答。</text>
    ${vector(487, 97, 'A')}
    ${vector(487, 189, 'B')}
    ${vector(487, 281, 'C')}
    ${node(scene, active, 'encode', 36, 171, 170, '文字编码', '把请求转为 token')}
    ${node(scene, active, 'backbone', 263, 171, 182, '模型主干', '读取共享输入')}
    ${node(scene, active, 'head', 631, 171, 210, '候选评分模块', '比较候选位置的表示')}
    ${node(scene, active, 'probabilities', 631, 316, 210, '概率与选中项', '返回分布与候选标识')}
  `);
}

function execution(active: string): string {
  const scene = 'execution';
  return frame(scene, `
    <rect x="22" y="24" width="836" height="371" rx="18" fill="#fbfcf6" stroke="#cbd8c1" stroke-width="1.5" />
    <rect x="45" y="78" width="535" height="278" rx="14" fill="#edf3e5" stroke="#becfae" stroke-dasharray="5 5" />
    ${edge(scene, 'M 262 144 H 349')}
    ${edge(scene, 'M 166 184 V 294 H 349')}
    ${edge(scene, 'M 446 254 V 184')}
    ${edge(scene, 'M 544 144 H 788 V 254')}
    ${edge(scene, 'M 620 294 H 544')}
    <text class="dm-kicker" x="44" y="52">当前浏览器</text>
    <text class="dm-kicker" x="67" y="100">WEB WORKER 范围</text>
    ${label(306, 134, '任务')}
    ${label(182, 277, '调度', 'start')}
    ${label(464, 222, '编码数据', 'start')}
    ${label(648, 127, 'WebGPU 计算任务')}
    ${label(583, 315, '表示')}
    <text class="dm-note" x="620" y="198">Worker 是后台线程，</text>
    <text class="dm-note" x="620" y="222">显卡通过 WebGPU 调用。</text>
    <text class="dm-note" x="67" y="381">CPU 也参与张量形状计算与流程控制；并非所有步骤都在显卡上完成。</text>
    ${node(scene, active, 'worker', 70, 104, 192, 'Worker', '组织后台任务')}
    ${node(scene, active, 'wasm', 349, 104, 195, 'WASM 运行时', '承载与组织推理')}
    ${node(scene, active, 'cpu', 349, 254, 195, 'CPU', '文字编码与候选评分')}
    ${node(scene, active, 'gpu', 620, 254, 206, '显卡主干', '主要矩阵与注意力运算')}
  `);
}

function review(active: string): string {
  const scene = 'review';
  return frame(scene, `
    ${edge(scene, 'M 240 210 H 331')}
    ${edge(scene, 'M 531 210 H 573 V 130 H 625')}
    ${edge(scene, 'M 730 170 V 275')}
    ${edge(scene, 'M 145 250 V 315 H 625', true)}
    <text class="dm-kicker" x="50" y="45">把模型判断放进可复核的工作流程</text>
    ${label(286, 193, '分布')}
    ${label(574, 110, '提示 / 弃权')}
    ${label(746, 230, '复核意见', 'start')}
    ${label(385, 301, '保留原始分布')}
    <text class="dm-note" x="50" y="374">选中一项 ≠ 证明它正确。这里的下一步是复核与记录。</text>
    ${node(scene, active, 'model', 50, 170, 190, '模型分布', '候选的相对分数')}
    ${node(scene, active, 'policy', 331, 170, 200, '程序阈值', '由应用决定如何呈现')}
    ${node(scene, active, 'inspect', 625, 90, 210, '人工复核', '回到原始证据核查')}
    ${node(scene, active, 'record', 625, 275, 210, '保留记录', '证据、结果与复核意见')}
  `);
}

/** The caller owns pointer/keyboard events; each diagram exposes four buttons. */
export function diagramMarkup(scene: SceneId, active: string): string {
  return { contract, family, scoring, execution, review }[scene](active);
}
