from pathlib import Path

page_path = Path('app/page.tsx')
page = page_path.read_text()

anchor = '''  useEffect(() => {\n    return () => {\n      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);\n    };\n  }, []);\n'''

insert = '''  useEffect(() => {\n    return () => {\n      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);\n    };\n  }, []);\n\n  useEffect(() => {\n    const cleanText = text.trim();\n\n    if (engine !== "edge" || preset !== "expressive" || !cleanText) {\n      setEmotionAnalysisStatus("idle");\n      setEmotionSentenceCount(0);\n      return;\n    }\n\n    const controller = new AbortController();\n    let active = true;\n    setEmotionAnalysisStatus("idle");\n    setEmotionSentenceCount(0);\n\n    const timer = window.setTimeout(async () => {\n      if (!active) return;\n      setEmotionAnalysisStatus("analyzing");\n\n      try {\n        const response = await fetch("/api/edge-emotion-analysis", {\n          method: "POST",\n          headers: { "Content-Type": "application/json" },\n          body: JSON.stringify({ text: cleanText }),\n          signal: controller.signal,\n        });\n        const payload = (await response.json().catch(() => null)) as\n          | { status?: string; sentenceCount?: number }\n          | null;\n\n        if (!active) return;\n        if (!response.ok || payload?.status !== "completed") {\n          setEmotionAnalysisStatus("failed");\n          setEmotionSentenceCount(0);\n          return;\n        }\n\n        setEmotionSentenceCount(\n          typeof payload.sentenceCount === "number" ? payload.sentenceCount : 0,\n        );\n        setEmotionAnalysisStatus("completed");\n      } catch (caught) {\n        if (!active || (caught instanceof DOMException && caught.name === "AbortError")) return;\n        setEmotionAnalysisStatus("failed");\n        setEmotionSentenceCount(0);\n      }\n    }, 800);\n\n    return () => {\n      active = false;\n      window.clearTimeout(timer);\n      controller.abort();\n    };\n  }, [text, engine, preset]);\n'''

assert anchor in page, 'cleanup effect anchor not found'
page = page.replace(anchor, insert, 1)
page = page.replace('"等待全文情绪分析"', '"等待输入完成后自动分析"', 1)

page_path.write_text(page)
print('added debounced automatic emotion analysis status to text box')
