import { handleM3Request } from "../../lib/m3-handler";

// Streams progress and audio to the browser using one Google TTS request.
// API keys stay exclusively in the Worker.
export async function POST(request: Request) {
  return handleM3Request(request, process.env.GEMINI_API_KEY ?? "", "unrestricted-edge", true);
}
