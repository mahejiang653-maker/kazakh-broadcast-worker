import { handleM3Request } from "../app/lib/m3-handler";
import { M3_VERSION } from "../app/lib/m3-script";

type Env = { GEMINI_API_KEY?: string };
/** M3 executes in the EU jurisdiction; neither scripts nor audio are persisted. */
export class M3RegionalSession {
  constructor(_state: unknown, private env: Env) {}
  private async observedEgress() {
    try {
      const response = await fetch("https://www.cloudflare.com/cdn-cgi/trace", { signal: AbortSignal.timeout(6000) });
      const text = await response.text();
      // The observed location is diagnostic; Google alone decides API eligibility.
      return { country: text.match(/^loc=(.+)$/m)?.[1] ?? "unknown", colo: text.match(/^colo=(.+)$/m)?.[1] ?? "unknown" };
    } catch { return { country: "unknown", colo: "unknown" }; }
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname === "/api/gemini-status") {
      const observed = await this.observedEgress();
      return Response.json({ configured: Boolean(this.env.GEMINI_API_KEY?.trim()), service: "Gemini 3.8 TTS", keyName: "GEMINI_API_KEY", version: M3_VERSION, backend: "cloudflare-durable-object", jurisdiction: "eu", observedEgress: observed, apiAccessVerified: false }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }
    if (url.pathname !== "/api/gemini-tts" || request.method !== "POST") return new Response("Not found", { status: 404 });
    return handleM3Request(request, this.env.GEMINI_API_KEY ?? "", "cloudflare-eu-jurisdiction");
  }
}
