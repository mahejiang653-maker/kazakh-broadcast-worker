/**
 * Safe M3 Voice API preflight. Read-only by design: no CreateVoice and no TTS.
 * Run: node experiments/m3-voices-preflight.mjs
 * Optional live read-only check: GEMINI_API_KEY=<secret> node experiments/m3-voices-preflight.mjs --live
 * Never commit credentials.
 */
const endpoint = "https://generativelanguage.googleapis.com/v1beta/voices";
export function voiceId(value) {
  return typeof value === "string" && /^voice_[A-Za-z0-9_-]+$/.test(value);
}
export function summarizeVoices(payload) {
  if (!payload || !Array.isArray(payload.voices)) throw new Error("Invalid Voices API response");
  return {
    totalOnPage: payload.voices.length,
    nextPageAvailable: Boolean(payload.next_page_token ?? payload.nextPageToken),
    entries: payload.voices.map(v => ({
      id: v.id ?? null,
      type: v.type ?? null,
      displayName: v.display_name ?? v.displayName ?? null,
      persistent: voiceId(v.id),
    })),
  };
}
export async function listVoices({ apiKey, fetcher = fetch } = {}) {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required for --live");
  const response = await fetcher(endpoint, {
    method: "GET",
    headers: { "x-goog-api-key": apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error("Voices API HTTP " + response.status);
  return summarizeVoices(await response.json());
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  if (!process.argv.includes("--live")) {
    console.log(JSON.stringify({
      mode: "dry-run", method: "GET", endpoint,
      notes: ["No API request made", "No voice created", "No audio generated", "No charge initiated by this script"],
    }, null, 2));
  } else {
    try { console.log(JSON.stringify(await listVoices({ apiKey: process.env.GEMINI_API_KEY }), null, 2)); }
    catch (e) { console.error(e.message); process.exitCode = 1; }
  }
}
