// @vitest-environment jsdom
// UI tests use a clearly synthetic test double; it is never bundled in production.
import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
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
    branchTokens: [300],
    totalTokens: 800,
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) => {
      const path = String(input).split("cases/")[1];
      return {
        ok: true,
        json: async () =>
          JSON.parse(fs.readFileSync(`public/cases/${path}`, "utf8")),
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
      "No predictions are pre-filled",
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
      usage: { stateTokens: 500, branchTokens: [300], totalTokens: 800 },
      wallMs: 12,
      evidenceHash: "test-only",
    });
    button("analyze").click();
    await flush();
    expect(document.getElementById("raw")!.textContent).toContain("0.77");
    expect(document.getElementById("freshness")!.textContent).toBe(
      "CURRENT INPUT",
    );
    const check = document.querySelector(
      "#evidence-list input",
    ) as HTMLInputElement;
    check.click();
    await flush();
    expect(document.getElementById("freshness")!.textContent).toContain(
      "STALE",
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
      wallMs: 1,
      evidenceHash: "old-input-test",
    });
    await flush();
    expect(document.getElementById("freshness")!.textContent).toContain(
      "STALE",
    );
    expect(document.getElementById("notice")!.textContent).toContain("STALE");
    const raw = JSON.parse(document.getElementById("raw")!.textContent!);
    expect(raw.stale).toBe(true);
    expect(raw.includedIds).toHaveLength(3);
    expect(raw.inputSnapshot.evidence).toHaveLength(3);
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
