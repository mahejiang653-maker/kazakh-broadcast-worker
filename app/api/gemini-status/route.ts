export async function GET() {
  const configured = Boolean((process.env.GEMINI_API_KEY ?? "").trim());
  return Response.json(
    {
      configured,
      service: "Gemini 3.8 TTS",
      keyName: "GEMINI_API_KEY",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
