"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const MAX_CHARACTERS = 1200;
const DEFAULT_TEXT =
  "Сәлем тораптастар! Бүгінгі маңызды жаңалықтарға назар аударайық. Ел ішінде және әлемде болған басты оқиғаларды бірге шоламыз.";

const SPEED_PRESETS = [0.7, 0.8, 0.9, 1, 1.1, 1.2] as const;

const QUALITY_PRESETS = [
  { id: "fast", label: "极速模式", note: "推荐 · 最快出结果", steps: 8, guidance: 1.3 },
  { id: "standard", label: "标准模式", note: "速度与质量平衡", steps: 12, guidance: 1.6 },
  { id: "quality", label: "高质量", note: "细节更完整", steps: 16, guidance: 2.0 },
  { id: "detail", label: "细腻表现", note: "较慢 · 表现更细", steps: 24, guidance: 2.1 },
] as const;

const VOICE_PRESETS = [
  {
    label: "新闻男声",
    note: "中年 · 中音调",
    gender: "Male / 男",
    age: "Middle-aged / 中年",
    pitch: "Moderate Pitch / 中音调",
    style: "Auto",
  },
  {
    label: "沉稳男声",
    note: "中年 · 低音调",
    gender: "Male / 男",
    age: "Middle-aged / 中年",
    pitch: "Low Pitch / 低音调",
    style: "Auto",
  },
  {
    label: "新闻女声",
    note: "青年 · 中音调",
    gender: "Female / 女",
    age: "Young Adult / 青年",
    pitch: "Moderate Pitch / 中音调",
    style: "Auto",
  },
  {
    label: "明亮女声",
    note: "青年 · 高音调",
    gender: "Female / 女",
    age: "Young Adult / 青年",
    pitch: "High Pitch / 高音调",
    style: "Auto",
  },
] as const;

const GENDERS = [
  ["Male / 男", "男声"],
  ["Female / 女", "女声"],
] as const;

const AGES = [
  ["Child / 儿童", "儿童"],
  ["Teenager / 少年", "少年"],
  ["Young Adult / 青年", "青年"],
  ["Middle-aged / 中年", "中年"],
  ["Elderly / 老年", "老年"],
] as const;

const PITCHES = [
  ["Very Low Pitch / 极低音调", "极低"],
  ["Low Pitch / 低音调", "低"],
  ["Moderate Pitch / 中音调", "中"],
  ["High Pitch / 高音调", "高"],
  ["Very High Pitch / 极高音调", "极高"],
] as const;


