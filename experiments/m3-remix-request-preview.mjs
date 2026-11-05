/**
 * M3 voice remix request preview ONLY. Never makes HTTP requests.
 * Based on official Gemini Voices API: POST /v1beta/voices.
 */
export function buildRemixRequest({ baseVoice = "Puck", displayName = "M3 Kazakh News Experiment" } = {}) {
  if (typeof baseVoice !== "string" || !/^(?:[A-Za-z][A-Za-z0-9_-]{0,80}|voice_[A-Za-z0-9_-]+)$/.test(baseVoice)) {
    throw new Error("Invalid base voice");
  }
  if (typeof displayName !== "string" || displayName.length < 3 || displayName.length > 80) {
    throw new Error("Invalid display name");
  }
  return {
    store: true,
    voice: {
      type: "prompted",
      display_name: displayName,
      language_code: "kk",
      context: "News",
      gender: "male",
      prompted: {
        base_voice: baseVoice,
        input: "Preserve the original voice identity and timbre. Make only a subtle adjustment toward a calm, professional male Kazakh-language news narrator with clear pronunciation, steady cadence and restrained expression. Avoid theatrical changes, pitch swings or exaggerated emotion."
      }
    }
  };
}
if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  console.log(JSON.stringify({mode:"OFFLINE PREVIEW ONLY",method:"POST (NOT SENT)",endpoint:"https://generativelanguage.googleapis.com/v1beta/voices",body:buildRemixRequest(),note:"No API key used. No network call. No voice created."},null,2));
}
