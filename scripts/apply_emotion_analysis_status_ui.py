from pathlib import Path

path = Path('app/page.tsx')
text = path.read_text()

text = text.replace(
    'type PresetId = (typeof PRESETS)[number]["id"];\n',
    'type PresetId = (typeof PRESETS)[number]["id"];\ntype EmotionAnalysisStatus = "idle" | "analyzing" | "completed" | "failed";\n',
    1,
)

state_anchor = '  const [generatedAt, setGeneratedAt] = useState("");\n'
assert state_anchor in text
text = text.replace(
    state_anchor,
    state_anchor + '  const [emotionAnalysisStatus, setEmotionAnalysisStatus] = useState<EmotionAnalysisStatus>("idle");\n  const [emotionSentenceCount, setEmotionSentenceCount] = useState(0);\n',
    1,
)

reset_anchor = '''  function resetAudio() {\n    if (audioUrlRef.current) {\n      URL.revokeObjectURL(audioUrlRef.current);\n      audioUrlRef.current = null;\n    }\n    setAudioUrl(null);\n    setGeneratedAt("");\n  }\n'''
assert reset_anchor in text
text = text.replace(
    reset_anchor,
    reset_anchor + '''\n  function resetEmotionAnalysis() {\n    setEmotionAnalysisStatus("idle");\n    setEmotionSentenceCount(0);\n  }\n''',
    1,
)

text = text.replace(
    '    setError("");\n    resetAudio();\n\n    if (nextEngine === "eleven"',
    '    setError("");\n    resetEmotionAnalysis();\n    resetAudio();\n\n    if (nextEngine === "eleven"',
    1,
)

generate_anchor = '''    setIsGenerating(true);\n    setError("");\n\n    try {\n      const response = await fetch("/api/synthesize", {\n'''
assert generate_anchor in text
text = text.replace(
    generate_anchor,
    '''    setIsGenerating(true);\n    setError("");\n\n    try {\n      const shouldAnalyzeEmotion = engine === "edge" && preset === "expressive";\n      if (shouldAnalyzeEmotion) {\n        setEmotionAnalysisStatus("analyzing");\n        setEmotionSentenceCount(0);\n\n        const analysisResponse = await fetch("/api/edge-emotion-analysis", {\n          method: "POST",\n          headers: { "Content-Type": "application/json" },\n          body: JSON.stringify({ text: cleanText }),\n        });\n        const analysisPayload = (await analysisResponse.json().catch(() => null)) as\n          | { status?: string; sentenceCount?: number; error?: string }\n          | null;\n\n        if (!analysisResponse.ok || analysisPayload?.status !== "completed") {\n          setEmotionAnalysisStatus("failed");\n          throw new Error(analysisPayload?.error || "情绪分析失败，请稍后重试。");\n        }\n\n        setEmotionSentenceCount(\n          typeof analysisPayload.sentenceCount === "number" ? analysisPayload.sentenceCount : 0,\n        );\n        setEmotionAnalysisStatus("completed");\n      } else {\n        resetEmotionAnalysis();\n      }\n\n      const response = await fetch("/api/synthesize", {\n''',
    1,
)

text_change_anchor = '''                onChange={(event) => {\n                  setText(event.target.value);\n                  if (error) setError("");\n                }}\n'''
assert text_change_anchor in text
text = text.replace(
    text_change_anchor,
    '''                onChange={(event) => {\n                  setText(event.target.value);\n                  resetEmotionAnalysis();\n                  if (error) setError("");\n                }}\n''',
    1,
)

footer_anchor = '''              <div className="textarea-footer" id="character-count">\n                <span>{wordCount ? `${wordCount} 个词 · ${formatDuration(estimatedDuration)}` : "等待输入"}</span>\n                <span className={text.length > MAX_CHARACTERS * 0.9 ? "near-limit" : ""}>\n                  {text.length.toLocaleString("zh-CN")} / {MAX_CHARACTERS.toLocaleString("zh-CN")}\n                </span>\n              </div>\n'''
assert footer_anchor in text
status_block = '''              {engine === "edge" && preset === "expressive" ? (\n                <div\n                  aria-live="polite"\n                  style={{\n                    display: "flex",\n                    alignItems: "center",\n                    gap: 8,\n                    padding: "10px 17px",\n                    borderTop: "1px solid var(--line)",\n                    fontSize: 12,\n                    fontWeight: 700,\n                    color:\n                      emotionAnalysisStatus === "completed"\n                        ? "var(--mint)"\n                        : emotionAnalysisStatus === "failed"\n                          ? "#b42318"\n                          : "var(--muted)",\n                  }}\n                >\n                  <span aria-hidden="true">\n                    {emotionAnalysisStatus === "completed"\n                      ? "✓"\n                      : emotionAnalysisStatus === "failed"\n                        ? "✕"\n                        : emotionAnalysisStatus === "analyzing"\n                          ? "◌"\n                          : "○"}\n                  </span>\n                  <span>\n                    {emotionAnalysisStatus === "completed"\n                      ? `情绪分析完成${emotionSentenceCount ? ` · 已分析 ${emotionSentenceCount} 句` : ""}`\n                      : emotionAnalysisStatus === "failed"\n                        ? "情绪分析失败"\n                        : emotionAnalysisStatus === "analyzing"\n                          ? "正在分析全文情绪…"\n                          : "等待全文情绪分析"}\n                  </span>\n                </div>\n              ) : null}\n'''
text = text.replace(footer_anchor, status_block + footer_anchor, 1)

preset_anchor = '''                      onClick={() => {\n                        setPreset(item.id);\n                        setError("");\n                        resetAudio();\n                      }}\n'''
assert preset_anchor in text
text = text.replace(
    preset_anchor,
    '''                      onClick={() => {\n                        setPreset(item.id);\n                        resetEmotionAnalysis();\n                        setError("");\n                        resetAudio();\n                      }}\n''',
    1,
)

clear_anchor = '''  function clearText() {\n    setText("");\n    setError("");\n    resetAudio();\n  }\n'''
assert clear_anchor in text
text = text.replace(
    clear_anchor,
    '''  function clearText() {\n    setText("");\n    setError("");\n    resetEmotionAnalysis();\n    resetAudio();\n  }\n''',
    1,
)

text = text.replace(
    '{ id: "expressive", label: "生动播报", note: "原生自然 · 轻度表现", rateFactor: 0.99 },',
    '{ id: "expressive", label: "生动播报", note: "全文情绪导演 · 自动分析", rateFactor: 0.99 },',
    1,
)

path.write_text(text)
print('emotion analysis status UI applied')
