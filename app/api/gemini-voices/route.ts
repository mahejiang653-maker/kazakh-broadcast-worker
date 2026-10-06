const GEMINI_VOICES_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/voices";

const FALLBACK_VOICES = [
  { id: "Gacrux", name: "Gacrux", gender: "male", pitch: "medium", context: "News", type: "prebuilt", description: "Mature · 成熟稳重" },
  { id: "Charon", name: "Charon", gender: "male", pitch: "medium", context: "News", type: "prebuilt", description: "Informative · 资讯播报" },
  { id: "Rasalgethi", name: "Rasalgethi", gender: "male", pitch: "medium", context: "News", type: "prebuilt", description: "Informative · 稳健资讯" },
  { id: "Alnilam", name: "Alnilam", gender: "male", pitch: "medium", context: "News", type: "prebuilt", description: "Firm · 坚定清晰" },
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
    context?: string | string[];
    contexts?: string[];
    persona?: string | string[];
    type?: string;
  }>;
  next_page_token?: string;
  nextPageToken?: string;
};

function asText(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return value?.trim() || "";
}

function fallbackResponse(warning?: string) {
  return Response.json(
    {
      voices: FALLBACK_VOICES,
      totalMaleVoices: FALLBACK_VOICES.length,
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
    return fallbackResponse("尚未配置 GEMINI_API_KEY，先显示内置已确认男声。");
  }

  // Google Voices API supports up to 1000 voices per page. Request the full
  // male catalog without language/context restrictions so the user can choose
  // among Studio and Extended Voice Library voices.
  const url = new URL(GEMINI_VOICES_ENDPOINT);
  url.searchParams.append("gender", "male");
  url.searchParams.set("page_size", "1000");

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
        `暂时无法读取 Gemini 全部男声（${response.status}）${detail ? "，已回退到内置已确认男声。" : "。"}`,
      );
    }

    const payload = (await response.json()) as GeminiVoicePayload;
    const seen = new Set<string>();
    const voices = (payload.voices ?? []).flatMap((item) => {
      const id = item.id?.trim();
      const gender = item.gender?.trim().toLowerCase();
      if (!id || gender !== "male" || seen.has(id)) return [];
      seen.add(id);
      return [{
        id,
        name: item.display_name?.trim() || item.displayName?.trim() || item.name?.trim() || id,
        gender: "male",
        pitch: item.pitch?.trim().toLowerCase() || "",
        accent: item.accent?.trim() || "",
        context: asText(item.contexts ?? item.context),
        language: item.language_code?.trim() || item.languageCode?.trim() || "",
        description: item.description?.trim() || asText(item.persona),
        type: item.type?.trim().toLowerCase() || "",
      }];
    });

    for (const item of FALLBACK_VOICES) {
      if (!seen.has(item.id)) voices.push(item);
    }

    const pitchRank: Record<string, number> = { high: 0, medium: 1, low: 2 };
    voices.sort((a, b) => {
      const aKk = a.language.toLowerCase() === "kk-kz" ? 0 : 1;
      const bKk = b.language.toLowerCase() === "kk-kz" ? 0 : 1;
      if (aKk !== bKk) return aKk - bKk;
      const aPitch = pitchRank[a.pitch] ?? 3;
      const bPitch = pitchRank[b.pitch] ?? 3;
      if (aPitch !== bPitch) return aPitch - bPitch;
      return a.name.localeCompare(b.name, "en");
    });

    return Response.json(
      {
        voices,
        totalMaleVoices: voices.length,
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
    console.error("Failed to load Gemini male voices", error);
    return fallbackResponse("读取 Gemini 全部男声失败，已回退到内置已确认男声。");
  }
}
