# M3 V11 signal integrity, 2026-10-08

This is a safety and diagnostic repair, not a claim that Gemini reliably recites a complete 13-story program. It does not change the transcript prompting, model, selected voice, sample rate, tempo or single-request policy.

## Reproduced failure

The supplied 24 kHz mono PCM16 WAV contains 32,772,480 PCM bytes / 682.76 seconds. PCM SHA-256: `75190b6617d7539f856f14a057dbe06b623d43d87a1917d829a8d69d438a6be4`. The private audio is not committed.

Independent full-band STFT/Welch analysis found 523.8 seconds with less than 0.5% speech-band energy. Six principal intervals:

| Start–end (seconds) | Length | 80–4000 Hz energy | Wideband RMS |
| --- | ---: | ---: | ---: |
| 1.44–62.32 | 60.88 s | 0.0387% | -45.65 dBFS |
| 121.72–308.68 | 186.96 s | 0.0174% | -43.89 dBFS |
| 339.24–548.44 | 209.20 s | 0.0072% | -34.19 dBFS |
| 591.60–606.32 | 14.72 s | 0.0466% | -43.71 dBFS |
| 614.44–630.32 | 15.88 s | 0.0026% | -35.34 dBFS |
| 646.52–675.84 | 29.32 s | 0.0043% | -37.89 dBFS |

This is predominantly high-frequency signal, not digital silence and not evidence of recoverable quiet speech. Gain alone cannot restore missing speech-band information. Uncertain material is retained, not deleted. The boundaries are detector estimates (20–40 ms frames), not word alignments. No identical aligned one-second PCM blocks were found; this does not prove the absence of all unaligned duplication or repeated words.

The exact V10 implementation reported 629.8 active seconds, a longest inactive run of only 2.6 seconds, zero silence cuts, and no drift rejection. Its anchor had only four voiced frames; subsequent comparisons were inconclusive. The wideband energy threshold admitted high-frequency noise, and every-fourth-sample analysis could alias it. Raw live PCM was queued before validation.

## Changes

- One full-resolution energy/peak scan with analysis-only 80 Hz high-pass / fourth-order 3.8 kHz low-pass, zero crossings, 20 ms frames, one-second relative-level statistics and contiguous-interval analysis. No analysis filter is applied to delivered samples.
- Prolonged high-frequency-only or unresolved extremely low signals fail explicitly. Original PCM and bounded diagnostics remain downloadable. Received duration and activity estimates never prove complete recitation.
- Only quantization-floor digital silence can be shortened, preserving at least 680 ms and boundary context. Quiet speech and uncertain noise are not silence cuts.
- Conservative sustained-speech scalar gain plans require spectral and temporal evidence, use measured peak headroom, limit gain to 24 dB, and use 100 ms cosine ramps. No pitch, EQ, resampling or time changes. Stationary/uncertain low signals are not boosted.
- Strict Base64, PCM/WAV format, terminal-event and duplicate/cumulative/overlap checks. Google documents SSE audio as little-endian PCM deltas; suspect repetition is rejected rather than guessed away.
- SHA-256 before/after processing; sequence, byte offset, per-packet and aggregate CRC32 between Worker and browser; identical byte-coordinate edit plans on both. Bounded chunk hash trace, never text/key/audio in logs.
- Preview collects at least two seconds across tiny SSE packets before checking, pauses on anomalies, and schedules an eight-second Web Audio horizon. Blob slices avoid two full PCM/WAV copies. Error paths stop playback and retain an explicitly unvalidated diagnostic WAV.
- Quiet phonation is no longer discarded by the old pitch detector's 0.008 amplitude gate. A weak opening anchor can be replaced by a later voiced window. This remains an acoustic heuristic, not biometric identity/age verification.

## Real API evidence before deployment

Exactly one request per model, Puck, 1.00x, the same 79-character Kazakh test. No retries or model fallback.

- Flash returned 70.36 seconds of pre-processing PCM. First client audio: 12.26 s; total client time: 24.72 s. V10 then cut 60.96 seconds using the old threshold. The candidate retains and rejects the unresolved roughly 58-second low-level interval. The raw PCM is already abnormal before site post-processing.
- Flash-Lite returned 655.32 seconds of pre-processing PCM and ended with `MAX_TOKENS`; first client audio: 12.10 s; total: 102.14 s. It did not complete the tiny script. This is an observed output-limit failure, not a reason to silently retry, split or switch models.

These new samples establish abnormality in the decoded upstream signal path, but cannot retrospectively prove the origin of every sample in the user's earlier WAV. Its exact original manuscript/model/voice were not available. No claim of complete listening or word-level acceptance is made.

## Verification

`npm run test:m3` exercises transport, retained quiet speech, scalar restoration, noise protection, leading/trailing digital silence, terminal events, UI assembly and preview guards. Run the private real-file regression with `M3_FAULT_WAV=/absolute/path/to/file.wav npm run test:m3` (no upload). `npm test` includes the production build and existing Edge/globe regressions.

`node scripts/m3-capture.mjs short|long [model] [unique-run-name]` makes exactly one new request and writes the raw WAV, manifest and bounded console status under ignored `work/m3/v11`. It refuses to reuse an already-requested name. It does not use the obsolete multi-request modes in `m3-evaluate.mjs`.

Automatic transcription was stopped after automatic approval review blocked unexpected Microsoft telemetry from an analysis dependency. That dependency and its script are not deployed. Full transcript and perceived voice consistency remain separate, unpassed acceptance gates. Runtime TypeScript checking also exposes pre-existing errors outside this M3 change; targeted M3 checking/lint and the actual production build are tracked separately.

References: https://ai.google.dev/gemini-api/docs/generate-content/speech-generation (streaming PCM format and supported pause tags).
