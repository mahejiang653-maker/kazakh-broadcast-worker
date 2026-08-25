const ELEVEN_VOICES_ENDPOINT =
  "https://api.elevenlabs.io/v2/voices?page_size=50&sort=name&sort_direction=asc&include_total_count=false";

function jsonError(message: string, status: number) {
  return Response.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

type ElevenVoice = {
  voice_id?: string;
  name?: string;
  category?: string;
  labels?: Record<string, string> | null;
};

type ElevenVoicesPayload = {
  voices?: ElevenVoice[];
};

export async function POST(request: Request) {
  const apiKey = process.env.MA?.trim();
  const accessPin = process.env.AM?.trim();

  if (!apiKey || !accessPin) {
    return jsonError(
      "高质量模式尚未完成配置。请先设置 ElevenLabs API Key 和私人访问密码。",
      503,
    );
  }

  const submittedPin = request.headers.get("x-eleven-access")?.trim() || "";
  if (!submittedPin || !constantTimeEqual(submittedPin, accessPin)) {
    return jsonError("高质量模式访问密码不正确。", 401);
  }

  try {
    const response = await fetch(ELEVEN_VOICES_ENDPOINT, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "xi-api-key": apiKey,
      },
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return jsonError("ElevenLabs 授权失败，请检查 API Key 或账号权限。", 502);
      }
      if (response.status === 429) {
        return jsonError("ElevenLabs 当前请求过于频繁，请稍后再试。", 429);
      }
      return jsonError("暂时无法读取 ElevenLabs 声线，请稍后再试。", 502);
    }

    const payload = (await response.json()) as ElevenVoicesPayload;
    const voices = (payload.voices ?? [])
      .filter(
        (item): item is ElevenVoice & { voice_id: string; name: string } =>
          typeof item.voice_id === "string" &&
          item.voice_id.length > 0 &&
          typeof item.name === "string" &&
          item.name.length > 0,
      )
      .map((item) => ({
        id: item.voice_id,
        name: item.name,
        gender: item.labels?.gender ?? "",
        accent: item.labels?.accent ?? "",
        category: item.category ?? "",
      }));

    if (!voices.length) {
      return jsonError(
        "你的 ElevenLabs 账号暂时没有可用声线，请先在 ElevenLabs 中添加或创建一个声线。",
        404,
      );
    }

    return Response.json(
      { voices },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("Failed to load ElevenLabs voices", error);
    return jsonError("暂时无法读取 ElevenLabs 声线，请稍后再试。", 502);
  }
}
