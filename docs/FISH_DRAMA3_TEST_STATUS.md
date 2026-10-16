# Fish Audio Drama 3 independent test

## Current authorized scope — 2026-10-16

Continue the existing independent experiment; preserve its completed 194 passing checks and two pre-existing skips as historical evidence. The user explicitly authorizes necessary GitHub commits and Cloudflare Workers deployment.

- Generate exactly two complete Kazakh news recordings using `model: drama-3` only. S2.1 Pro testing and control audio are canceled; the independent endpoint now rejects all other models before any provider call.
- Reuse the repository's complete `tests/fixtures/m3-real-13-news.txt` (6,335 characters, thirteen items with opening and closing). This is a source-backed archive-news test, not current news; sources remain in `tests/fixtures/m3-real-13-sources.json`.
- Reuse the existing 16.680-second Daulet reference from workflow `38808897856`, without an Edge synthesis request. SHA256: `ebe7fff6777cb6e6a65faebc0f523cfb2490cc5ea7a0e7eece26a2ba8f06a892`. Its exact 232-character transcript is checked before synthesis. The existing artifact expires on 2026-10-29; do not regenerate a substitute if retrieval fails.
- Retain the original 48.864-second `original.wav` as the listening baseline, unchanged. SHA256: `755912db66392fa6e3c2313b5fa70150a46bdc61c1893f7bb2d672e7942a5f0d`; PCM 24 kHz mono. Its previously identified defect is around 39.35 seconds. Its full transcript is unavailable, so timbre/fry comparison with this recording is not a same-text comparison.
- Both Drama 3 takes use identical full text, reference bytes, `temperature=0.7`, `top_p=0.7`, `sample_rate=24000`, `chunk_length=300`, `condition_on_previous_chunks=true`, normal latency and no post-processing. The independent endpoint allows up to 8,000 text characters, with a bounded ten-minute provider timeout for long-form output.
- No model fallback or provider retries. Explicit local authorization failures before any provider call may retry. On a provider error, record it and mark the second take blocked instead of sending duplicate failed requests. Confirm the upstream model independently only if Fish actually returns that header.

## Credentials and deployment isolation

The independent workflow uses the existing server-side `FISH_AUDIO_API_KEY` without exporting it. A random masked operator token in `FISH_DRAMA3_RUN_TOKEN` expires in fifteen minutes and is removed after the run. Existing Fish PIN, default voice modes, UI and other providers remain untouched. A protected, read-only wallet check returns only whether positive API credit is available, never balances, account IDs or wallet history.

The `Fish Drama 3 independent test` workflow runs manually or after successful production CI for a commit containing `[Drama3 test]`. Outputs include two original WAV files if synthesis succeeds, the reused reference, complete text, `report.json` and signal diagnostics. Pronunciation accuracy, throat texture, vocal fry, timbre, prosody, long-text stability and word-for-word completeness require actual audio review. Signal metrics alone cannot establish these outcomes.

## Actual execution history

| Run | Verified result |
| --- | --- |
| `38558897751` | Initial readiness failure; zero Fish TTS calls and no reference generated. Temporary token removed. |
| `38808897856` | Existing Daulet reference saved. First generation POST rejected locally before any Fish request; temporary token removed. |
| `38809838401` | Authenticated POST preflight succeeded; actual Drama 3 request reached Fish and returned HTTP 402. No Drama 3 audio and no S2.1 API call. Temporary token removed. |

V4 narrows the experiment to Drama 3, reuses saved reference bytes, sends the complete existing news script and adds private credit-availability diagnosis. Its actual outcome must be appended after deployment and execution; no successful audio or listening result is claimed by code readiness.

Official interfaces: https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech and https://docs.fish.audio/api-reference/endpoint/wallet/get-api-credit.
