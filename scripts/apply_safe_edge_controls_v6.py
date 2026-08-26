from pathlib import Path

path = Path('app/page.tsx')
text = path.read_text()

# 1. Add a guarded range control. Track taps are ignored; users must start
# dragging near the thumb. Keyboard access remains available.
anchor = '''function signed(value: number, suffix = "%") {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}${suffix}`;
}
'''
addition = r'''

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
'''
assert anchor in text, 'signed() anchor not found'
text = text.replace(anchor, anchor + addition, 1)

# 2. Keep existing generated audio when settings are adjusted.
state_anchor = '  const [generatedAt, setGeneratedAt] = useState("");\n'
state_addition = '  const [audioSettingsDirty, setAudioSettingsDirty] = useState(false);\n'
assert state_anchor in text, 'generatedAt state anchor not found'
text = text.replace(state_anchor, state_anchor + state_addition, 1)

reset_anchor = '''  function resetAudio() {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    setAudioUrl(null);
    setGeneratedAt("");
  }
'''
reset_replacement = '''  function resetAudio() {
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
'''
assert reset_anchor in text, 'resetAudio anchor not found'
text = text.replace(reset_anchor, reset_replacement, 1)

success_anchor = '''      audioUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      setGeneratedAt(
'''
success_replacement = '''      audioUrlRef.current = nextUrl;
      setAudioUrl(nextUrl);
      setAudioSettingsDirty(false);
      setGeneratedAt(
'''
assert success_anchor in text, 'generation success anchor not found'
text = text.replace(success_anchor, success_replacement, 1)

# 3. Speed slider: guarded drag and no destructive clearing of old audio.
old_speed = '''          <input
            aria-label={`${label}倍速`}
            type="range"
            min="0.7"
            max="1.2"
            step="0.01"
            value={speed}
            onChange={(event) => {
              setSpeed(Number(event.target.value));
              resetAudio();
            }}
            style={{ width: "100%", accentColor: "var(--mint)" }}
          />
'''
new_speed = '''          <SafeRange
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
'''
assert old_speed in text, 'speed range anchor not found'
text = text.replace(old_speed, new_speed, 1)

speed_button_old = '''              onClick={() => {
                setSpeed(item);
                resetAudio();
              }}
'''
speed_button_new = '''              onClick={() => {
                setSpeed(item);
                markAudioSettingsDirty();
              }}
'''
assert speed_button_old in text, 'speed preset anchor not found'
text = text.replace(speed_button_old, speed_button_new, 1)

speed_footer_old = '''        <div className="textarea-footer" style={{ margin: "12px -17px -12px" }}>
          <span>精细步进 0.01×</span>
          <span>0.70× – 1.20×</span>
        </div>
'''
speed_footer_new = '''        <small style={{ display: "block", marginTop: 10 }}>
          防误触：请按住圆形滑块再拖动；轻点滑轨不会改变参数。
        </small>
        <div className="textarea-footer" style={{ margin: "12px -17px -12px" }}>
          <span>精细步进 0.01×</span>
          <span>0.70× – 1.20×</span>
        </div>
'''
assert speed_footer_old in text, 'speed footer anchor not found'
text = text.replace(speed_footer_old, speed_footer_new, 1)

# 4. Edge pitch / volume ranges get the same protection.
old_pitch = '''                    <input
                      aria-label="Edge TTS 音调"
                      type="range"
                      min="-20"
                      max="20"
                      step="1"
                      value={edgePitch}
                      onChange={(event) => {
                        setEdgePitch(Number(event.target.value));
                        resetAudio();
                      }}
                      style={{ width: "100%", accentColor: "var(--mint)" }}
                    />
'''
new_pitch = '''                    <SafeRange
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
'''
assert old_pitch in text, 'pitch range anchor not found'
text = text.replace(old_pitch, new_pitch, 1)

old_volume = '''                    <input
                      aria-label="Edge TTS 音量"
                      type="range"
                      min="-8"
                      max="8"
                      step="0.5"
                      value={edgeVolume}
                      onChange={(event) => {
                        setEdgeVolume(Number(event.target.value));
                        resetAudio();
                      }}
                      style={{ width: "100%", accentColor: "var(--mint)" }}
                    />
'''
new_volume = '''                    <SafeRange
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
'''
assert old_volume in text, 'volume range anchor not found'
text = text.replace(old_volume, new_volume, 1)

edge_footer_old = '''                  <div className="textarea-footer" style={{ margin: "12px -17px -12px" }}>
                    <span>Edge SSML 实时调整</span>
                    <span>无需 ElevenLabs 额度</span>
                  </div>
'''
edge_footer_new = '''                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10 }}>
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
'''
assert edge_footer_old in text, 'Edge footer anchor not found'
text = text.replace(edge_footer_old, edge_footer_new, 1)

# 5. Show that current audio is still the previous render after a setting edit.
result_anchor = '''            <div className="result-topline">
              <div>
                <span className="result-dot" />
                <strong>{audioUrl ? "音频已生成" : "音频播放器"}</strong>
              </div>
              {generatedAt ? <time>{generatedAt}</time> : <span>等待生成</span>}
            </div>

            {audioUrl ? (
'''
result_replacement = '''            <div className="result-topline">
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
'''
assert result_anchor in text, 'result panel anchor not found'
text = text.replace(result_anchor, result_replacement, 1)

path.write_text(text)
print('applied guarded sliders and non-destructive audio settings updates')
