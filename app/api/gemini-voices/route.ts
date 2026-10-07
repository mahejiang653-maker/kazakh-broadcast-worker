const NAMED_MALE_STUDIO_VOICES = [
  { id: "Iapetus", name: "Iapetus", gender: "male", description: "Clear · 清晰，建议先试" },
  { id: "Schedar", name: "Schedar", gender: "male", description: "Even · 平稳，建议先试" },
  { id: "Achird", name: "Achird", gender: "male", description: "Friendly · 亲和，建议先试" },
  { id: "Charon", name: "Charon", gender: "male", description: "Informative · 资讯播报" },
  { id: "Rasalgethi", name: "Rasalgethi", gender: "male", description: "Informative · 资讯播报" },
  { id: "Algieba", name: "Algieba", gender: "male", description: "Smooth · 顺滑" },
  { id: "Alnilam", name: "Alnilam", gender: "male", description: "Firm · 坚定" },
  { id: "Orus", name: "Orus", gender: "male", description: "Firm · 坚定" },
  { id: "Umbriel", name: "Umbriel", gender: "male", description: "Easy-going · 轻松自然" },
  { id: "Zubenelgenubi", name: "Zubenelgenubi", gender: "male", description: "Casual · 日常自然" },
  { id: "Sadaltager", name: "Sadaltager", gender: "male", description: "Knowledgeable · 知识型" },
  { id: "Puck", name: "Puck", gender: "male", description: "Upbeat · 明快" },
  { id: "Sadachbia", name: "Sadachbia", gender: "male", description: "Lively · 活泼" },
  { id: "Enceladus", name: "Enceladus", gender: "male", description: "Breathy · 气声" },
  { id: "Fenrir", name: "Fenrir", gender: "male", description: "Excitable · 激昂" },
  { id: "Algenib", name: "Algenib", gender: "male", description: "Gravelly · 沙哑粗粝" },
];

export async function POST() {
  return Response.json(
    {
      voices: NAMED_MALE_STUDIO_VOICES,
      totalMaleVoices: NAMED_MALE_STUDIO_VOICES.length,
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
}
