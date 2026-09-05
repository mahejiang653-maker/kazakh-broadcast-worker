export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.TIANDITU_TOKEN?.trim() || "";

  return Response.json(
    {
      tiandituToken: token,
      configured: Boolean(token),
      mapPolicy: "tianditu-official-boundaries-only",
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}
