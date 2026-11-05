import { pathToFileURL } from "node:url";

export async function checkProbeSecrets({ token, accountId, mode, fetcher = fetch }) {
  if (!token || !accountId || !/^[A-Za-z0-9]+$/.test(accountId)) throw new Error("Cloudflare credentials are unavailable");
  if (mode !== "verify" && mode !== "live") throw new Error("Unknown probe mode");
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/kazakh-broadcast-m3-remix-probe-20261105/secrets`;
  const response = await fetcher(url, { method: "GET", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(`Cloudflare secret metadata returned HTTP ${response.status}`);
  const data = await response.json();
  if (data.success !== true || !Array.isArray(data.result)) throw new Error("Cloudflare secret metadata is invalid");
  const names = data.result.filter(item => item.type === "secret_text").map(item => item.name);
  if (!names.includes("M3_VOICE_PROBE_TOKEN")) throw new Error("Probe token is not configured");
  const hasGemini = names.includes("GEMINI_API_KEY");
  if (mode === "verify" && hasGemini) throw new Error("Verification must not be checked while a Gemini key is configured");
  if (mode === "live" && !hasGemini) throw new Error("Gemini key is not configured on the isolated Worker");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await checkProbeSecrets({ token: process.env.CLOUDFLARE_API_TOKEN, accountId: process.env.CLOUDFLARE_ACCOUNT_ID, mode: process.env.M3_PROBE_MODE });
    console.log("Isolated Worker secret names verified; no values were read.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const safe = /^(?:Cloudflare credentials are unavailable|Unknown probe mode|Cloudflare secret metadata returned HTTP \d{3}|Cloudflare secret metadata is invalid|Probe token is not configured|Verification must not be checked while a Gemini key is configured|Gemini key is not configured on the isolated Worker)$/;
    console.error(safe.test(message) ? message : "Isolated Worker secret metadata check failed");
    process.exitCode = 1;
  }
}
