"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import OmniVoiceStudio from "./components/OmniVoiceStudio";
import PiperLocalStudio from "./components/PiperLocalStudio";

const SAMPLE_TEXT =
  "Сәлем тораптастар! Бүгінгі маңызды жаңалықтарға назар аударайық. Ел ішінде және әлемде болған басты оқиғаларды бірге шоламыз.";

const MAX_CHARACTERS = 15000;

const EDGE_VOICES = [
  {
    id: "kk-KZ-DauletNeural",
    name: "Дәулет",
    meta: "原版男声 · 真人新闻播报优化 · 纯哈萨克语推荐",
    mark: "D",
  },
  {
    id: "kk-KZ-AigulNeural",
    name: "Айгүл",
    meta: "原版女声 · 纯哈萨克语推荐",
    mark: "A",
  },
  {
    id: "edge-unified-male",
    name: "统一男声",
    meta: "中哈同音色 · 多语言",
    mark: "M",
  },
  {
    id: "edge-unified-female",
    name: "统一女声",
    meta: "中哈同音色 · 多语言",
    mark: "F",
  },
  {
    id: "edge-young-male",
    name: "青年男声",
    meta: "Brian · 较年轻听感 · 多语言",
    mark: "B",
  },
  {
    id: "edge-mature-male",
    name: "成熟男声",
    meta: "Andrew · 较成熟听感 · 多语言",
    mark: "R",
  },
  {
    id: "edge-young-female",
    name: "青年女声",
    meta: "Ava · 较年轻听感 · 多语言",
    mark: "V",
  },
  {
    id: "edge-mature-female",
    name: "成熟女声",
    meta: "Emma · 较成熟听感 · 多语言",
    mark: "E",
  },
] as const;

const M3_ANCHOR_TOKEN = "m3-persistent-anchor";

const GEMINI_MODELS = [
  {
    id: "gemini-3.8-flash-tts",
    name: "Gemini 3.8 Flash TTS",
    note: "旗舰音质 · 长稿稳定 · 哈萨克语优先测试",
  },
  {
    id: "gemini-3.8-flash-lite-tts",
    name: "Gemini 3.8 Flash-Lite TTS",
    note: "更快更省 · 批量生成优先",
  },
] as const;

type GeminiVoice = {
  id: string;
  name: string;
  gender?: string;
  pitch?: string;
  accent?: string;
  context?: string;
  language?: string;
  description?: string;
  type?: string;
};

const M3_CURRENT_ANCHOR: GeminiVoice = {
  id: M3_ANCHOR_TOKEN,
  name: "M3 V2 当前专属主播",
  gender: "male",
  pitch: "medium",
  language: "kk-KZ",
  type: "prompted",
  description: "当前专属持久声纹 · 较成熟偏厚；可切换下方其他男声",
};

const GEMINI_FALLBACK_VOICES: GeminiVoice[] = [
  { id: "Gacrux", name: "Gacrux", gender: "male", pitch: "medium", type: "prebuilt", description: "Mature · 成熟稳重" },
  { id: "Charon", name: "Charon", gender: "male", pitch: "medium", type: "prebuilt", description: "Informative · 资讯播报" },
  { id: "Rasalgethi", name: "Rasalgethi", gender: "male", pitch: "medium", type: "prebuilt", description: "Informative · 稳健资讯" },
  { id: "Alnilam", name: "Alnilam", gender: "male", pitch: "medium", type: "prebuilt", description: "Firm · 坚定清晰" },
];

const PRESETS = [
  { id: "news", label: "标准新闻", note: "连续主持 · 条目开场与收尾", rateFactor: 1.01 },
  { id: "calm", label: "沉稳长稿", note: "长稿连续 · 沉稳主持", rateFactor: 0.97 },
  { id: "bulletin", label: "简明快讯", note: "连续快讯 · 紧凑转场", rateFactor: 1.045 },
  { id: "expressive", label: "生动播报", note: "连续主持 · 动态表现", rateFactor: 1.01 },
  { id: "story", label: "故事版", note: "逐词情绪分析 · 自然句间呼吸 · 段落停留", rateFactor: 1 },
] as const;

const SPEED_PRESETS = [0.7, 0.8, 0.9, 0.95, 1, 1.05, 1.1, 1.2] as const;

const TONE_PRESETS = [
  {
    id: "natural",
    label: "自然真实",
    note: "平衡、接近原声",
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0,
    speakerBoost: true,
  },
  {
    id: "broadcast",
    label: "新闻播音",
    note: "稳定、清晰、有分量",
    stability: 0.72,
    similarityBoost: 0.82,
    style: 0.08,
    speakerBoost: true,
  },
  {
    id: "expressive",
    label: "情绪丰富",
    note: "更有自然起伏",
    stability: 0.28,
    similarityBoost: 0.72,
    style: 0.35,
    speakerBoost: true,
  },
  {
    id: "dramatic",
    label: "强表现力",
    note: "起伏更明显",
    stability: 0.18,
    similarityBoost: 0.65,
    style: 0.55,
    speakerBoost: true,
  },
] as const;

const ELEVEN_V3_DIRECTION_TAGS = [
  { token: "[短停顿]", label: "短停顿", note: "轻微换气" },
  { token: "[长停顿]", label: "长停顿", note: "段落停留" },
  { token: "[开心]", label: "开心", note: "更明亮" },
  { token: "[悲伤]", label: "悲伤", note: "更低沉" },
  { token: "[惊讶]", label: "惊讶", note: "抬高语气" },
  { token: "[生气]", label: "生气", note: "增强力度" },
  { token: "[害怕]", label: "紧张", note: "更谨慎" },
  { token: "[厌恶]", label: "厌恶", note: "明显排斥" },
  { token: "[平静]", label: "平静", note: "克制稳定" },
  { token: "[耳语]", label: "耳语", note: "压低声线" },
  { token: "[叹气]", label: "叹气", note: "自然呼吸" },
  { token: "[轻笑]", label: "轻笑", note: "轻微笑声" },
  { token: "[清嗓]", label: "清嗓", note: "播音前动作" },
] as const;


type Engine = "edge" | "eleven" | "gemini" | "omnivoice" | "piper";
type PresetId = (typeof PRESETS)[number]["id"];
type EmotionAnalysisStatus = "idle" | "analyzing" | "completed" | "failed";
type VoiceDirectorStatus = "idle" | "analyzing" | "completed" | "failed";
type VoiceDirectorDecision = {
  index: number;
  text: string;
  emotion: string;
  label: string;
  confidence: number;
  intensity: number;
  reason: string;
  applied: boolean;
  actionTag?: string | null;
};
type VoiceDirectorResult = {
  status: "completed";
  mode: "news-safe";
  sentenceCount: number;
  taggedCount: number;
  counts: Record<string, number>;
  decisions: VoiceDirectorDecision[];
  directedText: string;
};
type ElevenVoice = {
  id: string;
  name: string;
  gender: string;
  accent: string;
  age?: string;
  useCase?: string;
  category: string;
  previewUrl?: string;
};

function formatDuration(seconds: number) {
  if (seconds < 60) return `约 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `约 ${minutes} 分 ${remainder} 秒`;
}

function describeElevenVoice(item: ElevenVoice) {
  const details = [
    item.gender,
    item.age,
    item.accent,
    item.useCase,
    item.category,
  ].filter(Boolean);
  return details.length ? details.join(" · ") : "ElevenLabs 声线";
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function signed(value: number, suffix = "%") {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}${suffix}`;
}

const DIRECTOR_EMOTION_LABELS: Record<string, string> = {
  happy: "开心",
  angry: "生气",
  sad: "悲伤",
  afraid: "害怕",
  disgusted: "厌恶",
  melancholic: "忧郁",
  surprised: "惊讶",
  calm: "平静",
};

const INDEX_EMOTION_OPTIONS = [
  ["happy", "开心"],
  ["angry", "生气"],
  ["sad", "悲伤"],
  ["afraid", "害怕"],
  ["disgusted", "厌恶"],
  ["melancholic", "忧郁"],
  ["surprised", "惊讶"],
  ["calm", "平静"],
] as const;


type SafeRangeProps = {
  ariaLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onValueChange: (value: number) => void;
};

