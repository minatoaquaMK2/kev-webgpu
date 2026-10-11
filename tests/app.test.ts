// @vitest-environment jsdom
// UI tests use a clearly synthetic test double; it is never bundled in production.
// Recorded query fixtures verify rendering and snapshot binding, never live model/GPU execution.
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
const recordedQuery = JSON.parse(fs.readFileSync("public/query-example.json", "utf8"));
const uiTiming = { preprocess: 0, vision: 0, state: 4, branches: 7, cached: false, imageTokens: 0 };
const mock = vi.hoisted(() => ({
  analyze: vi.fn(),
  load: vi.fn(),
  probe: vi.fn(),
  unload: vi.fn(),
  cancel: vi.fn(),
  measure: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("../src/runtime/client", () => ({
  KevClient: class {
    probe = mock.probe;
    load = mock.load;
    analyze = mock.analyze;
    unload = mock.unload;
    cancel = mock.cancel;
    measure = mock.measure;
    clearModelCache = mock.clear;
  },
}));
const flush = () => new Promise((resolve) => setTimeout(resolve, 40));
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
async function init() {
  vi.resetModules();
  document.body.innerHTML = '<div id="app"></div>';
  await import("../src/app/main");
  await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.probe.mockResolvedValue({ available: true });
  mock.load.mockResolvedValue({});
  mock.unload.mockResolvedValue({});
  mock.cancel.mockResolvedValue({});
  mock.measure.mockResolvedValue({
    stateTokens: 500,
    branchTokens: [800],
    totalTokens: 800,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = String(input).split("cases/")[1];
      const filename = String(input).endsWith("query-example.json")
        ? "public/query-example.json"
        : `public/cases/${path}`;
      return {
        ok: true,
        json: async () =>
          JSON.parse(fs.readFileSync(filename, "utf8")),
      };
    }),
  );
});
describe("UI evidence lifecycle (test double, not model validation)", () => {
  it("starts without loading or inference and previews stage A", async () => {
    await init();
    expect(button("analyze").disabled).toBe(true);
    expect(mock.load).not.toHaveBeenCalled();
    expect(mock.analyze).not.toHaveBeenCalled();
    expect(
      document.getElementById("evidence-list")!.children.length,
    ).toBeGreaterThan(0);
    expect(document.getElementById("prediction")!.textContent).toContain(
      "历史示例不会被填入当前结果",
    );
  });
  it("stage switching never auto-infers; editing blocks analysis until valid apply", async () => {
    await init();
    button("load").click();
    await flush();
    expect(button("analyze").disabled).toBe(false);
    const stages = document.getElementById("stages")!.children;
    (stages[1] as HTMLButtonElement).click();
    await flush();
    expect(mock.analyze).not.toHaveBeenCalled();
    const editor = document.getElementById(
      "json-editor",
    ) as HTMLTextAreaElement;
    editor.value = "{bad";
    editor.dispatchEvent(new Event("input"));
    expect(button("analyze").disabled).toBe(true);
    button("apply-json").click();
    expect(document.getElementById("notice")!.textContent).toMatch(
      /JSON|Unexpected|position|property/i,
    );
  });
  it("renders log text without executing HTML", async () => {
    await init();
    const editor = document.getElementById(
      "json-editor",
    ) as HTMLTextAreaElement;
    const bundle = JSON.parse(editor.value);
    bundle.evidence[0].excerpt = '<img src=x onerror="window.exploit=true">';
    editor.value = JSON.stringify(bundle);
    editor.dispatchEvent(new Event("input"));
    button("apply-json").click();
    await flush();
    expect(document.querySelector("#evidence-list img")).toBeNull();
    expect(document.getElementById("evidence-list")!.textContent).toContain(
      "<img src=x",
    );
  });
  it("keeps raw probabilities intact and marks result stale after evidence change", async () => {
    await init();
    button("load").click();
    await flush();
    const probabilities = {
      storage_network_mtu_mismatch: 0.2,
      storage_network_connectivity_loss: 0.1,
      host_volume_mapping_gap: 0.1,
      powerstore_capacity_write_protect: 0.1,
      powerstore_node_or_component_fault: 0.1,
      other_or_multiple_causes: 0.1,
      insufficient_evidence: 0.2,
      no_active_incident: 0.1,
    };
    mock.analyze.mockResolvedValue({
      response: {
        answers: {
          probable_cause: {
            type: "choice",
            choice: "insufficient_evidence",
            confidence: 0.77,
            probabilities,
          },
        },
      },
      usage: { stateTokens: 500, branchTokens: [800], totalTokens: 800 },
      timing: uiTiming,
      wallMs: 12,
      evidenceHash: "test-only",
    });
    button("analyze").click();
    await flush();
    expect(document.getElementById("raw")!.textContent).toContain("0.77");
    expect(document.getElementById("freshness")!.textContent).toBe(
      "当前输入",
    );
    const check = document.querySelector(
      "#evidence-list input",
    ) as HTMLInputElement;
    check.click();
    await flush();
    expect(document.getElementById("freshness")!.textContent).toContain(
      "已过期",
    );
    expect(mock.analyze).toHaveBeenCalledTimes(1);
    expect(
      JSON.parse(document.getElementById("raw")!.textContent!).response.answers
        .probable_cause.probabilities,
    ).toEqual(probabilities);
  });
  it("unsupported device errors without downloading model", async () => {
    await init();
    mock.probe.mockResolvedValue({
      available: false,
      code: "q8_unsupported",
      message: "shader-f16 required",
    });
    button("load").click();
    await flush();
    expect(mock.load).not.toHaveBeenCalled();
    expect(document.getElementById("notice")!.textContent).toContain(
      "shader-f16",
    );
    expect(button("analyze").disabled).toBe(true);
  });
  it("binds a first response to its snapshot if input changes during inference", async () => {
    await init();
    button("load").click();
    await flush();
    let resolve!: (value: unknown) => void;
    mock.analyze.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    button("analyze").click();
    await flush();
    (
      document.querySelector("#evidence-list input") as HTMLInputElement
    ).click();
    await flush();
    resolve({
      response: {
        answers: {
          probable_cause: {
            type: "choice",
            choice: "insufficient_evidence",
            confidence: 0.3,
            probabilities: { insufficient_evidence: 1 },
          },
        },
      },
      usage: { stateTokens: 500, branchTokens: [700], totalTokens: 700 },
      timing: { ...uiTiming, state: 0.3, branches: 0.6 },
      wallMs: 1,
      evidenceHash: "old-input-test",
    });
    await flush();
    expect(document.getElementById("freshness")!.textContent).toContain(
      "已过期",
    );
    expect(document.getElementById("notice")!.textContent).toContain("STALE");
    const raw = JSON.parse(document.getElementById("raw")!.textContent!);
    expect(raw.stale).toBe(true);
    expect(raw.includedIds).toHaveLength(3);
    expect(raw.inputSnapshot.evidence).toHaveLength(3);
  });

  it("binds recorded cost fixture to a UI test-double query and marks it stale after editing (no model validation)", async () => {
    await init();
    expect(document.getElementById("example-cost")!.textContent).toContain("1.190 秒");
    expect(document.getElementById("example-cost")!.textContent).toContain("1,062 tokens");
    const historicalCost = document.getElementById("example-cost")!.textContent;
    expect(button("export").disabled).toBe(true);
    expect(mock.analyze).not.toHaveBeenCalled();
    button("mode-live").click();
    (document.getElementById("stages")!.children[2] as HTMLButtonElement).click();
    button("load").click();
    await flush();
    // Use the saved numerical fields as a UI fixture. This explicitly synthetic
    // transport response has no observed GPU work and does not run the model.
    mock.analyze.mockResolvedValue({
      response: { ...recordedQuery.response, model: "ui-test-double-from-recorded-query" },
      usage: recordedQuery.usage,
      timing: recordedQuery.timing,
      wallMs: recordedQuery.wallMs,
      evidenceHash: "ui-test-double-snapshot",
      provenance: recordedQuery.provenance,
      unroundedProbabilities: recordedQuery.unroundedProbabilities,
      gpuProof: { executionProviders: ["webgpu"], gpuTensorOutputs: 0, kernelCount: 0, kernelTypes: [], largeComputeObserved: false, verification: "not_verified" },
    });
    button("analyze").click();
    await flush();
    const cost = document.getElementById("live-cost")!;
    expect(cost.querySelector(".cost-scope")!.textContent).toContain("本机本次实测");
    expect([...cost.querySelectorAll(".cost-metric strong")].map(node => node.textContent)).toEqual(["1.190 秒", "1,062 tokens", "0 次", "未测量"]);
    expect(cost.querySelector(".token-equation")!.textContent).toContain("824 + 问题与候选 238 = 1062");
    const editor = document.getElementById("json-editor") as HTMLTextAreaElement;
    const changed = JSON.parse(editor.value);
    changed.incident.symptom += " New evidence after the recorded UI fixture.";
    editor.value = JSON.stringify(changed);
    editor.dispatchEvent(new Event("input"));
    expect(cost.querySelector(".cost-scope")!.textContent).toContain("已过期输入的实测，不代表当前编辑内容");
    expect([...cost.querySelectorAll(".cost-metric strong")].map(node => node.textContent)).toEqual(["1.190 秒", "1,062 tokens", "0 次", "未测量"]);
    button("apply-json").click();
    await flush();
    expect(document.getElementById("freshness")!.textContent).toContain("已过期");
    expect(document.getElementById("example-cost")!.textContent).toBe(historicalCost);
    expect(mock.analyze).toHaveBeenCalledTimes(1);
    const raw = JSON.parse(document.getElementById("raw")!.textContent!);
    expect(raw.inputSnapshot.incident.symptom).not.toContain("New evidence after");
    expect(raw.gpuProof.verification).toBe("not_verified");
  });

  it("keeps cause-input token counts while next-check updates its own latest cost (UI test double)", async () => {
    await init();
    button("mode-live").click();
    button("load").click();
    await flush();
    mock.analyze.mockResolvedValueOnce({
      response: { answers: { probable_cause: { type: "choice", choice: "insufficient_evidence", confidence: 1, probabilities: { insufficient_evidence: 1 } } } },
      usage: { stateTokens: 500, branchTokens: [800], totalTokens: 800 },
      timing: uiTiming, wallMs: 12, evidenceHash: "ui-test-double-cause",
    }).mockResolvedValueOnce({
      response: { answers: { next_check: { type: "choice", choice: "verify_end_to_end_mtu", confidence: 1, probabilities: { verify_end_to_end_mtu: 1 } } } },
      usage: { stateTokens: 500, branchTokens: [900], totalTokens: 900 },
      timing: { ...uiTiming, state: 8, branches: 11 }, wallMs: 20, evidenceHash: "ui-test-double-next-check",
    });
    button("analyze").click();
    await flush();
    const preview = document.getElementById("question-preview")!.textContent;
    const usage = document.getElementById("token-usage")!.textContent;
    const cause = document.getElementById("raw")!.textContent;
    expect(usage).toContain("每个问题（含前缀）800/1536");
    button("next-check").click();
    await flush();
    expect(mock.analyze).toHaveBeenCalledTimes(2);
    expect(mock.analyze.mock.calls[1][0].questions).toHaveProperty("next_check");
    expect(document.getElementById("question-preview")!.textContent).toBe(preview);
    expect(document.getElementById("token-usage")!.textContent).toBe(usage);
    expect(document.getElementById("raw")!.textContent).toBe(cause);
    expect(document.getElementById("next-result")!.textContent).toContain("核对同一路径端到端 MTU");
    const cost = document.getElementById("live-cost")!;
    expect(cost.querySelector(".cost-scope")!.textContent).toContain("下一步检查查询");
    expect([...cost.querySelectorAll(".cost-metric strong")].map(node => node.textContent)).toEqual(["0.020 秒", "900 tokens", "0 次", "未测量"]);
    expect(cost.querySelector(".token-equation")!.textContent).toContain("500 + 问题与候选 400 = 900");
  });

  it("cancels during preflight without starting a later model download", async () => {
    await init();
    let release!: (value: unknown) => void;
    mock.probe.mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    button("load").click();
    await flush();
    button("cancel").click();
    await flush();
    release({ available: true });
    await flush();
    expect(mock.load).not.toHaveBeenCalled();
    expect(button("load").disabled).toBe(false);
    expect(document.getElementById("notice")!.textContent).toContain(
      "cancelled",
    );
  });
  it("clears measured token counts when the evidence selection changes", async () => {
    await init();
    mock.probe.mockResolvedValue({ available: true });
    button("load").click();
    await flush();
    button("measure").click();
    await flush();
    expect(document.getElementById("token-usage")!.textContent).toContain(
      "500",
    );
    (
      document.querySelector("#evidence-list input") as HTMLInputElement
    ).click();
    await flush();
    expect(document.getElementById("token-usage")!.textContent).not.toContain(
      "500",
    );
  });

  it("cancels during evidence hashing without submitting inference later", async () => {
    await init();
    button("load").click();
    await flush();
    const evidence = await import("../src/evidence");
    let release!: (value: string) => void;
    const spy = vi.spyOn(evidence, "hashEvidence").mockImplementation(
      () =>
        new Promise<string>((r) => {
          release = r;
        }),
    );
    button("analyze").click();
    await flush();
    button("cancel").click();
    await flush();
    release("cancelled-test-hash");
    await flush();
    expect(mock.analyze).not.toHaveBeenCalled();
    expect(document.getElementById("notice")!.textContent).toContain(
      "Cancelled",
    );
    spy.mockRestore();
  });
});
