import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const URL = "https://kazakh-broadcast-m3-remix-probe-20261105.mahejiang653.workers.dev/api/internal/m3-voice-probe";
const ERROR_TYPES = new Set(["INVALID_ARGUMENT", "FAILED_PRECONDITION", "UNAUTHENTICATED", "PERMISSION_DENIED", "NOT_FOUND", "RESOURCE_EXHAUSTED", "INTERNAL", "UNAVAILABLE", "DEADLINE_EXCEEDED", "UNKNOWN"]);
const wait = () => new Promise(resolve => setTimeout(resolve, 3000));

export async function runProbe({ token, mode, fetcher = fetch, delay = wait }) {
  if (typeof token !== "string" || token.length < 32 || !["verify", "live"].includes(mode)) throw new Error("Invalid probe configuration");
  const request = async (method, supplied, authOnly = false) => {
    const headers = supplied ? { "X-M3-Probe-Token": supplied } : {};
    const response = await fetcher(authOnly ? `${URL}?check=auth` : URL, { method, headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
    return { status: response.status, body: await response.json() };
  };
  const get = await request("GET");
  if (get.status !== 405 || get.body.code !== "METHOD_NOT_ALLOWED") throw new Error("Probe method guard failed");
  let wrong;
  for (let i = 0; i < 12; i++) {
    wrong = await request("POST", "wrong");
    if (wrong.status === 401 && wrong.body.code === "UNAUTHORIZED") break;
    if (wrong.status !== 503 || wrong.body.code !== "PROBE_DISABLED") throw new Error("Probe authorization guard failed");
    await delay();
  }
  if (wrong?.status !== 401) throw new Error("Probe token did not become active in time");

  let authenticated = false;
  for (let i = 0; i < 12; i++) {
    const { status, body } = await request("POST", token, true);
    if (status === 200 && body.code === "AUTH_OK") { authenticated = true; break; }
    if (!((status === 401 && body.code === "UNAUTHORIZED") || (status === 503 && body.code === "PROBE_DISABLED"))) throw new Error("Unexpected preflight response");
    await delay();
  }
  if (!authenticated) throw new Error("Probe token did not become active in time");
  if (mode === "verify") return { code: "AUTH_OK" };

  // After token preflight, make exactly one attempt capable of reaching Google.
  const { body } = await request("POST", token);
  if (body.checked === true && Number.isInteger(body.upstreamStatus) && body.upstreamStatus >= 100 && body.upstreamStatus <= 599 && ["VOICE_LIST_AVAILABLE", "VOICE_LIST_UNAVAILABLE"].includes(body.code)) {
    return { checked: true, allowed: body.allowed === true, upstreamStatus: body.upstreamStatus, code: body.code,
      ...(typeof body.upstreamErrorType === "string" && ERROR_TYPES.has(body.upstreamErrorType) ? { upstreamErrorType: body.upstreamErrorType } : {}) };
  }
  if (body.checked === false && body.code === "UPSTREAM_NETWORK_ERROR") return { checked: false, code: "UPSTREAM_NETWORK_ERROR" };
  if (body.code === "GEMINI_KEY_MISSING") return { checked: false, code: "GEMINI_KEY_MISSING" };
  throw new Error("Unexpected probe response; not retrying");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const token = await readFile(`${process.env.RUNNER_TEMP}/m3-probe-token`, "utf8");
    const result = await runProbe({ token, mode: process.env.M3_PROBE_MODE });
    console.log(JSON.stringify(result));
  } catch {
    console.error("Probe check failed or was interrupted; no automatic upstream retry was made.");
    process.exitCode = 1;
  }
}
