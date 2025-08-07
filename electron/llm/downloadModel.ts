import fs from "fs";
import path from "path";
import https from "https";

const DEFAULT_URL = process.env.ONLYJOBS_MODEL_URL ??
  "https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf?download=true";
const DEST_DIR = path.resolve(process.cwd(), "models");
const DEST_PATH = path.join(DEST_DIR, "model.gguf");

function followRedirect(url: string, method: "HEAD" | "GET"): Promise<{ url: string; res: https.IncomingMessage }>{
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers: { "User-Agent": "onlyjobs-desktop/llm-downloader" } }, (res) => {
      const status = res.statusCode || 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        const nextUrl = new URL(res.headers.location, url).toString();
        // Drain current response before following
        res.resume();
        followRedirect(nextUrl, method).then(resolve).catch(reject);
      } else if (status >= 200 && status < 300) {
        resolve({ url, res });
      } else {
        reject(new Error(`HTTP ${status} for ${url}`));
      }
    });
    req.on("error", reject);
    req.end();
  });
}

async function getRemoteSize(url: string): Promise<number | null> {
  try {
    const { res } = await followRedirect(url, "HEAD");
    const len = res.headers["content-length"];
    if (!len) return null;
    const n = Number(len);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function formatBytes(n: number): string {
  const mb = n / (1024 * 1024);
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

async function ensureDir(dir: string) {
  await fs.promises.mkdir(dir, { recursive: true });
}

async function main() {
  const url = DEFAULT_URL;
  await ensureDir(DEST_DIR);

  const remoteSize = await getRemoteSize(url);
  const exists = fs.existsSync(DEST_PATH);
  if (exists && remoteSize != null) {
    const stat = await fs.promises.stat(DEST_PATH);
    if (stat.size === remoteSize) {
      console.log(`Model already present at ${DEST_PATH} (${formatBytes(stat.size)}), skipping.`);
      process.exit(0);
    }
  }

  console.log(`Downloading model to ${DEST_PATH}`);
  console.log(`Source: ${url}`);
  if (remoteSize != null) console.log(`Expected size: ${formatBytes(remoteSize)}`);

  const tmpPath = `${DEST_PATH}.partial`;
  // Clean partial if exists
  try { await fs.promises.unlink(tmpPath); } catch {}

  const file = fs.createWriteStream(tmpPath);

  const { res } = await followRedirect(url, "GET");
  const total = remoteSize ?? Number(res.headers["content-length"]) || 0;
  let downloaded = 0;
  const started = Date.now();
  let lastDraw = 0;

  res.on("data", (chunk: Buffer) => {
    downloaded += chunk.length;
    const now = Date.now();
    if (now - lastDraw > 100) {
      lastDraw = now;
      if (total > 0) {
        const pct = ((downloaded / total) * 100).toFixed(1);
        const speed = downloaded / ((now - started) / 1000 + 0.0001);
        const etaSec = total > 0 ? (total - downloaded) / (speed || 1) : 0;
        const line = `\r${pct}% ${formatBytes(downloaded)} / ${formatBytes(total)}  ETA ${Math.max(0, etaSec | 0)}s`;
        process.stdout.write(line);
      } else {
        process.stdout.write(`\r${formatBytes(downloaded)} downloaded...`);
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    res.pipe(file);
    res.on("error", reject);
    file.on("error", reject);
    file.on("finish", () => file.close(() => resolve()));
  });

  // Final progress line
  if (total > 0) process.stdout.write(`\r100.0% ${formatBytes(total)} / ${formatBytes(total)}           \n`);
  console.log("Download complete. Moving into place...");

  await fs.promises.rename(tmpPath, DEST_PATH);

  const finalStat = await fs.promises.stat(DEST_PATH);
  console.log(`Saved: ${DEST_PATH} (${formatBytes(finalStat.size)})`);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Download failed:", err.message || err);
  process.exit(1);
});
