/** Cloudflare Worker entry point for the Kazakh broadcast site. */
import handler from "vinext/server/app-router-entry";

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
  async fetch(request: Request, env: unknown, ctx: ExecutionContext) {
    const response = await handler.fetch(request, env, ctx);
    return withM2IsolationHeaders(response);
  },
};
