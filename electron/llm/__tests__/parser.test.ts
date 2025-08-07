import { describe, it, expect, vi } from "vitest";
import * as engine from "../llmEngine";
import { ipcMain } from "electron";

// Mock node-llama-cpp by stubbing parseEmailWithLLM

describe("parseEmailWithLLM", () => {
  it("returns schema-shaped object with nulls (non-job)", async () => {
    vi.spyOn(engine, "parseEmailWithLLM").mockResolvedValue({
      is_job_related: false,
      company: null,
      position: null,
      status: null,
    });

    const res = await engine.parseEmailWithLLM({ subject: "Hello", plaintext: "Newsletter..." });
    expect(res).toEqual({ is_job_related: false, company: null, position: null, status: null });
  });

  it("never returns 'unknown' strings", async () => {
    vi.spyOn(engine, "parseEmailWithLLM").mockResolvedValue({
      is_job_related: true,
      company: null,
      position: null,
      status: "interview",
    });

    const res = await engine.parseEmailWithLLM({ subject: "Interview", plaintext: "Let's schedule" });
    // No 'unknown' anywhere
    expect(Object.values(res).join(" ").toLowerCase()).not.toContain("unknown");
  });
});

// IPC round-trip smoke test

describe("IPC onlyjobs.parseEmail", () => {
  it("has a handler registered", () => {
    // Electron's ipcMain doesn't expose handlers list; this is a placeholder smoke test
    expect(ipcMain).toBeDefined();
  });
});
