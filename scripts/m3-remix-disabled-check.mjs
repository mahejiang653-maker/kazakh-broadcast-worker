import { readFile } from "node:fs/promises";
const origin = "https://kazakh-broadcast-m3-remix-probe-20261105.mahejiang653.workers.dev";
const token = (await readFile(process.env.RUNNER_TEMP + "/m3-probe-token", "utf8")).trim();
async function check(label, path, supplied, expected, expectedCode, extra) {
  const response = await fetch(origin + path, {
    method: "POST", redirect: "manual",
    headers: { "X-M3-Probe-Token": supplied, "Content-Type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(15000),
  });
  let data;
  try { data = await response.json(); } catch { data = {}; }
  const safeCode = ["AUTH_OK", "UNAUTHORIZED", "PROBE_DISABLED", "EVALUATION_STATUS", "NOT_FOUND", "METHOD_NOT_ALLOWED"].includes(data.code) ? data.code : "OTHER";
  console.log(label + ": HTTP " + response.status + ", " + safeCode);
  if (response.status !== expected || data.code !== expectedCode || (extra && !extra(data))) throw new Error("preflight failed");
}
try {
  await check("authentication", "/api/internal/m3-voice-probe?check=auth", token, 200, "AUTH_OK");
  await check("unauthorized create", "/api/internal/m3-remix-evaluation/create", "invalid", 401, "UNAUTHORIZED");
  await check("evaluation status", "/api/internal/m3-remix-evaluation/status", token, 200, "EVALUATION_STATUS", x => x.enabled === false);
  console.log("Isolated authorization and disabled evaluation verified; no paid route was invoked.");
} catch {
  console.error("Isolated route preflight failed; no credentials printed.");
  process.exitCode = 1;
}
