# Fish Audio Drama 3 independent test

This experiment uses the existing Fish API credential in the production Worker. It does not change the Edge, M2, M3, ElevenLabs or existing Fish S2.1 defaults or UI.

## Protocol

- Original prior Daulet sample recovered: `original.wav`, 48.864 seconds, PCM 24 kHz mono. Its previously identified defect is around 39.35 seconds. That recording is retained for the prior local-repair comparison.
- Generate a fresh short `kk-KZ-DauletNeural` reference with a known exact transcript, rather than clone an uncertain transcript or the defective region.
- Generate exactly three short samples: Drama 3 take 1, Drama 3 take 2, S2.1 Pro free-tier control.
- Use the same text and reference bytes in all three requests, with `temperature=0.7`, `top_p=0.7`, `sample_rate=24000`, `chunk_length=300`, `condition_on_previous_chunks=true` and normal latency. Do not post-process the generated audio.
- The text is a pronunciation and numbering fixture, not a report of current news. It includes the user's Xinjiang Kazakh terminology.
- The upstream `model` header is explicit and allowlisted. No fallback or automatic retry is implemented. Record an upstream model confirmation only if the provider actually returns it.
- The S2.1 free tier uses the same model but a different service tier; one run does not justify performance conclusions.

## Execution and credentials

The `Fish Drama 3 independent test` workflow runs manually or after successful production CI for a commit containing `[Drama3 test]`. It installs a random, masked, 15-minute operator token in `FISH_DRAMA3_RUN_TOKEN` and removes it after the run. The existing `FISH_AUDIO_API_KEY` and `FISH_AUDIO_ACCESS_PIN` are never exported or changed. The endpoint is inaccessible without the temporary token.

Outputs are a Daulet reference, three WAV files, exact transcripts, a request manifest and `report.json`. Generation status and basic signal diagnostics are recorded separately from listening judgments. Pronunciation, vocal fry, same-speaker identity and tone/age stability require listening review.

## Verified starting point

- Source base: `4fd757a11466e0de4d60bb4516df244176d188f1`.
- Production `/api/fish-s21-status` returned `keyConfigured=true`, `pinConfigured=true` on 2026-10-14.
- Existing S2.1 route hardcodes `s2.1-pro-free` and cannot test Drama 3.
- Drama 3 generation results are pending the independent workflow; no quality outcome is claimed here.
- The initial workflow `38558897751` stopped at its immediate readiness check before generating a reference or sending any Fish request. Its temporary token was removed successfully. V2 records non-secret readiness diagnostics and waits for the freshly published binding using read-only status calls; audio requests are still never automatically retried.

Official interfaces: https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech and https://beta.fish.audio/zh-CN/blog/fish-audio-drama-3/.
