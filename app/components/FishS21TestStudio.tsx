"use client";
import { useEffect, useState } from "react";

export default function FishS21TestStudio({ sourceText }: { sourceText: string }) {
  const [pin, setPin] = useState("");
  const [referenceId, setReferenceId] = useState("");
  const [busy, setBusy] = useState(false);
  const [testText, setTestText] = useState("Сәлем тораптастар, баршаңызға қайырлы таң. Бүгінгі маңызды жаңалықтарға назар аударайық. Бірінші. Елімізде жаңа технологиялар дамып келеді. Екінші. Тәңіртау баурайында күзгі сайахат маусымы жалғасуда.");
  const [useOwnText, setUseOwnText] = useState(true);
  const [error, setError] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  useEffect(() => () => { if (audioUrl) URL.revokeObjectURL(audioUrl); }, [audioUrl]);
  async function generate() {
    if (busy) return;
    setError(""); setBusy(true);
    try {
      const response = await fetch("/api/fish-s21-test", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: (useOwnText ? testText : sourceText).slice(0, 1200), pin, referenceId }),
      });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || "生成失败"); }
      const blob = await response.blob();
      if (!blob.size) throw new Error("音频为空");
      setAudioUrl(URL.createObjectURL(blob));
    } catch (e) { setError(e instanceof Error ? e.message : "生成失败"); }
    finally { setBusy(false); }
  }
  return <section aria-label="Fish S2.1 Pro 独立测试模式" style={{ margin: "2rem auto", padding: "1.5rem", maxWidth: 920, border: "1px solid #64748b", borderRadius: 18 }}>
    <h2>Fish S2.1 Pro · 独立测试模式</h2>
    <p>实验功能：仅取当前文稿前 1200 字符，不影响 Edge Дәулет、M2、M3 或 ElevenLabs。哈萨克语实际质量需要试听验证。</p>
    <p>建议先用下方固定短文进行 A/B 对比：同一段文本分别使用默认声线和你已确认有哈萨克语表现的声线。不要将夸张语气误判为语言支持良好。</p>
    <label style={{ display: "block", marginBottom: 12 }}><input type="checkbox" checked={useOwnText} onChange={e => setUseOwnText(e.target.checked)} /> 使用独立哈萨克语测试短文（取消则使用主文稿前 1200 字符）</label>
    {useOwnText && <label style={{ display: "block", marginBottom: 12 }}>测试文本<textarea value={testText} maxLength={1200} onChange={e => setTestText(e.target.value)} rows={5} style={{ display: "block", width: "100%", boxSizing: "border-box" }} /><small>{testText.length}/1200 字符</small></label>}
    <label style={{ display: "block", marginBottom: 12 }}>测试访问密码 <input type="password" autoComplete="off" value={pin} onChange={e => setPin(e.target.value)} /></label>
    <label style={{ display: "block", marginBottom: 12 }}>Fish 声线 ID（可选；默认声线可能不适合哈萨克语） <input value={referenceId} onChange={e => setReferenceId(e.target.value)} placeholder="已有的 Fish 声线 ID" /></label>
    <button type="button" onClick={generate} disabled={busy || !(useOwnText ? testText : sourceText).trim() || !pin}>{busy ? "正在生成…" : "生成 Fish 测试音频"}</button>
    {error && <p role="alert">{error}</p>}
    {audioUrl && <div style={{ marginTop: 16 }}><audio controls src={audioUrl} /><a href={audioUrl} download="fish-s21-test.mp3" style={{ marginLeft: 12 }}>下载 MP3</a></div>}
  </section>;
}