function SafeRange({ ariaLabel, min, max, step, value, onValueChange }: SafeRangeProps) {
  const dragArmedRef = useRef(false);
  const keyboardArmedRef = useRef(false);

  return (
    <input
      aria-label={ariaLabel}
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onPointerDown={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const span = Math.max(1, max - min);
        const fraction = Math.min(1, Math.max(0, (value - min) / span));
        const edgePadding = 12;
        const usableWidth = Math.max(1, rect.width - edgePadding * 2);
        const thumbX = rect.left + edgePadding + usableWidth * fraction;
        const tolerance = event.pointerType === "touch" ? 30 : 20;

        if (Math.abs(event.clientX - thumbX) > tolerance) {
          dragArmedRef.current = false;
          event.preventDefault();
          return;
        }

        dragArmedRef.current = true;
      }}
      onPointerUp={() => {
        dragArmedRef.current = false;
      }}
      onPointerCancel={() => {
        dragArmedRef.current = false;
      }}
      onKeyDown={() => {
        keyboardArmedRef.current = true;
      }}
      onKeyUp={() => {
        keyboardArmedRef.current = false;
      }}
      onBlur={() => {
        dragArmedRef.current = false;
        keyboardArmedRef.current = false;
      }}
      onChange={(event) => {
        if (!dragArmedRef.current && !keyboardArmedRef.current) return;
        onValueChange(Number(event.target.value));
      }}
      style={{
        width: "100%",
        accentColor: "var(--mint)",
        touchAction: "pan-y",
      }}
    />
  );
}