function formatDuration(seconds: number) {
  if (seconds < 60) return `约 ${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `约 ${minutes} 分 ${remainder} 秒`;
}

export default function OmniVoiceStudio({ sourceText }: { sourceText?: string }) {
  const [text, setText] = useState(sourceText?.slice(0, MAX_CHARACTERS) || DEFAULT_TEXT);
  const [speed, setSpeed] = useState(1);
  const [steps, setSteps] = useState(8);
  const [guidance, setGuidance] = useState(1.3);
  const [denoise, setDenoise] = useState(false);
  const [gender, setGender] = useState("Male / 男");
  const [age, setAge] = useState("Middle-aged / 中年");
  const [pitch, setPitch] = useState("Moderate Pitch / 中音调");
  const [style, setStyle] = useState("Auto");
  const [isGenerating, setIsGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [generatedAt, setGeneratedAt] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewStatus, setPreviewStatus] = useState<"idle" | "generating" | "ready" | "error">("idle");
  const [warmupStatus, setWarmupStatus] = useState("正在自动预热 OmniVoice…");
  const [cacheStatus, setCacheStatus] = useState("");
  const audioUrlRef = useRef<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const wordCount = useMemo(
    () => (text.trim() ? text.trim().split(/\s+/u).length : 0),
    [text],
  );
  const estimatedDuration = Math.max(2, Math.round(wordCount / (2.25 * speed)));

  useEffect(() => {
    if (sourceText !== undefined) {
      setText(sourceText.slice(0, MAX_CHARACTERS));
      setError(
        sourceText.length > MAX_CHARACTERS
          ? `OmniVoice 公共 GPU 单次最多 ${MAX_CHARACTERS} 个字符，已自动同步前 ${MAX_CHARACTERS} 个字符。`
          : "",
      );
      resetAudio();
    }
  }, [sourceText]);

  useEffect(() => {
    let cancelled = false;

    async function warmOmniVoice() {
      try {
        const response = await fetch("/api/omnivoice", {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json().catch(() => null)) as
          | { state?: string }
          | null;
        if (cancelled) return;
        setWarmupStatus(
          payload?.state === "ready"
            ? "OmniVoice 已连接 · 可以直接生成"
            : "已发送预热请求 · 免费 GPU 正在准备",
        );
      } catch {
        if (!cancelled) setWarmupStatus("已尝试预热 · 免费 GPU 可能仍在唤醒");
      }
    }

    void warmOmniVoice();
    const secondWarmup = window.setTimeout(() => void warmOmniVoice(), 25000);
    return () => {
      cancelled = true;
      window.clearTimeout(secondWarmup);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  function resetAudio() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setAudioUrl(null);
    setPreviewUrl(null);
    setPreviewStatus("idle");
    setCacheStatus("");
    setGeneratedAt("");
  }

  function changeSetting(action: () => void) {
    action();
    setError("");
    resetAudio();
  }

  function copyFromMainStudio() {
    if (!sourceText?.trim()) {
      setError("上方播音工作台目前没有稿件。");
      return;
    }
    const copied = sourceText.slice(0, MAX_CHARACTERS);
    setText(copied);
    setError(
      sourceText.length > MAX_CHARACTERS
        ? `OmniVoice 公共 GPU 单次最多 ${MAX_CHARACTERS} 个字符，已自动复制前 ${MAX_CHARACTERS} 个字符。`
        : "",
    );
    resetAudio();
  }

  async function createCacheKey(payload: Record<string, unknown>) {
    const source = JSON.stringify({ version: 2, ...payload });
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  async function readCachedOmniVoice(key: string) {
    if (!("caches" in window)) return null;
    try {
      const storage = await caches.open("kazakh-omnivoice-v2");
      const request = new Request(`${window.location.origin}/__omnivoice-cache__/${key}`);
      const response = await storage.match(request);
      return response ? await response.blob() : null;
    } catch {
      return null;
    }
  }

  async function writeCachedOmniVoice(key: string, blob: Blob) {
    if (!("caches" in window)) return;
    try {
      const storage = await caches.open("kazakh-omnivoice-v2");
      const request = new Request(`${window.location.origin}/__omnivoice-cache__/${key}`);
      await storage.put(
        request,
        new Response(blob, {
          headers: {
            "Content-Type": "audio/wav",
            "X-Omni-Cached-At": String(Date.now()),
          },
        }),
      );
    } catch {
      // Browser cache is optional; synthesis still works if storage is unavailable.
    }
  }

  function setPreviewBlob(blob: Blob) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const nextUrl = URL.createObjectURL(blob);
    previewUrlRef.current = nextUrl;
    setPreviewUrl(nextUrl);
    setPreviewStatus("ready");
  }

  function setOmniBlob(blob: Blob) {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    const nextUrl = URL.createObjectURL(blob);
    audioUrlRef.current = nextUrl;
    setAudioUrl(nextUrl);
    setGeneratedAt(
      new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    );
  }

  async function generateEdgePreview(cleanText: string) {
    const pitchMap: Record<string, number> = {
      "Very Low Pitch / 极低音调": -16,
      "Low Pitch / 低音调": -8,
      "Moderate Pitch / 中音调": 0,
      "High Pitch / 高音调": 8,
      "Very High Pitch / 极高音调": 16,
    };
    const response = await fetch("/api/synthesize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: cleanText,
        engine: "edge",
        voice: gender === "Female / 女" ? "kk-KZ-AigulNeural" : "kk-KZ-DauletNeural",
        preset: style === "Whisper / 耳语" ? "calm" : "news",
        speed,
        edgePitch: pitchMap[pitch] ?? 0,
        edgeVolume: style === "Whisper / 耳语" ? -4 : 0,
      }),
    });
    if (!response.ok) throw new Error("Edge 预览暂时不可用");
    const blob = await response.blob();
    if (!blob.size) throw new Error("Edge 预览没有返回音频");
    return blob;
  }

  async function generate() {
    const cleanText = text.trim();
    if (!cleanText) {
      setError("请先输入哈萨克语文本。");
      return;
    }
    if (cleanText.length > MAX_CHARACTERS) {
      setError(`OmniVoice 文本不能超过 ${MAX_CHARACTERS} 个字符。`);
      return;
    }

    const omniPayload = {
      text: cleanText,
      speed,
      steps,
      guidance,
      denoise,
      gender,
      age,
      pitch,
      style,
    };

    setIsGenerating(true);
    setError("");
    resetAudio();

    try {
      const cacheKey = await createCacheKey(omniPayload);
      const cached = await readCachedOmniVoice(cacheKey);
      if (cached?.size) {
        setOmniBlob(cached);
        setCacheStatus("命中本机缓存 · OmniVoice 即刻播放");
        setIsGenerating(false);
        return;
      }

      setCacheStatus("未命中缓存 · 正在后台生成 OmniVoice");
      setPreviewStatus("generating");

      const omniRequest = fetch("/api/omnivoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(omniPayload),
      });
      const previewRequest = generateEdgePreview(cleanText);

      try {
        const previewBlob = await previewRequest;
        setPreviewBlob(previewBlob);
      } catch {
        setPreviewStatus("error");
      }

      const response = await omniRequest;
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "OmniVoice 生成失败，请稍后再试。");
      }
      const blob = await response.blob();
      if (!blob.size) throw new Error("OmniVoice 没有返回音频。");
      setOmniBlob(blob);
      setCacheStatus("OmniVoice 已完成 · 已自动保存到本机缓存");
      void writeCachedOmniVoice(cacheKey, blob);
    } catch (caught) {
      setError(
        `${caught instanceof Error ? caught.message : "OmniVoice 免费服务暂时不可用。"}${previewUrlRef.current ? " Edge 预览仍可继续播放。" : ""}`,
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <section className="hero" id="omnivoice" style={{ paddingTop: 0 }}>
      <div className="hero-copy">
        <div className="eyebrow">
          <span>FREE 02</span>
          <span className="eyebrow-line" />
          <span>OMNIVOICE</span>
        </div>
        <h1 style={{ fontSize: "clamp(2.3rem, 7vw, 5.2rem)" }}>
          第二个免费板块，
          <em>可设计声线。</em>
        </h1>
        <p className="hero-description">
          基于 shyngys879 的 KazakhTTS-OmniVoice 公共 Demo。现在采用 Edge 秒出预览 + OmniVoice 后台高质生成 + 自动预热/本机缓存；全程不需要 ElevenLabs 额度。
        </p>
        <div className="feature-row" aria-label="OmniVoice 功能">
          <span>Edge 秒出预览</span>
          <span>自动预热 / 缓存</span>
          <span>男 / 女声设计</span>
          <span>年龄 / 音高</span>
          <span>0.70×–1.20×</span>
          <span>WAV 下载</span>
        </div>
        <div className="broadcast-note">
          <div className="broadcast-index">GPU</div>
          <div>
            <strong>{warmupStatus}</strong>
            <p>打开页面即自动唤醒免费 GPU；点击生成时 Edge 与 OmniVoice 同时启动，先试听 Edge，OmniVoice 完成后自动出现。相同文本和参数再次生成会优先读取本机缓存。</p>
          </div>
        </div>
      </div>

      <section className="studio-card" aria-labelledby="omnivoice-title">
        <div className="studio-head">
          <div>
            <p className="section-kicker">FREE STUDIO 02</p>
            <h2 id="omnivoice-title">KazakhTTS · OmniVoice</h2>
          </div>
          <div className="format-badge">WAV</div>
        </div>

        <div className="field-block">
          <div className="field-label-row">
            <label htmlFor="omnivoice-text">哈萨克语稿件</label>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="text-action" type="button" onClick={copyFromMainStudio}>
                复制上方稿件
              </button>
              <button className="text-action" type="button" onClick={() => changeSetting(() => setText(""))}>
                清空
              </button>
            </div>
          </div>
          <div className="textarea-wrap">
            <textarea
              id="omnivoice-text"
              value={text}
              maxLength={MAX_CHARACTERS}
              onChange={(event) => {
                setText(event.target.value);
                if (error) setError("");
                resetAudio();
              }}
              placeholder="Осы жерге қазақша мәтінді енгізіңіз…"
              spellCheck={false}
            />
            <div className="textarea-footer">
              <span>{wordCount ? `${wordCount} 个词 · ${formatDuration(estimatedDuration)}` : "等待输入"}</span>
              <span className={text.length > MAX_CHARACTERS * 0.9 ? "near-limit" : ""}>
                {text.length.toLocaleString("zh-CN")} / {MAX_CHARACTERS.toLocaleString("zh-CN")}
              </span>
            </div>
          </div>
        </div>

        <fieldset className="field-block">
          <legend>声线设计预设</legend>
          <div className="preset-grid">
            {VOICE_PRESETS.map((item) => (
              <button
                className="preset"
                type="button"
                key={item.label}
                onClick={() =>
                  changeSetting(() => {
                    setGender(item.gender);
                    setAge(item.age);
                    setPitch(item.pitch);
                    setStyle(item.style);
                  })
                }
              >
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field-block">
          <legend>自定义声线</legend>
          <div className="textarea-wrap" style={{ padding: "16px 17px" }}>
            <label style={{ display: "block", marginBottom: 14 }}>
              <strong>性别</strong>
              <select
                value={gender}
                onChange={(event) => changeSetting(() => setGender(event.target.value))}
                style={{ width: "100%", marginTop: 7, padding: 12, borderRadius: 10 }}
              >
                {GENDERS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label style={{ display: "block", marginBottom: 14 }}>
              <strong>年龄</strong>
              <select
                value={age}
                onChange={(event) => changeSetting(() => setAge(event.target.value))}
                style={{ width: "100%", marginTop: 7, padding: 12, borderRadius: 10 }}
              >
                {AGES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <label style={{ display: "block", marginBottom: 14 }}>
              <strong>音高</strong>
              <select
                value={pitch}
                onChange={(event) => changeSetting(() => setPitch(event.target.value))}
                style={{ width: "100%", marginTop: 7, padding: 12, borderRadius: 10 }}
              >
                {PITCHES.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select>
            </label>
            <button
              className={style === "Whisper / 耳语" ? "preset selected" : "preset"}
              type="button"
              onClick={() => changeSetting(() => setStyle((current) => current === "Auto" ? "Whisper / 耳语" : "Auto"))}
              aria-pressed={style === "Whisper / 耳语"}
              style={{ width: "100%" }}
            >
              <strong>耳语风格：{style === "Whisper / 耳语" ? "开启" : "关闭"}</strong>
              <small>OmniVoice 原生 Voice Design 风格</small>
            </button>
          </div>
        </fieldset>

        <fieldset className="field-block">
          <legend>倍速调节</legend>
          <div className="textarea-wrap" style={{ padding: "16px 17px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ minWidth: 48, fontWeight: 700, fontSize: 15 }}>{speed.toFixed(2)}×</span>
              <input
                aria-label="OmniVoice 倍速"
                type="range"
                min="0.7"
                max="1.2"
                step="0.01"
                value={speed}
                onChange={(event) => changeSetting(() => setSpeed(Number(event.target.value)))}
                style={{ width: "100%", accentColor: "var(--mint)" }}
              />
            </div>
            <div className="preset-grid" style={{ marginTop: 14 }}>
              {SPEED_PRESETS.map((item) => (
                <button
                  className={Math.abs(speed - item) < 0.001 ? "preset selected" : "preset"}
                  type="button"
                  key={item}
                  onClick={() => changeSetting(() => setSpeed(item))}
                >
                  <strong>{item.toFixed(1)}×</strong>
                  <small>{item < 1 ? "更慢" : item > 1 ? "更快" : "原速"}</small>
                </button>
              ))}
            </div>
            <div className="textarea-footer" style={{ margin: "12px -17px -12px" }}>
              <span>精细步进 0.01×</span>
              <span>0.70× – 1.20×</span>
            </div>
          </div>
        </fieldset>

        <fieldset className="field-block">
          <legend>质量与表现力</legend>
          <div className="preset-grid">
            {QUALITY_PRESETS.map((item) => (
              <button
                className={steps === item.steps && Math.abs(guidance - item.guidance) < 0.01 ? "preset selected" : "preset"}
                type="button"
                key={item.id}
                onClick={() =>
                  changeSetting(() => {
                    setSteps(item.steps);
                    setGuidance(item.guidance);
                  })
                }
              >
                <strong>{item.label}</strong>
                <small>{item.note}</small>
              </button>
            ))}
          </div>
          <div className="textarea-wrap" style={{ padding: "16px 17px 12px", marginTop: 12 }}>
            <label style={{ display: "block", marginBottom: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                <strong>推理步数</strong>
                <span>{steps}</span>
              </div>
              <input
                aria-label="OmniVoice 推理步数"
                type="range"
                min="8"
                max="40"
                step="1"
                value={steps}
                onChange={(event) => changeSetting(() => setSteps(Number(event.target.value)))}
                style={{ width: "100%", accentColor: "var(--mint)" }}
              />
              <small>8 步最快；步数越高通常越细腻，但共享 GPU 等待时间也会明显增加</small>
            </label>
            <label style={{ display: "block", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 7 }}>
                <strong>Guidance Scale</strong>
                <span>{guidance.toFixed(1)}</span>
              </div>
              <input
                aria-label="OmniVoice Guidance Scale"
                type="range"
                min="1"
                max="4"
                step="0.1"
                value={guidance}
                onChange={(event) => changeSetting(() => setGuidance(Number(event.target.value)))}
                style={{ width: "100%", accentColor: "var(--mint)" }}
              />
              <small>控制模型对声线设计条件的遵循强度；极速默认 1.3</small>
            </label>
            <button
              className={denoise ? "preset selected" : "preset"}
              type="button"
              onClick={() => changeSetting(() => setDenoise((current) => !current))}
              aria-pressed={denoise}
              style={{ width: "100%" }}
            >
              <strong>Denoise：{denoise ? "开启" : "关闭"}</strong>
              <small>关闭更快；需要更干净的高质量结果时再开启</small>
            </button>
          </div>
        </fieldset>


        <div className="broadcast-note">
          <div className="broadcast-index">OV</div>
          <div>
            <strong>OmniVoice · 第二免费引擎</strong>
            <p>
              不需要 ElevenLabs Key 或额度。Voice Design 的性别、年龄、音高和耳语风格均直接使用 OmniVoice 原生控制。
            </p>
          </div>
        </div>

        {error ? (
          <div className="error-message" role="alert">
            <span>!</span>
            {error}
          </div>
        ) : null}

        <button className="generate-button" type="button" onClick={generate} disabled={!text.trim() || isGenerating}>
          <span className="button-icon" aria-hidden="true">
            {isGenerating ? <i className="spinner" /> : <i className="play-triangle" />}
          </span>
          <span>
            <strong>{isGenerating ? "Edge 预览 + OmniVoice 后台生成中…" : `生成免费双轨语音 · ${speed.toFixed(2)}×`}</strong>
            <small>
              {isGenerating
                ? previewStatus === "ready" ? "Edge 预览已就绪 · OmniVoice 继续在后台生成" : "Edge 正在抢先生成预览 · OmniVoice 已同时启动"
                : `先出 Edge 预览，再出 OmniVoice 最终版 · 当前 ${steps} 步`}
            </small>
          </span>
          <span className="button-arrow" aria-hidden="true">→</span>
        </button>

        {(previewUrl || previewStatus === "generating" || previewStatus === "error") ? (
          <div className={`result-panel ${previewUrl ? "has-audio" : ""}`} aria-live="polite" style={{ marginBottom: 14 }}>
            <div className="result-topline">
              <div>
                <span className="result-dot" />
                <strong>{previewUrl ? "Edge 秒出预览已就绪" : previewStatus === "error" ? "Edge 预览未成功" : "Edge 预览正在生成"}</strong>
              </div>
              <span>{previewUrl ? "可先试听" : "等待几秒"}</span>
            </div>
            {previewUrl ? (
              <div className="audio-ready">
                <audio controls src={previewUrl} preload="metadata">您的浏览器不支持音频播放。</audio>
                <a className="download-link" href={previewUrl} download="qazaq-edge-preview.mp3">
                  <span aria-hidden="true">↓</span>
                  下载预览 MP3
                </a>
              </div>
            ) : (
              <div className="empty-player"><p>{previewStatus === "error" ? "不影响 OmniVoice 最终版继续生成。" : "Edge 免费引擎正在抢先生成可试听版本…"}</p></div>
            )}
          </div>
        ) : null}

        <div className={`result-panel ${audioUrl ? "has-audio" : ""}`} aria-live="polite">
          <div className="result-topline">
            <div>
              <span className="result-dot" />
              <strong>{audioUrl ? "OmniVoice 高质量最终版" : "OmniVoice 后台高质量生成"}</strong>
            </div>
            {generatedAt ? <time>{generatedAt}</time> : <span>{cacheStatus || "等待生成"}</span>}
          </div>
          {audioUrl ? (
            <div className="audio-ready">
              <audio controls src={audioUrl} preload="metadata">您的浏览器不支持音频播放。</audio>
              <a className="download-link" href={audioUrl} download="qazaq-omnivoice.wav">
                <span aria-hidden="true">↓</span>
                下载 WAV
              </a>
            </div>
          ) : (
            <div className="empty-player">
              <div className="waveform" aria-hidden="true">
                {[18, 30, 42, 24, 51, 34, 62, 38, 55, 28, 46, 22, 36, 54, 31, 44, 25, 34].map(
                  (height, index) => <i style={{ height }} key={`${height}-${index}`} />,
                )}
              </div>
              <p>{isGenerating ? "Edge 预览可先试听，OmniVoice 最终版会在这里自动出现" : "相同文本与参数若已缓存，会直接在这里秒开"}</p>
            </div>
          )}
        </div>
      </section>
    </section>
  );
}
