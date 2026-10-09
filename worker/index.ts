/** Cloudflare Worker entry point for the Kazakh broadcast site. */
import handler from "vinext/server/app-router-entry";
import { fishStatus, handleFishTest } from "./fish-test";
export { M3RegionalSession } from "./m3-regional-session";

type M3Namespace = {
  jurisdiction(region: "eu"): {
    newUniqueId(): unknown;
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
};

function withM2IsolationHeaders(response: Response) {
  const headers = new Headers(response.headers);
  // M2 Turbo V6: SharedArrayBuffer/WASM multi-threading requires a
  // cross-origin-isolated document. All Piper/ONNX/model assets are proxied
  // through this same Worker, so require-corp is safe for the app shell.
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Parameters<typeof handler.fetch>[1], ctx: Parameters<typeof handler.fetch>[2]) {
    const url = new URL(request.url);
    if (url.pathname === "/api/fish-s21-status" && request.method === "GET") return withM2IsolationHeaders(fishStatus(env));
    if (url.pathname === "/api/fish-s21-test" && request.method === "POST") return withM2IsolationHeaders(await handleFishTest(request, env));
    const m3Generation = (url.pathname === "/api/gemini-tts" || url.pathname === "/api/gemini-tts-live") && request.method === "POST";
    if (m3Generation || (url.pathname === "/api/gemini-status" && request.method === "GET")) {
      const namespace = (env as { M3_SESSIONS?: M3Namespace }).M3_SESSIONS;
      if (!namespace) return withM2IsolationHeaders(Response.json({ error: "M3 服务端部署尚未就绪。", code: "M3_REGIONAL_BINDING_MISSING" }, { status: 503 }));
      const regional = namespace.jurisdiction("eu");
      const id = url.pathname === "/api/gemini-status" ? regional.idFromName("m3-status-v5") : regional.newUniqueId();
      return withM2IsolationHeaders(await regional.get(id).fetch(request));
    }
    const response = await handler.fetch(request, env, ctx);
    return withM2IsolationHeaders(response);
  },
};
