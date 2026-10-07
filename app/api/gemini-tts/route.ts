import { handleM3Request } from "../../lib/m3-handler";

export async function POST(request: Request) {
  return handleM3Request(request, process.env.GEMINI_API_KEY ?? "");
}
