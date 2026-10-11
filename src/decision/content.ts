export interface LessonNode {
  id: string;
  title: string;
  body: string;
  input: string;
  output: string;
  source: { label: string; href: string };
}

export interface Lesson {
  id: 'contract' | 'family' | 'scoring' | 'execution' | 'review';
  short: string;
  title: string;
  intro: string;
  takeaway: string;
  nodes: LessonNode[];
}

// Research checked on 2026-10-11. Runtime links identify the installed revision.
const KEV_SOURCE =
  'https://github.com/ai-ecoverse/kev.js/blob/ca072e49e65b716af478db8f464e1fac8a0f4ad5/src/';
const VERIFICATION =
  'https://github.com/minatoaquaMK2/kev-webgpu/blob/main/docs/verification.md';
const PRIMITIVES = 'https://docs.typesafe.ai/primitives';
const CONFIDENCE = 'https://docs.typesafe.ai/confidence';

export const LESSONS: Lesson[] = [
  {
    id: 'contract',
    short: '输入与类型',
    title: '先把问题和答案的范围说清楚',
    intro:
      '决策模型适合回答范围明确的小问题。你提供背景、问题和评判标准，它返回程序能直接读取的值。本章只组装和检查请求；修改文字不会自动产生新的模型判断。',
    takeaway:
      'Noul 问“是不是”，Choice 问“哪一个”，Score 问“到哪一级”；先选对问题类型，再解释返回值。',
    nodes: [
      {
        id: 'state',
        title: '背景：让模型看到哪些材料',
        body:
          'state 是本次判断能参考的材料，可以是文字、对象或数组。把相关观察、来源和必要上下文放进去，明确哪些信息未知。结构清楚便于核对，但通过格式检查并不能证明材料真实。',
        input: '例如：访问超时、路径测试结果、观察时间。',
        output: '一份提供给问题使用的背景材料。',
        source: { label: 'TypeSafe：输入与问题', href: PRIMITIVES },
      },
      {
        id: 'question',
        title: '问题：一次问清一件事',
        body:
          'instructions 写出完整问题。Noul 返回判断为真的概率，Choice 从已列选项中选一个，Score 衡量所处的等级。复杂任务可以拆成小问题，再由代码组合；问题名称供代码识别，不会作为问题正文送入模型。',
        input: '一个明确问题，以及 noul、choice 或 score 类型。',
        output: '模型这次需要完成的具体判断。',
        source: { label: 'TypeSafe：三种问题原语', href: PRIMITIVES },
      },
      {
        id: 'criteria',
        title: '标准：把可选答案讲明白',
        body:
          'Choice 列出候选及含义；Score 按顺序列出程度等级；Noul 可补充“是”和“否”的条件。如果现有候选没有覆盖所有情况，可以补上“其他”或“证据不足”。模型只能在给定的答案范围内表达判断。',
        input: '候选定义，或从轻到重排列的等级说明。',
        output: '答案的范围与每个答案的解释。',
        source: { label: 'TypeSafe：选择问题类型', href: PRIMITIVES },
      },
      {
        id: 'answer',
        title: '返回值：程序能读懂的判断',
        body:
          'Noul 返回“是”的概率，0.5 表示模型没有偏向“是”或“否”。Choice 返回最高项及完整分布；Score 返回等级的概率加权值，可以落在两级之间。Choice 和 Score 另有 confidence，但它不等于实际正确率。',
        input: '模型对给定问题算出的概率分布。',
        output: '有明确字段的答案，供程序展示、比较或复核。',
        source: { label: 'TypeSafe：概率与 confidence', href: CONFIDENCE },
      },
    ],
  },
  {
    id: 'family',
    short: '名称与关系',
    title: 'Jev、Kev、kev.js 各指什么',
    intro:
      '名字相近，职责和来源却要分别看。Jev 是 TypeSafe 的决策模型服务，Kev 是独立的开放模型项目，kev.js 让 Kev 能在浏览器运行，本站再把它们的概念用于可检查的教学与演示。',
    takeaway:
      '相似的请求接口便于对接，不代表相同权重、内部架构、训练方法或判断效果。资料核对日期：2026-10-11。',
    nodes: [
      {
        id: 'jev',
        title: 'Jev：TypeSafe 的托管模型',
        body:
          '截至 2026-10-11，官方列出的型号为 jev-1.13.0，通过托管 API 接收文字请求。官方 SDK 是访问服务的客户端；本次调研未找到官方模型权重下载入口。本页介绍其接口，不调用 Jev，也不收集 API 密钥。',
        input: '服务端接收的 state 与带类型的问题。',
        output: 'TypeSafe 服务返回的结构化答案。',
        source: { label: 'TypeSafe：当前模型与接口', href: 'https://docs.typesafe.ai/models' },
      },
      {
        id: 'kev',
        title: 'Kev：可自行运行的独立模型',
        body:
          'Kev 上游提供模型权重和训练代码，以 Qwen 为基础，采用与 TypeSafe 相似的决策接口。它是独立的 Jev-like 项目，不是 Jev 官方开源版。两者不能当作同一套权重，也不能互相借用成绩。',
        input: '模型权重，以及背景、问题和候选。',
        output: 'Kev 自己计算出的候选概率。',
        source: { label: 'Kev：项目与模型来源', href: 'https://github.com/jaredpalmer/kev' },
      },
      {
        id: 'kevjs',
        title: 'kev.js：浏览器里的运行适配库',
        body:
          'kev.js 把请求转成模型输入，调用运行时，再整理候选概率。它连接模型与网页，不是另一个模型。本站锁定 1.0.0；本章后面的内部结构只讲这份可检查的 Kev 实现，不推断 Jev 内部也一样。',
        input: '固定模型文件以及包含背景、问题与候选的请求。',
        output: '编码、模型计算与答案整理组成的调用过程。',
        source: { label: '固定 kev.js：运行入口', href: `${KEV_SOURCE}model.ts` },
      },
      {
        id: 'site',
        title: '本站：保留真实结果的教学演示',
        body:
          '本站固定使用 Kev-0.8B text q8，并把合成存储故障转成选择题。历史模型答案与独立证据核对分别展示，判断错误的记录也原样保留。学习页中的输入组装、数学滑块和历史记录筛选，都不执行新的模型推理。',
        input: '合成观察、固定候选，以及已有验证记录。',
        output: '可追溯的教学图示和本地推理工作台。',
        source: { label: '本站：公开验证记录', href: VERIFICATION },
      },
    ],
  },
  {
    id: 'scoring',
    short: '候选怎样评分',
    title: '从文字位置，到每个选项的概率',
    intro:
      '下面展开本站固定 Kev 的计算路径：文字编码、主干表示、候选评分、概率转换。数学实验使用手动设置的示意分数，只演示公式，不运行模型，也不证明这些概率在实际任务上已经校准。',
    takeaway:
      'Kev 读取上下文后比较候选，而非逐字生成解释。温度改变概率分布的尖锐程度，不能把一个选错的答案自动变对。',
    nodes: [
      {
        id: 'encode',
        title: '编码：标记文字与候选的位置',
        body:
          '分词器把文字变成数字编号，编码器标出背景、问题、各候选和决策位置。模型随后依据这些编号与位置计算。一个 token 不一定是一整字或单词，候选定义也属于要读取的输入。',
        input: '背景文字、问题指令、候选描述。',
        output: 'token 编号，以及候选和决策位置。',
        source: { label: '固定 kev.js：输入编码', href: `${KEV_SOURCE}encode.ts` },
      },
      {
        id: 'backbone',
        title: '主干：算出带上下文的表示',
        body:
          '模型主干将文字和上下文算成一组数字表示，再取出候选位置与决策位置的表示。同一道题里的选项共享上下文，前后顺序可能影响模型打分。不同问题分别计算，不代表同一题里的选项彼此隔离。',
        input: '编码后的背景和当前问题分支。',
        output: '供评分模块读取的位置表示。',
        source: { label: '固定 kev.js：主干与问题分支', href: `${KEV_SOURCE}model.ts` },
      },
      {
        id: 'head',
        title: '评分头：比较每个候选',
        body:
          '小型指针评分头（pointer head）将决策位置与候选位置的表示分别转换后计算匹配度。每个候选得到一个尚未转化为概率的原始分数（logits）；模型直接输出评分，并不生成长段文本解释。',
        input: '主干输出的位置表示和评分头权重。',
        output: '每个候选的原始分数，通常叫 logits。',
        source: { label: '固定 kev.js：pointer head', href: `${KEV_SOURCE}head.ts` },
      },
      {
        id: 'probabilities',
        title: '概率：让分数变成一组占比',
        body:
          '先把分数除以正的温度参数，再用 softmax 转成总和为 1 的概率。相同分数下，温度高会更平缓，低会更集中；最高项的顺序不变。滑块只是数学示意，不会改写历史模型输出或测得新准确率。',
        input: '候选原始分数与温度参数 T。',
        output: '候选概率；再按题型整理答案与 confidence。',
        source: { label: '固定 kev.js：温度与 softmax', href: `${KEV_SOURCE}head.ts` },
      },
    ],
  },
  {
    id: 'execution',
    short: '执行与开销',
    title: '网页里的计算，怎样交给本机完成',
    intro:
      '省去逐 token 生成循环，仍需要读取输入并执行模型计算。本站由 Worker、WASM、WebGPU 和 CPU 协作；首次下载与建立会话是准备成本，每次查询另有耗时。没有远程推理账单，也不能把总成本写成零。',
    takeaway:
      '一次应用查询可能包含多次运行时调用和很多 GPU 命令；没有逐字解码循环，不等于只调用一次 ORT 或只执行一个 GPU 算子。',
    nodes: [
      {
        id: 'wasm',
        title: 'WASM：让推理引擎在浏览器运行',
        body:
          'WASM 承载编译后的 ONNX Runtime 核心，安排运算并参与部分 CPU 工作，再把支持的主要计算交给 WebGPU。用显卡时仍需要这层运行时；下载 WASM 文件不代表模型全在 CPU 上运行。',
        input: '模型计算图、权重与输入数据。',
        output: '运行时安排的 CPU 与 GPU 工作。',
        source: { label: '本站：GPU 与 WASM 验证', href: VERIFICATION },
      },
      {
        id: 'worker',
        title: 'Worker：把任务与页面交互分开',
        body:
          'Worker 是浏览器的独立工作线程，承接加载与推理，再把状态和结果发回页面。它减少长任务对界面交互的影响，却不等于显卡，也不自动加速模型。本站一次只处理一个推理任务。',
        input: '页面发来的加载、分析和生命周期消息。',
        output: '进度、答案或错误，供页面更新显示。',
        source: { label: '本站：浏览器执行验证', href: VERIFICATION },
      },
      {
        id: 'gpu',
        title: 'WebGPU：把大规模计算交给显卡',
        body:
          'WebGPU 是浏览器访问本机 GPU 的接口，本站用它执行主要矩阵和注意力运算。一次查询包含许多命令，速度取决于设备与输入。历史 GPU 记录证明当时的执行情况，不能代替你设备的新测量。',
        input: '运行时提交的计算任务与 GPU 数据。',
        output: '模型主干计算出的数值结果。',
        source: { label: '本站：实际 GPU 记录及限制', href: VERIFICATION },
      },
      {
        id: 'cpu',
        title: 'CPU：编码、候选评分和控制',
        body:
          'CPU 仍负责文字编码、控制和部分辅助计算；小型候选评分头在 JavaScript 中执行。GPU 完成主干后，程序继续整理结果。下载体积、运行内存、电量与时间是不同指标，不能用其中一个替代其他几个。',
        input: '文字、主干输出的表示，以及评分头参数。',
        output: '编码输入、候选概率与可展示的答案。',
        source: { label: '固定 kev.js：JavaScript 评分头', href: `${KEV_SOURCE}head.ts` },
      },
    ],
  },
  {
    id: 'review',
    short: '结果与行动',
    title: '模型给了高分，下一步仍由程序和人决定',
    intro:
      '模型输出、应用策略、事实核对和保存记录是四件事。这里的门槛实验只筛选 34 条历史合成开发记录，观察覆盖数量与错误；它不调整模型，也不为真实运维提供可直接采用的阈值。',
    takeaway:
      '历史开发集只有 8/34 个首选答案可接受，语义验收未通过。格式正确、计算接近参考、高概率，都不能代替领域正确性与人工复核。',
    nodes: [
      {
        id: 'model',
        title: '模型结果：保留它实际选了什么',
        body:
          '先保留完整分布与原始选中项。最高项概率描述本题候选之间的分配；confidence 是从分布计算出的另一个量，两者都不是已测正确率。即使返回格式完全正确，模型仍可能选错候选。',
        input: '真实模型返回的选项、概率与 confidence。',
        output: '未经业务规则改写的模型结果。',
        source: { label: 'TypeSafe：confidence 的含义', href: CONFIDENCE },
      },
      {
        id: 'policy',
        title: '应用策略：观察门槛会留下什么',
        body:
          '这里的门槛看最高项的概率，和 confidence 是两个不同的量。提高门槛会减少被保留的记录，却不保证剩下的都正确。这是在同一开发集上做事后统计，不能当成新的模型成绩或生产阈值。',
        input: '34 条已保存的概率与手动选择的门槛。',
        output: '保留、暂缓、答对和答错的记录数量。',
        source: { label: '本站：开发集组成与验收边界', href: VERIFICATION },
      },
      {
        id: 'inspect',
        title: '事实核对：查看支持、反对和缺失',
        body:
          '网页另用人工编写的规则核对证据，列出支持项、反对项和缺失观察。这些说明不是模型的思维链，也不会覆盖模型预测。结果有分歧时保留分歧，由人检查；本站不会执行设备检查或修复。',
        input: '同一组证据，以及独立的核对规则。',
        output: '可追溯到观察的复核材料。',
        source: { label: '本站：模型判断与证据核对', href: VERIFICATION },
      },
      {
        id: 'record',
        title: '保存记录：让别人能复查结论',
        body:
          '34 条合成开发记录中只有 8 条首选答案可接受，应弃权的 9 条中没有正确弃权。另有 49 个上游问题通过数值容差检查，回答的是计算是否接近参考。两类检查用途不同，跨推理引擎的完整一致性（parity）验证仍未完成。',
        input: '输入快照、版本、原始输出、计时与事后评估标签。',
        output: '保留成功和失败的历史记录，不冒充当前运行。',
        source: { label: '本站：完整公开验证说明', href: VERIFICATION },
      },
    ],
  },
];