export default function Home() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [engine, setEngine] = useState<Engine>("edge");
  const [voice, setVoice] = useState<string>("kk-KZ-DauletNeural");
  const [preset, setPreset] = useState<PresetId>("news");
  const [speed, setSpeed] = useState(1);
  const [edgePitch, setEdgePitch] = useState(0);
  const [edgeVolume, setEdgeVolume] = useState(0);
  const [stability, setStability] = useState(0.5);
  const [similarityBoost, setSimilarityBoost] = useState(0.75);
  const [style, setStyle] = useState(0);
  const [speakerBoost, setSpeakerBoost] = useState(true);
  const [elevenVoices, setElevenVoices] = useState<ElevenVoice[]>([]);
  const [isLoadingVoices, setIsLoadingVoices] = useState(false);
  const [geminiModel, setGeminiModel] = useState<(typeof GEMINI_MODELS)[number]["id"]>(
    "gemini-3.8-flash-tts",
  );
  const [geminiVoices, setGeminiVoices] = useState<GeminiVoice[]>([
    M3_CURRENT_ANCHOR,
    ...GEMINI_FALLBACK_VOICES,
  ]);
  const [isLoadingGeminiVoices, setIsLoadingGeminiVoices] = useState(false);
  const [geminiVoiceWarning, setGeminiVoiceWarning] = useState("");
  const [geminiMaleVoiceCount, setGeminiMaleVoiceCount] = useState(0);
  const [geminiVoiceSearch, setGeminiVoiceSearch] = useState("");
  const [geminiPitchFilter, setGeminiPitchFilter] = useState<"all" | "high" | "medium" | "low">("all");
  const [geminiConfigured, setGeminiConfigured] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioProgress, setAudioProgress] = useState("");
  const generationController = useRef<AbortController | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [audioSettingsDirty, setAudioSettingsDirty] = useState(false);
  const [emotionAnalysisStatus, setEmotionAnalysisStatus] = useState<EmotionAnalysisStatus>("idle");
  const [emotionSentenceCount, setEmotionSentenceCount] = useState(0);
  const [voiceDirectorStatus, setVoiceDirectorStatus] = useState<VoiceDirectorStatus>("idle");
  const [voiceDirectorResult, setVoiceDirectorResult] = useState<VoiceDirectorResult | null>(null);
  const [voiceDirectorError, setVoiceDirectorError] = useState("");
  const [voiceDirectorUndoText, setVoiceDirectorUndoText] = useState<string | null>(null);
  const [edgeDirectorEnabled, setEdgeDirectorEnabled] = useState(true);
  const [edgeFineFocusEnabled, setEdgeFineFocusEnabled] = useState(true);
  const [edgeLongFormEnabled, setEdgeLongFormEnabled] = useState(true);
  const audioUrlRef = useRef<string | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);

  const wordCount = useMemo(
    () => (text.trim() ? text.trim().split(/\s+/u).length : 0),
    [text],
  );

  const selectedElevenVoice = useMemo(
    () => elevenVoices.find((item) => item.id === voice) ?? null,
    [elevenVoices, voice],
  );

  const selectedGeminiVoice = useMemo(
    () => geminiVoices.find((item) => item.id === voice) ?? null,
    [geminiVoices, voice],
  );

  const filteredGeminiVoices = useMemo(() => {
    const query = geminiVoiceSearch.trim().toLowerCase();
    return geminiVoices.filter((item) => {
      if (item.id === M3_ANCHOR_TOKEN) return geminiPitchFilter === "all" && !query;
      if (geminiPitchFilter !== "all" && item.pitch !== geminiPitchFilter) return false;
      if (!query) return true;
      const haystack = [
        item.name,
        item.description,
        item.accent,
        item.context,
        item.language,
        item.pitch,
        item.type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [geminiVoices, geminiVoiceSearch, geminiPitchFilter]);

  const selectedPreset = useMemo(
    () => PRESETS.find((item) => item.id === preset) ?? PRESETS[0],
    [preset],
  );

  const estimatedDuration = Math.max(
    2,
    Math.round(
      wordCount /
        (engine === "eleven"
          ? 2.35 * speed
          : engine === "gemini"
            ? 2.3 * speed
            : 2.4 * speed * selectedPreset.rateFactor),
    ),
  );

  useEffect(() => {
    if (engine !== "gemini") return;
    let active = true;
    setGeminiConfigured(null);
    void fetch("/api/gemini-status", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { configured?: boolean }) => {
        if (active) setGeminiConfigured(Boolean(payload?.configured));
      })
      .catch(() => {
        if (active) setGeminiConfigured(false);
      });
    return () => {
      active = false;
    };
  }, [engine]);

  useEffect(() => {
    return () => {
      generationController.current?.abort();
      generationController.current = null;
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const cleanText = text.trim();

    if (engine !== "edge" || !cleanText) {
      setEmotionAnalysisStatus("idle");
      setEmotionSentenceCount(0);
      return;
    }

    const controller = new AbortController();
    let active = true;
    setEmotionAnalysisStatus("idle");
    setEmotionSentenceCount(0);

    const timer = window.setTimeout(async () => {
      if (!active) return;
      setEmotionAnalysisStatus("analyzing");

      try {
        const response = await fetch("/api/edge-emotion-analysis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: cleanText }),
          signal: controller.signal,
        });
        const payload = (await response.json().catch(() => null)) as
          | { status?: string; sentenceCount?: number }
          | null;

        if (!active) return;
        if (!response.ok || payload?.status !== "completed") {
          setEmotionAnalysisStatus("failed");
          setEmotionSentenceCount(0);
          return;
        }

        setEmotionSentenceCount(
          typeof payload.sentenceCount === "number" ? payload.sentenceCount : 0,
        );
        setEmotionAnalysisStatus("completed");
      } catch (caught) {
        if (!active || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setEmotionAnalysisStatus("failed");
        setEmotionSentenceCount(0);
      }
    }, 800);

    return () => {
      active = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [text, engine, preset]);

  function resetAudio() {
    if (generationController.current) {
      generationController.current.abort();
      generationController.current = null;
      setIsGenerating(false);
      setAudioProgress("");
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
    setGeneratedAt("");
    setAudioSettingsDirty(false);
  }

  function markAudioSettingsDirty() {
    if (audioUrlRef.current) setAudioSettingsDirty(true);
  }

  function resetEmotionAnalysis() {
    setEmotionAnalysisStatus("idle");
    setEmotionSentenceCount(0);
  }

  function resetVoiceDirector() {
    setVoiceDirectorStatus("idle");
    setVoiceDirectorResult(null);
    setVoiceDirectorError("");
  }

  async function runVoiceDirector() {
    const cleanText = text.trim();
    if (!cleanText) {
      setVoiceDirectorError("请先输入稿件。");
      setVoiceDirectorStatus("failed");
      return;
    }

    setVoiceDirectorStatus("analyzing");
    setVoiceDirectorError("");

    try {
      const response = await fetch("/api/voice-director", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: cleanText }),
      });
      const payload = (await response.json().catch(() => null)) as
        | (VoiceDirectorResult & { error?: string })
        | { status?: string; error?: string }
        | null;

      if (!response.ok || payload?.status !== "completed" || !("directedText" in payload)) {
        throw new Error(payload?.error || "AI 导演分析失败。");
      }

      setVoiceDirectorResult(payload as VoiceDirectorResult);
      setVoiceDirectorStatus("completed");
      setEdgeDirectorEnabled(true);
    } catch (caught) {
      setVoiceDirectorResult(null);
      setVoiceDirectorStatus("failed");
      setVoiceDirectorError(caught instanceof Error ? caught.message : "AI 导演分析失败。");
    }
  }

  function applyVoiceDirector() {
    if (!voiceDirectorResult?.directedText) return;
    setVoiceDirectorUndoText(text);
    setText(voiceDirectorResult.directedText);
    setError("");
    resetEmotionAnalysis();
    resetAudio();
  }

  function undoVoiceDirector() {
    if (voiceDirectorUndoText === null) return;
    setText(voiceDirectorUndoText);
    setVoiceDirectorUndoText(null);
    resetVoiceDirector();
    resetEmotionAnalysis();
    resetAudio();
  }

  function updateVoiceDirectorDecision(
    index: number,
    patch: Partial<Pick<VoiceDirectorDecision, "emotion" | "intensity">>,
  ) {
    setVoiceDirectorResult((current) => {
      if (!current) return current;
      const decisions = current.decisions.map((item) => {
        if (item.index !== index) return item;
        const emotion = patch.emotion ?? item.emotion;
        const intensity = patch.intensity ?? item.intensity;
        return {
          ...item,
          ...patch,
          emotion,
          intensity,
          label: DIRECTOR_EMOTION_LABELS[emotion] ?? emotion,
        };
      });
      const counts = decisions.reduce<Record<string, number>>((result, item) => {
        result[item.emotion] = (result[item.emotion] ?? 0) + 1;
        return result;
      }, {});
      return { ...current, decisions, counts };
    });
    markAudioSettingsDirty();
  }

  async function loadElevenVoices() {
    setIsLoadingVoices(true);
    setError("");

    try {
      const response = await fetch("/api/eleven-voices", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; voices?: ElevenVoice[] }
        | null;

      if (!response.ok) {
        throw new Error(payload?.error || "无法读取 ElevenLabs 声线。");
      }

      const voices = Array.isArray(payload?.voices) ? payload.voices : [];
      if (!voices.length) throw new Error("没有读取到可用的 ElevenLabs 声线。");

      setElevenVoices(voices);
      setVoice((current) =>
        voices.some((item) => item.id === current) ? current : voices[0].id,
      );
    } catch (caught) {
      setElevenVoices([]);
      setVoice("");
      setError(
        caught instanceof Error
          ? caught.message
          : "无法读取 ElevenLabs 声线，请稍后再试。",
      );
    } finally {
      setIsLoadingVoices(false);
    }
  }

  async function loadGeminiVoices() {
    setIsLoadingGeminiVoices(true);
    setGeminiVoiceWarning("");
    setError("");

    try {
      const response = await fetch("/api/gemini-voices", { method: "POST" });
      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            warning?: string;
            voices?: GeminiVoice[];
            totalMaleVoices?: number;
          }
        | null;
      if (!response.ok) throw new Error(payload?.error || "无法读取 Gemini 男声库。");

      const catalog = Array.isArray(payload?.voices) && payload.voices.length
        ? payload.voices
        : GEMINI_FALLBACK_VOICES;
      const seen = new Set<string>();
      const voices = [M3_CURRENT_ANCHOR, ...catalog].filter((item) => {
        if (!item.id || seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });

      setGeminiVoices(voices);
      setGeminiMaleVoiceCount(
        typeof payload?.totalMaleVoices === "number"
          ? payload.totalMaleVoices
          : catalog.length,
      );
      setGeminiVoiceWarning(payload?.warning || "");
      setVoice((current) =>
        voices.some((item) => item.id === current) ? current : M3_ANCHOR_TOKEN,
      );
    } catch (caught) {
      const voices = [M3_CURRENT_ANCHOR, ...GEMINI_FALLBACK_VOICES];
      setGeminiVoices(voices);
      setGeminiMaleVoiceCount(GEMINI_FALLBACK_VOICES.length);
      setGeminiVoiceWarning(
        caught instanceof Error
          ? `${caught.message} 已回退到内置已确认男声。`
          : "读取 Gemini 男声库失败，已回退到内置已确认男声。",
      );
      setVoice(M3_ANCHOR_TOKEN);
    } finally {
      setIsLoadingGeminiVoices(false);
    }
  }

  function selectEngine(nextEngine: Engine) {
    if (nextEngine === engine) return;
    setEngine(nextEngine);
    setVoice(
      nextEngine === "edge"
        ? EDGE_VOICES[0].id
        : nextEngine === "eleven"
          ? elevenVoices[0]?.id ?? ""
          : nextEngine === "gemini"
            ? M3_ANCHOR_TOKEN
            : "",
    );
    setError("");
    resetEmotionAnalysis();
    resetAudio();

    if (nextEngine === "eleven" && !elevenVoices.length) {
      void loadElevenVoices();
    }

    if (nextEngine === "gemini") {
      void loadGeminiVoices();
    }

    if (nextEngine === "omnivoice" || nextEngine === "piper") {
      window.setTimeout(() => {
        document
          .getElementById(nextEngine === "omnivoice" ? "omnivoice" : "piper-local")
          ?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          });
      }, 100);
    }
  }

  function applyTonePreset(item: (typeof TONE_PRESETS)[number]) {
    setStability(item.stability);
    setSimilarityBoost(item.similarityBoost);
    setStyle(item.style);
    setSpeakerBoost(item.speakerBoost);
    setError("");
    resetAudio();
  }

  async function generateAudio() {
    const cleanText = text.trim();
    if (!cleanText) {
      setError("请先粘贴一段哈萨克语文本。");
      return;
    }
    if (cleanText.length > MAX_CHARACTERS) {
      setError(`文本不能超过 ${MAX_CHARACTERS} 个字符。`);
      return;
    }
    if (engine === "eleven" && !voice) {
      setError("请先读取并选择一个 ElevenLabs 声线。");
      return;
    }
    if (engine === "gemini" && !voice) {
      setError("请先选择一个 Gemini TTS 声线。");
      return;
    }

    setIsGenerating(true);
    setAudioProgress(
      engine === "gemini"
        ? "正在生成 Gemini 3.8 哈萨克语播音…"
        : engine === "eleven"
          ? "正在生成 ElevenLabs 高质量播音…"
          : "正在生成免费增强播音…",
    );
    setError("");
    generationController.current?.abort();
    const controller = new AbortController();
    generationController.current = controller;

    try {
      // Emotion preflight is best-effort UI feedback only. Never block TTS on it:
      // the synthesis route runs the real full emotion/prosody plan itself.
      if (engine !== "edge") resetEmotionAnalysis();

      const isDauletNews = engine === "edge" && voice === "kk-KZ-DauletNeural" && !/\p{Script=Han}/u.test(cleanText);
      const payload = {
          text: cleanText,
          engine,
          voice,
          preset,
          speed,
          edgePitch,
          edgeVolume,
          stability,
          similarityBoost,
          style,
          speakerBoost,
          edgeFineFocus: engine === "edge" ? edgeFineFocusEnabled : false,
          edgeLongFormContinuity: engine === "edge" ? edgeLongFormEnabled : false,
          edgeNewsAudio: isDauletNews ? "pcm-stream-v1" : undefined,
          edgeEmotionOverrides:
            engine === "edge" && edgeDirectorEnabled && voiceDirectorStatus === "completed" && voiceDirectorResult
              ? voiceDirectorResult.decisions.map((item) => ({
                  index: item.index,
                  emotion: item.emotion,
                  intensity: Math.max(0, Math.min(1, item.intensity)),
                }))
              : [],
      };
      const requestPath = engine === "gemini" ? "/api/gemini-tts" : "/api/synthesize";
      const requestPayload =
        engine === "gemini"
          ? {
              text: cleanText,
              model: geminiModel,
              voice,
              preset,
              speed,
            }
          : payload;
      const audioTools = isDauletNews ? await import("./lib/daulet-audio-client") : null;
      const cacheKey = audioTools ? await audioTools.dauletAudioCacheKey(payload) : null;
      let audioBlob = audioTools ? await audioTools.readDauletCache(cacheKey) : null;
      if (!audioBlob) {
        const response = await fetch(requestPath, {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify(requestPayload),
          signal: controller.signal,
        });

        if (!response.ok) {
          const failure = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
          throw new Error(failure?.error || "语音生成失败，请稍后再试。");
        }

        const optimizedStream = audioTools && response.headers.get("Content-Type")?.includes("application/x-daulet-pcm");
        if (optimizedStream) {
          try {
            audioBlob = await audioTools.processDauletResponse(response, controller.signal, setAudioProgress);
          } catch (processingError) {
            if (controller.signal.aborted) throw processingError;
            // A Worker that fails after consuming PCM needs a fresh stream, but
            // must keep the same SSML, pitch, pauses and DSP as the normal path.
            setAudioProgress("正在使用兼容音质处理…");
            const fallbackResponse = await fetch("/api/synthesize", {
              method: "POST",
              headers: {"Content-Type": "application/json"},
              body: JSON.stringify(payload),
              signal: controller.signal,
            });
            if (!fallbackResponse.ok) {
              const failure = (await fallbackResponse.json().catch(() => null)) as
                | { error?: string }
                | null;
              throw new Error(failure?.error || "兼容模式生成失败，请稍后再试。");
            }
            if (!fallbackResponse.headers.get("Content-Type")?.includes("application/x-daulet-pcm")) {
              throw new Error("没有收到完整的优化音频，请重新生成。");
            }
            audioBlob = await audioTools.processDauletResponseOnMainThread(fallbackResponse, controller.signal, setAudioProgress);
          }
          if (audioBlob.size && !controller.signal.aborted) void audioTools.writeDauletCache(cacheKey, audioBlob);
        } else {
          audioBlob = await response.blob();
        }
      }
      if (controller.signal.aborted) return;
      if (!audioBlob.size) throw new Error("没有收到音频，请重新生成。");

      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      const nextUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      setAudioSettingsDirty(false);
      setGeneratedAt(
        new Date().toLocaleTimeString("zh-CN", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof Error
          ? caught.message
          : engine === "eleven"
            ? "高质量语音服务暂时繁忙，请稍后重试。"
            : engine === "gemini"
              ? "Gemini TTS 暂时繁忙，请稍后重试。"
              : "免费语音服务暂时繁忙，请稍后重试。",
      );
    } finally {
      if (generationController.current === controller) {
        generationController.current = null;
        setIsGenerating(false);
        setAudioProgress("");
      }
    }
  }

  function clearText() {
    setText("");
    setError("");
    resetEmotionAnalysis();
    resetVoiceDirector();
    setVoiceDirectorUndoText(null);
    resetAudio();
  }

  function insertDirectionTag(token: string) {
    const textarea = textAreaRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? start;
    const selected = text.slice(start, end);
    const insertion = selected ? `${selected}${token}` : token;
    const nextText = `${text.slice(0, start)}${insertion}${text.slice(end)}`;

    if (nextText.length > MAX_CHARACTERS) {
      setError(`加入标签后文本不能超过 ${MAX_CHARACTERS} 个字符。`);
      return;
    }

    setText(nextText);
    setError("");
    resetEmotionAnalysis();
    resetAudio();

    window.requestAnimationFrame(() => {
      if (!textarea) return;
      const nextCaret = start + insertion.length;
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }

  const speedControl = (label: string) => (
    <fieldset className="field-block">
      <legend>{label}</legend>
      <div className="textarea-wrap" style={{ padding: "16px 17px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ minWidth: 48, fontWeight: 700, fontSize: 15 }}>
            {speed.toFixed(2)}×
          </span>
          <SafeRange
            ariaLabel={`${label}倍速`}
            min={0.7}
            max={1.2}
            step={0.01}
            value={speed}
            onValueChange={(nextValue) => {
              setSpeed(nextValue);
              markAudioSettingsDirty();
            }}
          />
        </div>
        <div className="preset-grid" style={{ marginTop: 14 }}>
          {SPEED_PRESETS.map((item) => (
            <button
              className={Math.abs(speed - item) < 0.001 ? "preset selected" : "preset"}
              type="button"
              key={item}
              onClick={() => {
                setSpeed(item);
                markAudioSettingsDirty();
              }}
              aria-pressed={Math.abs(speed - item) < 0.001}
            >
              <strong>{item.toFixed(item === 0.95 || item === 1.05 ? 2 : 1)}×</strong>
              <small>{item < 1 ? "更慢" : item > 1 ? "更快" : "原速"}</small>
            </button>
          ))}
        </div>
        <small style={{ display: "block", marginTop: 10 }}>
          防误触：请按住圆形滑块再拖动；轻点滑轨不会改变参数。
        </small>
        <div className="textarea-footer" style={{ margin: "12px -17px -12px" }}>
          <span>精细步进 0.01×</span>
          <span>0.70× – 1.20×</span>
        </div>
      </div>
    </fieldset>
  );

  return (
    <main className="site-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <a className="brand" href="#top" aria-label="返回顶部">
          <span className="brand-signal" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            <strong>QAZAQ</strong>
            <small>RADIO VOICE</small>
          </span>
        </a>
        <div className="top-status" aria-label="当前语音模式">
          <span className="status-dot" />
          {engine === "edge"
            ? "免费模式 1 · Edge TTS 增强"
            : engine === "eleven"
              ? "高质量模式 · ElevenLabs v3"
              : engine === "gemini"
                ? "M3 · 固定哈萨克男性主播"
                : engine === "omnivoice"
                  ? "免费模式 2 · KazakhTTS-OmniVoice"
                  : "免费模式 3 · Piper Local"}
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow">
            <span>ҚАЗАҚША</span>
            <span className="eyebrow-line" />
            <span>KAZAKH TTS</span>
          </div>
          <h1>
            让哈萨克语，
            <em>像新闻一样</em>
            被听见。
          </h1>
          <p className="hero-description">
            现在提供五套哈萨克语播音引擎：免费模式 1 为 Edge TTS，免费模式 2 为 KazakhTTS-OmniVoice，免费模式 3 为浏览器本地 Piper M2，高质量模式为 ElevenLabs v3，新增 M3 固定哈萨克男性主播。M3 基于 Gemini 3.8 TTS，从开头到第十三条新闻和结尾始终由同一个男性主播完成，长稿分段也锁定同一声线与同一播音人格；原有模式全部保留。
          </p>
          <div className="feature-row" aria-label="功能特点">
            <span>Edge / OmniVoice / Piper / ElevenLabs / Gemini</span>
            <span>Edge / v3 中哈自动混读</span>
            <span>三种模式均可调倍速</span>
            <span>ISSAI 式表达标签</span>
            <span>Index 2.5 式情绪强度</span>
            <span>Fish S2 式句内重点</span>
            <span>VibeVoice 式长稿连续</span>
            <span>Edge 音调 / 音量</span>
            <span>MP3 下载</span>
          </div>

          <div className="broadcast-note">
            <div className="broadcast-index">01</div>
            <div>
              <strong>专为哈萨克语稿件设计</strong>
              <p>新闻、短视频旁白、通知与长稿均可使用</p>
            </div>
          </div>
        </div>

        <section className="studio-card" id="studio" aria-labelledby="studio-title">
          <div className="studio-head">
            <div>
              <p className="section-kicker">BROADCAST STUDIO</p>
              <h2 id="studio-title">播音工作台</h2>
            </div>
            <div className="format-badge">MP3 / WAV</div>
          </div>

          <div className="field-block">
            <div className="field-label-row">
              <label htmlFor="kazakh-text">哈萨克语稿件</label>
              <button className="text-action" type="button" onClick={clearText}>
                清空
              </button>
            </div>
            <div className="textarea-wrap">
              <textarea
                ref={textAreaRef}
                id="kazakh-text"
                value={text}
                maxLength={MAX_CHARACTERS}
                onChange={(event) => {
                  setText(event.target.value);
                  resetEmotionAnalysis();
                  resetVoiceDirector();
                  setVoiceDirectorUndoText(null);
                  if (error) setError("");
                }}
                placeholder="Осы жерге қазақша мәтінді енгізіңіз…"
                spellCheck={false}
                aria-describedby="character-count"
              />
              {engine === "eleven" ? (
                <div className="direction-panel" aria-label="ElevenLabs v3 表达控制">
                  <div className="direction-panel-head">
                    <div>
                      <strong>ISSAI 式表达控制</strong>
                      <small>句尾点情绪标签控制前一句；停顿与动作标签可直接插在需要的位置</small>
                    </div>
                    <span>v3</span>
                  </div>

                  <div className="director-card" aria-live="polite">
                    <div className="director-card-head">
                      <div>
                        <strong>AI 导演 · 新闻稳健</strong>
                        <small>逐句判断并参考 Index 2.5 八维情绪；战争、袭击等严肃内容默认保持平静，不自动表演化</small>
                      </div>
                      <button
                        className="director-run"
                        type="button"
                        onClick={() => void runVoiceDirector()}
                        disabled={voiceDirectorStatus === "analyzing" || !text.trim()}
                      >
                        {voiceDirectorStatus === "analyzing" ? "分析中…" : "分析整篇"}
                      </button>
                    </div>

                    {voiceDirectorStatus === "completed" && voiceDirectorResult ? (
                      <>
                        <div className="director-summary">
                          <span>已判断 {voiceDirectorResult.sentenceCount} 句</span>
                          <span>建议控制 {voiceDirectorResult.taggedCount} 句</span>
                          {Object.entries(voiceDirectorResult.counts)
                            .filter(([, count]) => count > 0)
                            .map(([emotion, count]) => (
                              <span key={emotion}>{DIRECTOR_EMOTION_LABELS[emotion] ?? emotion} {count}</span>
                            ))}
                        </div>
                        <div className="director-actions">
                          <button className="preset selected" type="button" onClick={applyVoiceDirector}>
                            <strong>应用到稿件</strong>
                            <small>只写入高置信度情绪标签</small>
                          </button>
                          {voiceDirectorUndoText !== null ? (
                            <button className="preset" type="button" onClick={undoVoiceDirector}>
                              <strong>撤销导演</strong>
                              <small>恢复应用前稿件</small>
                            </button>
                          ) : null}
                        </div>
                        <details className="director-details">
                          <summary>查看逐句导演判断</summary>
                          <div className="director-decision-list">
                            {voiceDirectorResult.decisions.map((item) => (
                              <div className="director-decision" key={item.index}>
                                <div>
                                  <strong>{item.index + 1}. {item.label}</strong>
                                  <span>{Math.round(item.confidence * 100)}%</span>
                                </div>
                                <p>{item.text}</p>
                                <small>{item.reason}{item.applied ? " · 将写入标签" : " · 保持自然基线"}</small>
                              </div>
                            ))}
                          </div>
                        </details>
                      </>
                    ) : voiceDirectorStatus === "failed" ? (
                      <div className="director-error">{voiceDirectorError || "AI 导演分析失败，请重试。"}</div>
                    ) : (
                      <div className="director-hint">先分析，不会自动改稿；确认后再点“应用到稿件”。</div>
                    )}
                  </div>

                  <div className="direction-grid">
                    {ELEVEN_V3_DIRECTION_TAGS.map((item) => (
                      <button
                        className="direction-chip"
                        type="button"
                        key={item.token}
                        onClick={() => insertDirectionTag(item.token)}
                        title={`${item.token} · ${item.note}`}
                      >
                        <strong>{item.label}</strong>
                        <small>{item.token}</small>
                      </button>
                    ))}
                  </div>
                  <div className="direction-panel-foot">
                    <span>生成时自动转换为 Eleven v3 Audio Tags</span>
                    <span>切回 Edge 时不会把这些标签念出来</span>
                  </div>
                </div>
              ) : null}
              {engine === "edge" ? (
                <>
                  <div
                    aria-live="polite"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "10px 17px",
                      borderTop: "1px solid var(--line)",
                      fontSize: 12,
                      fontWeight: 700,
                      color:
                        emotionAnalysisStatus === "completed"
                          ? "var(--mint)"
                          : emotionAnalysisStatus === "failed"
                            ? "#b42318"
                            : "var(--muted)",
                    }}
                  >
                    <span aria-hidden="true">
                      {emotionAnalysisStatus === "completed"
                        ? "✓"
                        : emotionAnalysisStatus === "failed"
                          ? "✕"
                          : emotionAnalysisStatus === "analyzing"
                            ? "◌"
                            : "○"}
                    </span>
                    <span>
                      {emotionAnalysisStatus === "completed"
                        ? `情绪分析完成${emotionSentenceCount ? ` · 已分析 ${emotionSentenceCount} 句` : ""}`
                        : emotionAnalysisStatus === "failed"
                          ? "情绪分析失败"
                          : emotionAnalysisStatus === "analyzing"
                            ? "正在分析全文情绪…"
                            : "等待输入完成后自动分析"}
                    </span>
                  </div>

                  <div className="edge-index-panel" aria-live="polite">
                    <div className="director-card-head">
                      <div>
                        <strong>Index 2.5 式情绪强度 · 免费版</strong>
                        <small>8 维情绪 + 0–100% 逐句强度。自动建议保持在约 60% 以下，优先保证新闻自然度。</small>
                      </div>
                      <button
                        className="director-run"
                        type="button"
                        onClick={() => void runVoiceDirector()}
                        disabled={voiceDirectorStatus === "analyzing" || !text.trim()}
                      >
                        {voiceDirectorStatus === "analyzing" ? "分析中…" : "分析整篇"}
                      </button>
                    </div>

                    <div className="vibe-continuity-card">
                      <div>
                        <strong>VibeVoice 式长稿连续性</strong>
                        <small>跨分块继承语速、音高与能量状态，减少长稿中途“重新开口”的感觉；正文和声线不会被改写。</small>
                      </div>
                      <button
                        className={edgeLongFormEnabled ? "director-toggle enabled" : "director-toggle"}
                        type="button"
                        onClick={() => {
                          setEdgeLongFormEnabled((current) => !current);
                          markAudioSettingsDirty();
                        }}
                      >
                        长稿连续：{edgeLongFormEnabled ? "开启" : "关闭"}
                      </button>
                      <div className="fish-focus-tags" aria-label="长稿连续性能力">
                        <span>跨块声学记忆</span>
                        <span>前后文双向平滑</span>
                        <span>主播状态继承</span>
                      </div>
                    </div>

                    <div className="fish-focus-card">
                      <div>
                        <strong>Fish S2 式句内重点</strong>
                        <small>自动给数字、伤亡数字、国家/机构名、转折与关键结论做轻量词级强调，不修改正文。</small>
                      </div>
                      <button
                        className={edgeFineFocusEnabled ? "director-toggle enabled" : "director-toggle"}
                        type="button"
                        onClick={() => {
                          setEdgeFineFocusEnabled((current) => !current);
                          markAudioSettingsDirty();
                        }}
                      >
                        句内重点：{edgeFineFocusEnabled ? "开启" : "关闭"}
                      </button>
                      <div className="fish-focus-tags" aria-label="自动句内重点类型">
                        <span>数字 / 单位</span>
                        <span>伤亡信息</span>
                        <span>国家 / 机构</span>
                        <span>转折 / 结论</span>
                      </div>
                    </div>

                    {voiceDirectorStatus === "completed" && voiceDirectorResult ? (
                      <>
                        <div className="director-summary">
                          <span>已分析 {voiceDirectorResult.sentenceCount} 句</span>
                          <span>8 维情绪</span>
                          <button
                            className={edgeDirectorEnabled ? "director-toggle enabled" : "director-toggle"}
                            type="button"
                            onClick={() => {
                              setEdgeDirectorEnabled((current) => !current);
                              markAudioSettingsDirty();
                            }}
                          >
                            情绪导演：{edgeDirectorEnabled ? "开启" : "关闭"}
                          </button>
                        </div>

                        <details className="director-details">
                          <summary>逐句调整情绪与强度</summary>
                          <div className="director-decision-list">
                            {voiceDirectorResult.decisions.map((item) => (
                              <div className="director-decision index-decision" key={item.index}>
                                <div>
                                  <strong>{item.index + 1}. {DIRECTOR_EMOTION_LABELS[item.emotion] ?? item.emotion}</strong>
                                  <span>{Math.round(item.intensity * 100)}%</span>
                                </div>
                                <p>{item.text}</p>
                                <div className="index-emotion-controls">
                                  <select
                                    aria-label={`第 ${item.index + 1} 句情绪`}
                                    value={item.emotion}
                                    onChange={(event) =>
                                      updateVoiceDirectorDecision(item.index, { emotion: event.target.value })
                                    }
                                  >
                                    {INDEX_EMOTION_OPTIONS.map(([value, label]) => (
                                      <option value={value} key={value}>{label}</option>
                                    ))}
                                  </select>
                                  <SafeRange
                                    ariaLabel={`第 ${item.index + 1} 句情绪强度`}
                                    min={0}
                                    max={1}
                                    step={0.05}
                                    value={item.intensity}
                                    onValueChange={(value) =>
                                      updateVoiceDirectorDecision(item.index, { intensity: value })
                                    }
                                  />
                                </div>
                                <small>{item.reason} · 建议 {Math.round(item.intensity * 100)}%</small>
                              </div>
                            ))}
                          </div>
                        </details>
                        <div className="director-hint">
                          这里不会改写稿件。下一次生成 Edge TTS 时直接把这些强度送入免费引擎；关闭“情绪导演”即可恢复原来的自动播音。
                        </div>
                      </>
                    ) : voiceDirectorStatus === "failed" ? (
                      <div className="director-error">{voiceDirectorError || "情绪导演分析失败，请重试。"}</div>
                    ) : (
                      <div className="director-hint">
                        点“分析整篇”后生成 8 维情绪和逐句强度；不分析也不影响原来的 Edge TTS。
                      </div>
                    )}
                  </div>
                </>
              ) : null}
              <div className="textarea-footer" id="character-count">
                <span>{wordCount ? `${wordCount} 个词 · ${formatDuration(estimatedDuration)}` : "等待输入"}</span>
                <span className={text.length > MAX_CHARACTERS * 0.9 ? "near-limit" : ""}>
                  {text.length.toLocaleString("zh-CN")} / {MAX_CHARACTERS.toLocaleString("zh-CN")}
                </span>
              </div>
            </div>
          </div>

          <fieldset className="field-block">
            <legend>语音模式</legend>
            <div className="voice-grid">
              <label className={`voice-option ${engine === "edge" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="engine"
                  value="edge"
                  checked={engine === "edge"}
                  onChange={() => selectEngine("edge")}
                />
                <span className="voice-avatar">F</span>
                <span className="voice-copy">
                  <strong>免费模式</strong>
                  <small>Edge TTS · 长稿连续 / 句内重点 / 情绪强度 / 声线 / 倍速 / 音调 / 音量 / 中哈同音色混读</small>
                </span>
                <span className="radio-mark" aria-hidden="true" />
              </label>

              <label className={`voice-option ${engine === "eleven" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="engine"
                  value="eleven"
                  checked={engine === "eleven"}
                  onChange={() => selectEngine("eleven")}
                />
                <span className="voice-avatar">3</span>
                <span className="voice-copy">
                  <strong>高质量模式</strong>
                  <small>ElevenLabs v3 · 声线 / 倍速 / 音色 / 表达标签 / 中文自动识别</small>
                </span>
                <span className="radio-mark" aria-hidden="true" />
              </label>

              <label className={`voice-option ${engine === "gemini" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="engine"
                  value="gemini"
                  checked={engine === "gemini"}
                  onChange={() => selectEngine("gemini")}
                />
                <span className="voice-avatar">G</span>
                <span className="voice-copy">
                  <strong>M3 · 固定男性主播</strong>
                  <small>Gemini 3.8 TTS · 单主播 · 开头到第十三条及结尾全程同一人 · 长稿连续</small>
                </span>
                <span className="radio-mark" aria-hidden="true" />
              </label>

              <label className={`voice-option ${engine === "omnivoice" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="engine"
                  value="omnivoice"
                  checked={engine === "omnivoice"}
                  onChange={() => selectEngine("omnivoice")}
                />
                <span className="voice-avatar">O</span>
                <span className="voice-copy">
                  <strong>免费模式 2</strong>
                  <small>KazakhTTS-OmniVoice · 声线设计 / 倍速 / 质量</small>
                </span>
                <span className="radio-mark" aria-hidden="true" />
              </label>

              <label className={`voice-option ${engine === "piper" ? "selected" : ""}`}>
                <input
                  type="radio"
                  name="engine"
                  value="piper"
                  checked={engine === "piper"}
                  onChange={() => selectEngine("piper")}
                />
                <span className="voice-avatar">P</span>
                <span className="voice-copy">
                  <strong>免费模式 3</strong>
                  <small>Piper Local · M2 青年感男声 · 专属新闻参数 · 浏览器本地生成</small>
                </span>
                <span className="radio-mark" aria-hidden="true" />
              </label>
            </div>
          </fieldset>

          {engine === "edge" ? (
            <>
              <fieldset className="field-block">
                <legend>选择播音员</legend>
                <div className="voice-grid">
                  {EDGE_VOICES.map((item) => (
                    <label
                      className={`voice-option ${voice === item.id ? "selected" : ""}`}
                      key={item.id}
                    >
                      <input
                        type="radio"
                        name="voice"
                        value={item.id}
                        checked={voice === item.id}
                        onChange={() => {
                          setVoice(item.id);
                          setError("");
                          resetAudio();
                        }}
                      />
                      <span className="voice-avatar">{item.mark}</span>
                      <span className="voice-copy">
                        <strong>{item.name}</strong>
                        <small>{item.meta}</small>
                      </span>
                      <span className="radio-mark" aria-hidden="true" />
                    </label>
                  ))}
                </div>
              </fieldset>

              {speedControl("倍速调节")}

              <fieldset className="field-block">
                <legend>音色与表现力</legend>
                <div className="preset-grid">
                  {PRESETS.map((item) => (
                    <button
                      className={preset === item.id ? "preset selected" : "preset"}
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setPreset(item.id);
                        resetEmotionAnalysis();
                        setError("");
                        resetAudio();
                      }}
                      aria-pressed={preset === item.id}
                    >
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </button>
                  ))}
                </div>

                <div className="textarea-wrap" style={{ padding: "16px 17px 12px", marginTop: 12 }}>
                  <label style={{ display: "block", marginBottom: 18 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                      <strong>音调</strong>
                      <span>{signed(edgePitch)}</span>
                    </div>
                    <SafeRange
                      ariaLabel="Edge TTS 音调"
                      min={-20}
                      max={20}
                      step={1}
                      value={edgePitch}
                      onValueChange={(nextValue) => {
                        setEdgePitch(nextValue);
                        markAudioSettingsDirty();
                      }}
                    />
                    <small>降低更沉稳，提高更明亮；新闻建议 -5% 到 +5%</small>
                  </label>

                  <label style={{ display: "block", marginBottom: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                      <strong>音量</strong>
                      <span>{signed(edgeVolume, "dB")}</span>
                    </div>
                    <SafeRange
                      ariaLabel="Edge TTS 音量"
                      min={-8}
                      max={8}
                      step={0.5}
                      value={edgeVolume}
                      onValueChange={(nextValue) => {
                        setEdgeVolume(nextValue);
                        markAudioSettingsDirty();
                      }}
                    />
                    <small>整体增减播音强度；过高可能听起来偏硬</small>
                  </label>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10 }}>
                    <small>防误触：按住滑块拖动，点击滑轨不会跳值。</small>
                    <button
                      className="text-action"
                      type="button"
                      onClick={() => {
                        setEdgePitch(0);
                        setEdgeVolume(0);
                        markAudioSettingsDirty();
                      }}
                    >
                      恢复默认
                    </button>
                  </div>
                  <div className="textarea-footer" style={{ margin: "12px -17px -12px" }}>
                    <span>Edge SSML 实时调整</span>
                    <span>无需 ElevenLabs 额度</span>
                  </div>
                </div>
              </fieldset>


              <div className="broadcast-note">
                <div className="broadcast-index">EDGE</div>
                <div>
                  <strong>Edge TTS · 免费真人化模式</strong>
                  <p>支持 0.70×–1.20× 精细倍速、音调、音量和 4 种原生自然播音风格；新增长上下文合成与哈萨克语真人化文本前端，尽量减少长稿分段后的语气重置。可选择原版 Дәулет / Айгүл，或统一多语男声 / 女声。原版声线在纯哈萨克稿中保持原始音色；统一声线无论纯哈萨克文还是中哈混合稿都保持同一音色，中文仅切换普通话发音，不消耗 ElevenLabs 额度。</p>
                </div>
              </div>
            </>
          ) : engine === "eleven" ? (
            <>
              <div className="field-block">
                <div className="field-label-row">
                  <label htmlFor="eleven-voice">ElevenLabs 声线</label>
                  <button
                    className="text-action"
                    type="button"
                    onClick={loadElevenVoices}
                    disabled={isLoadingVoices}
                  >
                    {isLoadingVoices ? "读取中…" : elevenVoices.length ? "刷新全部声线" : "读取全部声线"}
                  </button>
                </div>
                <div className="textarea-wrap">
                  <select
                    id="eleven-voice"
                    value={voice}
                    disabled={!elevenVoices.length || isLoadingVoices}
                    onChange={(event) => {
                      setVoice(event.target.value);
                      setError("");
                      resetAudio();
                    }}
                    style={{
                      width: "100%",
                      border: 0,
                      outline: 0,
                      padding: "15px 17px",
                      background: "transparent",
                      color: "var(--ink)",
                      fontSize: 14,
                    }}
                  >
                    {!elevenVoices.length ? (
                      <option value="">{isLoadingVoices ? "正在读取 ElevenLabs 声线…" : "点击读取全部声线"}</option>
                    ) : null}
                    {elevenVoices.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {describeElevenVoice(item)}
                      </option>
                    ))}
                  </select>
                  <div className="textarea-footer">
                    <span>一次最多读取 500 条账号可用声线</span>
                    <span>{elevenVoices.length ? `已读取 ${elevenVoices.length} 条声线` : "ElevenLabs v3"}</span>
                  </div>
                </div>
                {selectedElevenVoice?.previewUrl ? (
                  <div className="broadcast-note" style={{ marginTop: 10 }}>
                    <div className="broadcast-index">▶</div>
                    <div style={{ width: "100%" }}>
                      <strong>试听当前声线原始示例</strong>
                      <audio
                        controls
                        src={selectedElevenVoice.previewUrl}
                        preload="none"
                        style={{ width: "100%", marginTop: 8 }}
                      >
                        您的浏览器不支持音频播放。
                      </audio>
                    </div>
                  </div>
                ) : null}
              </div>

              {speedControl("倍速调节")}

              <fieldset className="field-block">
                <legend>音色与表现力</legend>
                <div className="preset-grid">
                  {TONE_PRESETS.map((item) => (
                    <button
                      className="preset"
                      type="button"
                      key={item.id}
                      onClick={() => applyTonePreset(item)}
                    >
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </button>
                  ))}
                </div>

                <div className="textarea-wrap" style={{ padding: "16px 17px 12px", marginTop: 12 }}>
                  <label style={{ display: "block", marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                      <strong>稳定度</strong>
                      <span>{percent(stability)}</span>
                    </div>
                    <input
                      aria-label="稳定度"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={stability}
                      onChange={(event) => {
                        setStability(Number(event.target.value));
                        resetAudio();
                      }}
                      style={{ width: "100%", accentColor: "var(--mint)" }}
                    />
                    <small>低：变化更灵活　高：更稳定一致</small>
                  </label>

                  <label style={{ display: "block", marginBottom: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                      <strong>声线相似度</strong>
                      <span>{percent(similarityBoost)}</span>
                    </div>
                    <input
                      aria-label="声线相似度"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={similarityBoost}
                      onChange={(event) => {
                        setSimilarityBoost(Number(event.target.value));
                        resetAudio();
                      }}
                      style={{ width: "100%", accentColor: "var(--mint)" }}
                    />
                    <small>越高越贴近所选声线的原始音色</small>
                  </label>

                  <label style={{ display: "block", marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                      <strong>风格强度</strong>
                      <span>{percent(style)}</span>
                    </div>
                    <input
                      aria-label="风格强度"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={style}
                      onChange={(event) => {
                        setStyle(Number(event.target.value));
                        resetAudio();
                      }}
                      style={{ width: "100%", accentColor: "var(--mint)" }}
                    />
                    <small>越高表演感越强；新闻稿建议低到中等</small>
                  </label>

                  <button
                    className={speakerBoost ? "preset selected" : "preset"}
                    type="button"
                    onClick={() => {
                      setSpeakerBoost((current) => !current);
                      resetAudio();
                    }}
                    aria-pressed={speakerBoost}
                    style={{ width: "100%" }}
                  >
                    <strong>Speaker Boost：{speakerBoost ? "开启" : "关闭"}</strong>
                    <small>增强与所选声线的相似感</small>
                  </button>
                </div>
              </fieldset>


              <div className="broadcast-note">
                <div className="broadcast-index">V3</div>
                <div>
                  <strong>ElevenLabs v3 · 哈萨克语高质量模式</strong>
                  <p>支持最多 500 条账号声线、0.70×–1.20× 精细倍速，以及稳定度、声线相似度和风格强度等音色参数；检测到中文时自动使用 v3 的多语言识别，不再强制整段按哈萨克语解析。</p>
                </div>
              </div>
            </>
          ) : engine === "gemini" ? (
            <>
              <fieldset className="field-block">
                <legend>Gemini TTS 模型</legend>
                <div className="preset-grid">
                  {GEMINI_MODELS.map((item) => (
                    <button
                      className={geminiModel === item.id ? "preset selected" : "preset"}
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setGeminiModel(item.id);
                        setError("");
                        resetAudio();
                      }}
                      aria-pressed={geminiModel === item.id}
                    >
                      <strong>{item.name}</strong>
                      <small>{item.note}</small>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div
                className="broadcast-note"
                style={{ marginTop: 12, borderColor: geminiConfigured === false ? "#f1b5ae" : undefined }}
                aria-live="polite"
              >
                <div className="broadcast-index">
                  {geminiConfigured === null ? "…" : geminiConfigured ? "✓" : "!"}
                </div>
                <div>
                  <strong>
                    {geminiConfigured === null
                      ? "正在检查 Gemini API 连接…"
                      : geminiConfigured
                        ? "Gemini API 已接通"
                        : "还差 GEMINI_API_KEY"}
                  </strong>
                  <p>
                    {geminiConfigured === null
                      ? "正在检查 Cloudflare Worker 是否已经读取到安全密钥。"
                      : geminiConfigured
                        ? "可以直接生成哈萨克语 TTS；API Key 只保存在 Cloudflare 服务端，不会发送到浏览器。"
                        : "代码和页面已经部署完成；请在 Cloudflare Worker 的 Variables and Secrets 中添加 Secret：GEMINI_API_KEY，然后重新部署。"}
                  </p>
                </div>
              </div>

              <div className="broadcast-note" style={{ marginTop: 12 }}>
                <div className="broadcast-index">M3</div>
                <div>
                  <strong>M3 固定单主播 · 哈萨克男声可选</strong>
                  <p>这里只加载 Gemini 3.8 中标记为 kk-KZ + male 的哈萨克男声。先选一个主播，再生成整篇；开头 → 第一条 → 第二条 → …… → 第十三条 → 结尾始终只使用当前选中的这一个 voice ID。</p>
                </div>
              </div>

              <div className="field-block">
                <div className="field-label-row">
                  <label htmlFor="gemini-male-voice">选择哈萨克男主播</label>
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => void loadGeminiVoices()}
                    disabled={isLoadingGeminiVoices}
                  >
                    {isLoadingGeminiVoices ? "读取中…" : "刷新哈萨克男声"}
                  </button>
                </div>

                <div className="textarea-wrap" style={{ padding: "14px 17px 12px" }}>
                  <input
                    aria-label="搜索哈萨克男声"
                    type="search"
                    value={geminiVoiceSearch}
                    onChange={(event) => setGeminiVoiceSearch(event.target.value)}
                    placeholder="搜索名称、风格、口音…"
                    style={{
                      width: "100%",
                      border: "1px solid var(--line)",
                      borderRadius: 10,
                      outline: 0,
                      padding: "11px 12px",
                      background: "transparent",
                      color: "var(--ink)",
                      fontSize: 14,
                    }}
                  />

                  <div className="preset-grid" style={{ marginTop: 12 }}>
                    {([
                      ["all", "全部", "全部哈萨克男声"],
                      ["high", "偏细", "优先解决声音偏粗"],
                      ["medium", "中等", "自然平衡"],
                      ["low", "低沉", "更厚更稳"],
                    ] as const).map(([value, label, note]) => (
                      <button
                        className={geminiPitchFilter === value ? "preset selected" : "preset"}
                        type="button"
                        key={value}
                        onClick={() => setGeminiPitchFilter(value)}
                        aria-pressed={geminiPitchFilter === value}
                      >
                        <strong>{label}</strong>
                        <small>{note}</small>
                      </button>
                    ))}
                  </div>

                  <select
                    id="gemini-male-voice"
                    value={voice}
                    disabled={isLoadingGeminiVoices}
                    onChange={(event) => {
                      setVoice(event.target.value);
                      setError("");
                      resetAudio();
                    }}
                    style={{
                      width: "100%",
                      border: "1px solid var(--line)",
                      borderRadius: 10,
                      outline: 0,
                      marginTop: 12,
                      padding: "13px 12px",
                      background: "transparent",
                      color: "var(--ink)",
                      fontSize: 14,
                    }}
                  >
                    {filteredGeminiVoices.length ? (
                      filteredGeminiVoices.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                          {item.pitch ? ` · ${item.pitch === "high" ? "偏细" : item.pitch === "low" ? "低沉" : "中等"}` : ""}
                          {item.description ? ` · ${item.description}` : ""}
                        </option>
                      ))
                    ) : (
                      <option value={voice}>当前筛选没有结果</option>
                    )}
                  </select>

                  <div className="textarea-footer" style={{ margin: "12px -17px -12px" }}>
                    <span>{geminiMaleVoiceCount ? `已读取 ${geminiMaleVoiceCount} 个 kk-KZ 哈萨克男声` : "等待读取哈萨克男声库"}</span>
                    <span>{selectedGeminiVoice?.pitch === "high" ? "当前：偏细" : selectedGeminiVoice?.pitch === "low" ? "当前：低沉" : "当前：中等 / 未标注"}</span>
                  </div>
                </div>

                {geminiVoiceWarning ? (
                  <p style={{ margin: "8px 2px 0", fontSize: 12, lineHeight: 1.6, opacity: 0.72 }}>
                    {geminiVoiceWarning}
                  </p>
                ) : null}
              </div>

              {speedControl("倍速调节")}

              <fieldset className="field-block">
                <legend>Gemini 播音风格</legend>
                <div className="preset-grid">
                  {PRESETS.map((item) => (
                    <button
                      className={preset === item.id ? "preset selected" : "preset"}
                      type="button"
                      key={item.id}
                      onClick={() => {
                        setPreset(item.id);
                        setError("");
                        resetAudio();
                      }}
                      aria-pressed={preset === item.id}
                    >
                      <strong>{item.label}</strong>
                      <small>{item.note}</small>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div className="broadcast-note">
                <div className="broadcast-index">G</div>
                <div>
                  <strong>M3 · 可选哈萨克男声 · 整篇锁定同一人</strong>
                  <p>默认使用 24 kHz WAV。你选择哪一个 kk-KZ 男声，整篇和所有长稿分段都复用同一个 voice ID；不会按第一条、第二条等新闻自动换人。普通 5800–6000 字新闻稿仍优先一次生成，Бірінші、Екінші直到Он үшінші等编号后自动加入短停顿。</p>
                </div>
              </div>
            </>
          ) : engine === "omnivoice" ? (
            <>
              <div className="broadcast-note" style={{ marginTop: 24 }}>
                <div className="broadcast-index">OV</div>
                <div>
                  <strong>KazakhTTS-OmniVoice · 免费模式 2 已选中</strong>
                  <p>这是共享 GPU 模式，支持男/女声设计、年龄、音高、耳语、倍速和质量档位。下方是它的专用控制区。</p>
                </div>
              </div>
              <button
                className="generate-button"
                type="button"
                onClick={() =>
                  document.getElementById("omnivoice")?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <span className="button-icon" aria-hidden="true"><i className="play-triangle" /></span>
                <span>
                  <strong>进入 KazakhTTS-OmniVoice 控制区</strong>
                  <small>免费共享 GPU · 声线设计 + 倍速 + 质量控制</small>
                </span>
                <span className="button-arrow" aria-hidden="true">→</span>
              </button>
            </>
          ) : (
            <>
              <div className="broadcast-note" style={{ marginTop: 24 }}>
                <div className="broadcast-index">P</div>
                <div>
                  <strong>Piper M2 · 免费模式 3 已选中</strong>
                  <p>完全非 Edge 的浏览器本地模式，现在只保留 M2，并加入和 Дәулет 相同思路的新闻预设、长句保护、数字清晰度与段落节奏优化。</p>
                </div>
              </div>
              <button
                className="generate-button"
                type="button"
                onClick={() =>
                  document.getElementById("piper-local")?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                <span className="button-icon" aria-hidden="true"><i className="play-triangle" /></span>
                <span>
                  <strong>进入 Piper M2 播音控制区</strong>
                  <small>M2 单一主声线 · 五套播音预设 · 浏览器本地生成</small>
                </span>
                <span className="button-arrow" aria-hidden="true">→</span>
              </button>
            </>
          )}

          {engine !== "omnivoice" && engine !== "piper" ? (
            <>
          {error ? (
            <div className="error-message" role="alert">
              <span>!</span>
              {error}
            </div>
          ) : null}

          <button
            className="generate-button"
            type="button"
            onClick={generateAudio}
            disabled={
              !text.trim() ||
              isGenerating ||
              ((engine === "eleven" || engine === "gemini") && !voice)
            }
          >
            <span className="button-icon" aria-hidden="true">
              {isGenerating ? <i className="spinner" /> : <i className="play-triangle" />}
            </span>
            <span>
              <strong>
                {isGenerating
                  ? engine === "eleven"
                    ? "正在生成高质量播音…"
                    : engine === "gemini"
                      ? audioProgress || "正在生成 M3 固定单主播播音…"
                      : audioProgress || "正在生成免费增强播音…"
                  : engine === "eleven"
                    ? voice
                      ? `生成 ElevenLabs v3 · ${speed.toFixed(2)}×`
                      : "正在等待 ElevenLabs 声线"
                    : engine === "gemini"
                      ? voice
                        ? `生成 M3 · ${selectedGeminiVoice?.name || "哈萨克男主播"} · ${geminiModel === "gemini-3.8-flash-tts" ? "Flash" : "Flash-Lite"} · ${speed.toFixed(2)}×`
                        : "正在等待 M3 主播"
                      : `生成 Edge TTS · ${speed.toFixed(2)}×`}
              </strong>
              <small>
                {isGenerating
                  ? "请保持页面开启"
                  : engine === "eleven"
                    ? "声线 + 倍速 + 音色参数 · 生成后可试听并下载 MP3"
                    : engine === "gemini"
                      ? "所选 kk-KZ 男声整篇锁定 + 新闻风格 + 编号停顿 + 优先整稿一次生成 · 24 kHz WAV"
                      : "声线 + 倍速 + 音调 + 音量 · 免费生成 MP3"}
              </small>
            </span>
            <span className="button-arrow" aria-hidden="true">→</span>
          </button>

          <div className={`result-panel ${audioUrl ? "has-audio" : ""}`} aria-live="polite">
            <div className="result-topline">
              <div>
                <span className="result-dot" />
                <strong>{audioUrl ? "音频已生成" : "音频播放器"}</strong>
              </div>
              {generatedAt ? <time>{generatedAt}</time> : <span>等待生成</span>}
            </div>

            {audioUrl && audioSettingsDirty ? (
              <p style={{ margin: "10px 0 0", fontSize: 12, lineHeight: 1.6, opacity: 0.72 }}>
                参数已修改 · 当前播放器仍保留上一次生成结果；重新生成后才会应用新参数。
              </p>
            ) : null}

            {audioUrl ? (
              <div className="audio-ready">
                <audio controls src={audioUrl} preload="metadata">
                  您的浏览器不支持音频播放。
                </audio>
                <a
                  className="download-link"
                  href={audioUrl}
                  download={engine === "gemini" ? "qazaq-radio-m3.wav" : "qazaq-radio.mp3"}
                >
                  <span aria-hidden="true">↓</span>
                  {engine === "gemini" ? "下载 WAV" : "下载 MP3"}
                </a>
              </div>
            ) : (
              <div className="empty-player">
                <div className="waveform" aria-hidden="true">
                  {[18, 30, 42, 24, 51, 34, 62, 38, 55, 28, 46, 22, 36, 54, 31, 44, 25, 34].map(
                    (height, index) => <i style={{ height }} key={`${height}-${index}`} />,
                  )}
                </div>
                <p>
                  {engine === "eleven"
                    ? "高质量音频生成后，播放器会出现在这里"
                    : engine === "gemini"
                      ? "M3 单主播哈萨克语音频生成后，播放器会出现在这里"
                      : "免费增强音频生成后，播放器会出现在这里"}
                </p>
              </div>
            )}
          </div>
            </>
          ) : null}
        </section>
      </section>

      <OmniVoiceStudio sourceText={text} />
      <PiperLocalStudio sourceText={text} />

      <footer>
        <p>QAZAQ RADIO VOICE · 哈萨克语播音生成器</p>
        <p>
          免费模式一基于 Edge TTS · 免费模式二使用 KazakhTTS-OmniVoice 公共 Demo · 免费模式三使用 Piper + ISSAI KazakhTTS 浏览器本地推理 · 高质量模式使用 ElevenLabs v3 · AI 高质量模式使用 Gemini 3.8 TTS · API Key 仅保存在 Cloudflare 服务端 · {" "}
          <a href="https://github.com/linshenkx/edge-tts-openai-cf-worker" target="_blank" rel="noreferrer">
            查看免费通道开源项目
          </a>
        </p>
      </footer>
    </main>
  );
}
