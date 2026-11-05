import { readFile } from "node:fs/promises";
const origin = "https://kazakh-broadcast-m3-remix-probe-20261105.mahejiang653.workers.dev";
const token = (await readFile(process.env.RUNNER_TEMP + "/m3-probe-token", "utf8")).trim();
async function check(path, supplied, expected, code) {
  const response = await fetch(origin + path, {
    method: "POST", redirect: "manual",
    headers: { "X-M3-Probe-Token": supplied, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (response.status !== expected || (code && data.code !== code)) throw new Error("Isolated route preflight failed");
}
try {
  await check("/api/internal/m3-voice-probe?check=auth", token, 200);
  await check("/api/internal/m3-remix-evaluation/create", "invalid", 401);
  await check("/api/internal/m3-remix-evaluation/create", token, 503, "EVALUATION_DISABLED");
  await check("/api/internal/m3-remix-evaluation/synthesize", token, 503, "EVALUATION_DISABLED");
  console.log("Isolated authorization and disabled creation/synthesis verified; no Google calls.");
} catch {
  console.error("Isolated route preflight failed; no credentials printed.");
  process.exitCode = 1;
}
