const GEMINI_VOICES_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/voices";

const FALLBACK_VOICES = [
  { id: "Gacrux", name: "Gacrux", gender: "male", pitch: "medium", context: "News", description: "Mature · 成熟稳重" },
  { id: "Charon", name: "Charon", gender: "male", pitch: "medium", context: "News", description: "Informative · 资讯播报" },
  { id: "Rasalgethi", name: "Rasalgethi", gender: "male", pitch: "medium", context: "News", description: "Informative · 稳健资讯" },
  { id: "Schedar", name: "Schedar", gender: "neutral", pitch: "medium", context: "News", description: "Even · 平稳一致" },
  { id: "Alnilam", name: "Alnilam", gender: "male", pitch: "medium", context: "News", description: "Firm · 坚定清晰" },
  { id: "Sulafat", name: "Sulafat", gender: "neutral", pitch: "medium", context: "Narration", description: "Warm · 温暖自然" },
];

type GeminiVoicePayload = {
  voices?: Array<{
    id?: string;
    name?: string;
    display_name?: string;
    displayName?: string;
    gender?: string;
    pitch?: string;
    accent?: string;
    description?: string;
    language_code?: string;
    languageCode?: string;
    contexts?: string[];
    context?: string[];
    persona?: string[];
  }>;
};

function fallbackResponse(warning?: string) {
  return Response.json(
    {
      voices: FALLBACK_VOICES,
      catalogAvailable: false,
      warning: warning || "",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function POST() {
  const apiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!apiKey) {
    return fallbackResponse("尚未配置 GEMINI_API_KEY，先显示内置推荐 Studio 声线。");
  }

  const url = new URL(GEMINI_VOICES_ENDPOINT);
  url.searchParams.append("language_code", "kk-KZ");
  url.searchParams.append("gender", "male");
  url.searchParams.append("context", "News");
  url.searchParams.append("type", "prebuilt");
  url.searchParams.set("page_size", "100");

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "x-goog-api-key": apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return fallbackResponse(
        `暂时无法读取 Gemini 哈萨克语扩展声线库（${response.status}）${detail ? "，已回退到内置 Studio 声线。" : "。"}`,
      );
    }

    const payload = (await response.json()) as GeminiVoicePayload;
    const seen = new Set<string>();
    const voices = [
      ...(payload.voices ?? []).flatMap((item) => {
        const id = item.id?.trim();
        if (!id || seen.has(id)) return [];
        seen.add(id);
        return [{
          id,
          name: item.display_name?.trim() || item.displayName?.trim() || item.name?.trim() || id,
          gender: item.gender?.trim() || "",
          pitch: item.pitch?.trim() || "",
          accent: item.accent?.trim() || "",
          context: (item.contexts ?? item.context ?? []).join(", "),
          language: item.language_code?.trim() || item.languageCode?.trim() || "",
          description: item.description?.trim() || (item.persona ?? []).join(", "),
        }];
      }),
      ...FALLBACK_VOICES.filter((item) => !seen.has(item.id)),
    ];

    return Response.json(
      {
        voices,
        catalogAvailable: true,
        warning: "",
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      },
    );
  } catch (error) {
    console.error("Failed to load Gemini voices", error);
    return fallbackResponse("读取 Gemini 扩展声线库失败，已回退到内置 Studio 声线。");
  }
}
