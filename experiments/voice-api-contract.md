# Gemini Voices API contract verification (2026-11-05)

Official sources:
- https://ai.google.dev/api/voices
- https://ai.google.dev/gemini-api/docs/speech-generation
- https://ai.google.dev/api/generate-content

## Verified API behavior
- `GET https://generativelanguage.googleapis.com/v1beta/voices` lists existing voices.
- `POST https://generativelanguage.googleapis.com/v1beta/voices` creates a voice.
- For a prompted/design voice, `store: true` is required.
- `voice.type: "prompted"` and `voice.prompted.input` specify a natural-language design.
- `voice.prompted.base_voice` can optionally select a prebuilt or stored base voice for remixing.
- Stored voices receive `voice_...` IDs and can be selected using `speech_config.voice_config.voice`.
- Both Gemini 3.8 Flash TTS and Flash-Lite TTS support custom designed voices.
- Stateful stored voices have a one-year inactivity TTL and a 200-voice project limit.
- API availability, pricing and Kazakh performance remain unverified for this project.

## Suggested isolated experiment (not executed)
1. List voices with the existing project credential, **read-only**, after verifying permissions.
2. Pick the existing production baseline voice and design a remixed version with a single narrow prompt describing stable Kazakh male news narration.
3. Review the request and price before any POST.
4. Store only one new voice; save its ID securely as an experiment setting, not in Git.
5. Produce matched baseline/remix audio for one identical complete Kazakh manuscript.
6. Compare F0, MFCC, loudness and human perception, with special attention to later sections.
7. Do not enable remixed voice on production until real audio passes listening review.

## Caveats
A stored voice ID provides persistent voice identity, **not proof** of eliminating long-form drift. No live API calls or paid generation were performed in preparing this document.
