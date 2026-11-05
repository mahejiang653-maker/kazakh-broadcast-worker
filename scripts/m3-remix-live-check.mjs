import { readFile } from "node:fs/promises";
const token = (await readFile(process.env.RUNNER_TEMP + "/m3-probe-token", "utf8")).trim();
const url = "https://kazakh-broadcast-m3-remix-probe-20261105.mahejiang653.workers.dev/api/internal/m3-remix-evaluation/status";
let ready = false;
for (let i = 0; i < 12; i++) {
  const r = await fetch(url, { method: "POST", redirect: "manual", headers: { "X-M3-Probe-Token": token }, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 200 && j.code === "EVALUATION_STATUS" && j.enabled === true) { ready = true; break; }
  await new Promise(resolve => setTimeout(resolve, 3000));
}
if (!ready) throw new Error("Isolated evaluation not ready; no paid request was made");
console.log("Enabled status verified; no Google call made.");
