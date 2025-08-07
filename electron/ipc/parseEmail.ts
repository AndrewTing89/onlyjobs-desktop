import { ipcMain } from "electron";
import { parseEmailWithLLM } from "../llm/llmEngine";

ipcMain.handle("onlyjobs.parseEmail", async (_evt, payload: { subject: string; plaintext: string }) => {
  return await parseEmailWithLLM(payload);
});
