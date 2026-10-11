# Decision 模型子页：研究与教学契约

资料核对日期：2026-10-11。对象为 TypeSafe Jev 的公开接口、Jared Palmer 的 Kev，以及本站锁定的 kev.js 1.0.0 / Kev-0.8B text q8。没有调用 Jev API、下载新模型或改变现有模型锁。

## 一手资料

| 来源 | 用于确认 |
| --- | --- |
| [TypeSafe Introduction](https://docs.typesafe.ai/introduction) | state + typed questions；三个问题原语；问题各自求值 |
| [Choice](https://docs.typesafe.ai/primitives/choice)、[Noul](https://docs.typesafe.ai/primitives/noul)、[Score](https://docs.typesafe.ai/primitives/score) | choice 选项、noul 真概率、score 有序等级的期望；字段与适用范围 |
| [Confidence](https://docs.typesafe.ai/confidence) | 分布统计量不等于实际正确率；Choice 与 Score 的公式不同 |
| [Models](https://docs.typesafe.ai/models) | 当前文档列出 Jev 1.13.0；托管 endpoint、文字输入、版本别名；不将其限制套到本站 |
| [官方 JS SDK v0.6.0](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/client.ts) | SDK 是访问托管 API 的客户端，开放 SDK 不等于公开模型权重 |
| [TypeSafe 发布说明](https://typesafe.ai/blog/introducing-system-one-models-and-jev) | RLCD 为 TypeSafe 的训练表述；“无幻觉”图表具体是 schema matching，不能当作判断不会错 |
| [Jev 1.13 局限](https://docs.typesafe.ai/model-jaggedness/jev-1.13) | 官方承认推断、计算与上下文等任务限制 |
| [Kev 仓库](https://github.com/jaredpalmer/kev) | 独立的 Jev-like 模型家族；开放权重与训练；不是 Jev 官方开源版 |
| [固定 Kev-0.8B 模型卡](https://huggingface.co/jaredpalmer/kev-0.8b/blob/9a45d25eb2ab761841196625383fa1dff0e56c1e/README.md) | Qwen3.5 base + LoRA + pointer head，训练、温度与领域外限制 |
| [固定 kev.js api.ts](https://github.com/ai-ecoverse/kev.js/blob/ca072e49e65b716af478db8f464e1fac8a0f4ad5/src/api.ts) | 实际请求渲染与三类答案转换；浏览器实验复用该包的纯函数 |
| [固定 kev.js head.ts](https://github.com/ai-ecoverse/kev.js/blob/ca072e49e65b716af478db8f464e1fac8a0f4ad5/src/head.ts)、[model.ts](https://github.com/ai-ecoverse/kev.js/blob/ca072e49e65b716af478db8f464e1fac8a0f4ad5/src/model.ts) | 候选位置评分、温度/softmax；state 与问题分支多次运行，不是单个 GPU dispatch |
| [Jev 独立评测预印本](https://arxiv.org/abs/2609.37647) | 特定版本、任务上的评测；不能迁移为本站 Kev 的成绩 |

Jev 的内部 pointer 架构推断来自第三方 [Jev’s Architecture Unmasked](https://archerhume.com/posts/jevs-architecture-unmasked)，不是 TypeSafe 官方架构披露。页面只对可检查的 **Kev 实现**画内部评分结构。Kev 不使用 Jev 的输出训练，二者训练方法和权重不能混同。

## 五章契约

| 章节 | 要回答的问题 | SVG 与实际操作 | 证据边界 |
| --- | --- | --- | --- |
| 输入与类型 | 模型究竟读什么、返回什么？ | 背景/问题/候选汇合；切换 Choice/Noul/Score、编辑示例文字，调用固定库的 validate/toRecord 检查请求 | 仅组装输入，不自动给编辑后的材料生成分数 |
| 模型关系 | Jev、Kev、kev.js 是同一个东西吗？ | 托管产品与开放模型并列；从 Kev 到适配库再到本站；点节点查看接口、部署与来源 | 虚线表示相似接口，不表示同权重/同效果/官方授权 |
| 候选评分 | 文字怎样变成候选概率？ | 共享文字编码、主干位置表示、pointer head、softmax；手动改教学 logits 和温度，实际计算概率与 Choice confidence | 人工分数只演示数学，不是模型推理或校准实测；同题选项不隔离 |
| 执行与开销 | 为什么可能更省、在哪里运算？ | Worker/WASM/WebGPU/CPU 分工；对比逐 token 输出与候选读出，切换开销项查看其来源 | 不把“无需解码循环”说成一次 ORT 调用；不将 Jev 宣传倍数当本站性能 |
| 结果与行动 | 高分就能相信并执行吗？ | 模型分布→应用阈值→人工复核→保留记录；按阈值筛选 34 条已有历史结果，重算覆盖与错误数 | top probability 不等于 confidence；开发集后处理不构成生产阈值建议；不改模型概率、不执行设备操作 |

## 保留的限制

- 本站固定 text q8、kev.js 1.0.0、ORT 1.30.0；不因上游模型家族扩展而切换权重。
- Jev 当前公开使用方式是托管 API；本次没有找到官方公开权重入口。不调用它，也不索取或放置 API key。
- 官方当前 Score 上限与锁定库不同，因此只比较共同语义，不宣称所有版本完全兼容。
- “校准”描述一批预测的概率与真实频率关系；Choice confidence 只是概率分布统计量。
- 历史 34 条合成开发记录仍为 8 条可接受首选答案。筛掉低分并不修正剩余错误；没有通过挑阈值提升后宣称模型变强。
- 本轮不重新进行真实 GPU 验收；前面的 q8 设备结果保持来源、日期和运行版本。
