const ELEVEN_VOICES_ENDPOINT = "https://api.elevenlabs.io/v2/voices";
const MAX_VOICE_PAGES = 3;

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
  preview_url?: string;
  labels?: Record<string, string> | null;
};

type ElevenVoicesPayload = {
  voices?: ElevenVoice[];
  has_more?: boolean;
  next_page_token?: string | null;
};

async function fetchVoicePage(apiKey: string, nextPageToken?: string) {
  const url = new URL(ELEVEN_VOICES_ENDPOINT);
  url.searchParams.set("page_size", "100");
  url.searchParams.set("sort", "name");
  url.searchParams.set("sort_direction", "asc");
  url.searchParams.set("include_total_count", "false");
  if (nextPageToken) url.searchParams.set("next_page_token", nextPageToken);

  return fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "xi-api-key": apiKey,
    },
  });
}

export async function POST() {
  const apiKey = process.env.Max?.trim();

  if (!apiKey) {
    return jsonError(
      "Cloudflare 当前运行版本没有读取到 Max。请确认 Max 已保存并部署到 Worker。",
      503,
    );
  }

  try {
    const collected: ElevenVoice[] = [];
    let nextPageToken: string | undefined;

    for (let page = 0; page < MAX_VOICE_PAGES; page += 1) {
      const response = await fetchVoicePage(apiKey, nextPageToken);

      if (!response.ok) {
        if (response.status === 401) {
          return jsonError(
            "Cloudflare 已读取到 Max，但 ElevenLabs 返回 401：这个 Key 无效、已删除、已过期，或复制的不是完整 API Key。",
            502,
          );
        }
        if (response.status === 403) {
          return jsonError(
            "Cloudflare 已读取到 Max，但 ElevenLabs 返回 403：Key 权限不足或设置了 IP 限制。请开启 Voices 读取与 Text to Speech 权限，并取消 IP 限制。",
            502,
          );
        }
        if (response.status === 429) {
          return jsonError("ElevenLabs 当前请求过于频繁，请稍后再试。", 429);
        }
        return jsonError(`ElevenLabs 返回错误 ${response.status}，暂时无法读取声线。`, 502);
      }

      const payload = (await response.json()) as ElevenVoicesPayload;
      collected.push(...(payload.voices ?? []));

      if (!payload.has_more || !payload.next_page_token) break;
      nextPageToken = payload.next_page_token;
    }

    const seen = new Set<string>();
    const voices = collected
      .filter(
        (item): item is ElevenVoice & { voice_id: string; name: string } =>
          typeof item.voice_id === "string" &&
          item.voice_id.length > 0 &&
          typeof item.name === "string" &&
          item.name.length > 0,
      )
      .filter((item) => {
        if (seen.has(item.voice_id)) return false;
        seen.add(item.voice_id);
        return true;
      })
      .map((item) => ({
        id: item.voice_id,
        name: item.name,
        gender: item.labels?.gender ?? "",
        accent: item.labels?.accent ?? "",
        age: item.labels?.age ?? "",
        useCase: item.labels?.use_case ?? "",
        category: item.category ?? "",
        previewUrl: item.preview_url ?? "",
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
