# M3 Voice Remixing A/B experiment (isolated)

Status: preparation only. This branch is not deployed. No paid API calls have been made.

## Baseline
- Existing M3: one complete Kazakh manuscript per synthesis request.
- Existing pitch (F0), MFCC, loudness and voice timeline diagnostics.
- Do not change production voices, styles, retry behavior or Cloudflare secrets.

## Experiment
1. Confirm the exact Voice Remixing request schema against https://ai.google.dev/gemini-api/docs/voice-remixing before writing any integration.
2. Create one remixed voice from the same prebuilt voice as the baseline, using a paid Gemini project only after explicit approval.
3. Keep manuscript, model, speed, style, transport and text preprocessing identical.
4. Generate five takes per arm: baseline and remixed voice. Optional third arm: voice design.
5. Compare within-take acoustic drift in successive windows, especially around 120 seconds, and between-take consistency. Use F0, MFCC, loudness, plus blinded human listening. Check missing words and pronunciation separately.
6. Report absolute metrics, variance, failed generations, API costs, and limitations. Never equate persistent voice ID with proven drift elimination.

## Safety gates
- No API keys in code, commits, output logs, or browser storage.
- Do not deploy from this branch or alter production without review.
- Cap test generation requests and require explicit invocation.
- Do not infer success from synthetic unit-test audio; use actual Kazakh recordings.
