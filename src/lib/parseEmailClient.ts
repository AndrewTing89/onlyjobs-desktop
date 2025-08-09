import type { ParseResult } from "../../electron/llm/llmEngine";

export async function parseEmailClient(input: { subject: string; plaintext: string }): Promise<ParseResult> {
  return window.electronAPI?.parseEmail ? window.electronAPI.parseEmail(input) : Promise.reject(new Error("IPC not available"));
}