export const SOURCES: Array<{ label: string; href: string; note: string }> = [
  {
    label: 'TypeSafe：问题原语',
    href: PRIMITIVES,
    note: 'Noul、Choice、Score 的输入与返回语义；资料核对于 2026-10-11。',
  },
  {
    label: 'TypeSafe：模型版本',
    href: 'https://docs.typesafe.ai/models',
    note: '研究日列出 jev-1.13.0、文字输入与托管接口；别名会随发布更新。',
  },
  {
    label: 'TypeSafe：confidence',
    href: CONFIDENCE,
    note: 'Choice 与 Score 使用不同公式；confidence 是分布统计量。',
  },
  {
    label: 'TypeSafe：Jev 1.13 的限制',
    href: 'https://docs.typesafe.ai/model-jaggedness/jev-1.13',
    note: '官方列出计算、上下文与选项顺序等问题；页面复核日期为 2026-10-02。',
  },
  {
    label: 'TypeSafe：官方 JavaScript SDK',
    href: 'https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/client.ts',
    note: 'v0.6.0 是访问服务的客户端；开放 SDK 不等于公开 Jev 模型权重。',
  },
  {
    label: 'Kev：模型项目',
    href: 'https://github.com/jaredpalmer/kev',
    note: '独立的 Jev-like 模型家族与训练代码；本站仍使用锁定的 0.8B q8。',
  },
  {
    label: 'kev.js：固定编码实现',
    href: `${KEV_SOURCE}encode.ts`,
    note: '将输入转换为 token 与位置；链接固定到本站 runtime 提交。',
  },
  {
    label: 'kev.js：固定评分头',
    href: `${KEV_SOURCE}head.ts`,
    note: '候选评分、温度与 softmax 的可检查实现。',
  },
  {
    label: 'kev.js：固定运行实现',
    href: `${KEV_SOURCE}model.ts`,
    note: '背景与问题分支的计算流程；一次查询不等于一次 GPU 命令。',
  },
  {
    label: '本站：公开验证记录',
    href: VERIFICATION,
    note: '34 条历史开发记录、49 项数值诊断与 GPU 记录，各有不同适用范围。',
  },
];
