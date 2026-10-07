# M3 continuous newsreader

The V4 route made sequential, independent Gemini requests at roughly 2400–3200 character boundaries. It did not always make 15 requests for 13 news items. Each request used the same selected voice, but restarted the performance. V4 had no acoustic comparison and did not check finish reasons or PCM format. Normal-speed requests had no style instruction. Long input also silently selected Flash.

V5 changes only M3:

- Count input tokens and prefer the complete program in one TTS request, subject to the documented 8192-input/16384-output limits and a conservative duration guard.
- If limits require segmentation, group introduction + 1–4, 5–9, 10–13 + closing. Split further at text boundaries only for length errors. Never change the selected model or voice to recover a failure.
- Use one constant `M3_STRICT_ANCHOR` in `speechMetadata.style`, one single-speaker `voiceConfig`, and constant temperature 0.5. People and quotations are narrator text. No multi-speaker configuration or text-dependent acting instructions.
- Preserve each ordinal's period and the supported `<short pause>` control. Instructions are never prepended to spoken text.
- Compare F0 median/range, voiced RMS, spectral centroid and MFCC statistics against the beginning. Screen sliding windows inside a continuous take too. Sustained abnormalities block output and trigger at most two identical retries. This is a conservative acoustic heuristic, **not** a biometric speaker verifier; normal phonetic differences can still affect it.
- Validate 24 kHz mono PCM16 before joining. Add only missing short boundary silence. Grouped output can receive at most 3 dB scalar gain adjustment, limited by peak headroom. No pitch shift, resampling or EQ.
- Execute M3 in a Cloudflare Durable Object with the official EU jurisdiction restriction. Call only Google's standard `generativelanguage.googleapis.com` endpoint. No proxy or restriction bypass. Status reports an observed diagnostic location separately from Google's actual API acceptance.
- Return distinct region, permissions, quota, length, cancellation and drift errors. Stop on a quota/region rejection; do not rotate keys/models/voices. Preserve safe quota metric/retry-delay details where Google supplies them.

The original site is Cloudflare-hosted, despite the task mentioning Railway. Other API routes, M2 headers, UI controls, cache, download and player remain on the existing path.

## Reproducible acceptance runs

`npm run test:m3` tests real pipeline behavior with controlled upstream responses: whole-script generation, large groups, discarded drift, identical retries, quota/region failure, format rejection, silence, bounded gain and preserved pauses. `npm test` also runs the existing project regression suite.

`node scripts/m3-evaluate.mjs baseline|A|B|C` uses the existing live M3 endpoint, Puck, Flash and 1.00×. The fixture is a complete 6335-character Kazakh program containing 13 **historical real news stories**, with dates and official sources in `tests/fixtures/m3-real-13-sources.json`. It is not a current-day news edition or a fictional demonstration.

- `baseline`: unchanged V4's normal full-program route (record before deployment).
- `A`: complete program, V5 (verify actual request count from headers).
- `B`: introduction + 1–4 / 5–9 / 10–13 + closing, identical V5 configuration.
- `C`: introduction / 13 separate news / closing, identical V5 configuration, 15 HTTP calls.

Audio, request records and acoustic analysis are saved locally under ignored `work/m3/qa`. `analyze` re-analyzes completed recordings without another API call. Exact news boundaries require transcript alignment; sliding-window metrics alone must not be reported as a complete listening acceptance. A/B/C are not sufficient to isolate temperature's individual effect.

At the first pre-deployment full-program run, V4 returned HTTP 502 with its generic Gemini quota/rate-limit message. Full audio acceptance was pending at that point. Do not interpret mocked regression tests as successful real audio validation.

## API references

- https://ai.google.dev/gemini-api/docs/speech-generation
- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-tts
- https://ai.google.dev/gemini-api/docs/available-regions
- https://developers.cloudflare.com/durable-objects/reference/data-location/
