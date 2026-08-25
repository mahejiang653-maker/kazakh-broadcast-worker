# KazakhTTS OmniVoice integration

The website includes a second free TTS studio backed by the public Hugging Face Space `shyngys879/KazakhTTS-OmniVoice-Demo`.

Features exposed in the UI:

- Kazakh language synthesis
- Voice Design: gender, age, pitch, whisper style
- Speed 0.70x–1.20x
- Inference steps and guidance scale
- Denoise toggle
- Sentence-ending Chinese performance tags such as `[开心]`, `[悲伤]`, `[严肃]`, `[慢速]`
- Browser playback and WAV download

The public Space is a shared GPU service and may cold-start or queue. Edge TTS remains the recommended free mode for long scripts.
