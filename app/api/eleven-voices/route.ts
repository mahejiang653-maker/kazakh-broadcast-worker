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

type ElevenVoice = {
  voice_id?: string;
  name?: string;
  category?: string;
  labels?: Record<string, string> | null;
};

type ElevenVoicesPayload = {
  voices?: ElevenVoice[];
};

export async function POST() {
  const apiKey = process.env.Mahjan?.trim();

  if (!apiKey) {
    return jsonError(
      "Cloudflare 当前运行版本没有读取到 Mahjan。请确认 Mahjan 已保存并部署到 Worker。",
      503,
    );
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
      if (response.status === 401) {
        return jsonError(
          "Cloudflare 已读取到 Mahjan，但 ElevenLabs 返回 401：这个 Key 无效、已删除、已过期，或复制的不是完整 API Key。",
          502,
        );
      }
      if (response.status === 403) {
        return jsonError(
          "Cloudflare 已读取到 Mahjan，但 ElevenLabs 返回 403：Key 权限不足或设置了 IP 限制。请开启 Voices 读取与 Text to Speech 权限，并取消 IP 限制。",
          502,
        );
      }
      if (response.status === 429) {
        return jsonError("ElevenLabs 当前请求过于频繁，请稍后再试。", 429);
      }
      return jsonError(`ElevenLabs 返回错误 ${response.status}，暂时无法读取声线。`, 502);
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
