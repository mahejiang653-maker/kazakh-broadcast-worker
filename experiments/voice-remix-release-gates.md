# M3 Voice Remix experiment — go/no-go gate

This experiment is isolated from production. Do not merge or deploy this branch without an explicit release decision.

## Phase A — no-cost checks
- Run `node --test tests/m3-voices-preflight.test.mjs tests/m3-voice-ab-plan.test.mjs`.
- Run `node experiments/m3-voices-preflight.mjs` for a dry run.
- Confirm the current Google API contract against the official documentation at https://ai.google.dev/api/voices. If the API differs, stop and update the client/tests.
- A GitHub Actions workflow file existing is not proof that GitHub Actions ran. Verify a completed successful job.

## Phase B — read-only live check
Only after the project owner confirms access to a suitable test environment:
- Run `GEMINI_API_KEY=... node experiments/m3-voices-preflight.mjs --live` **locally** (never paste the key into chat, logs or a commit).
- This invokes GET /v1beta/voices only, not voice creation or speech synthesis.
- HTTP 403: check permissions and project access. HTTP 404: check API version/availability. HTTP 429: stop and check quotas.
- Do not add a public endpoint that proxies this credential.

## Phase C — paid, opt-in evaluation
Require separate explicit approval for creating one stored voice and synthesizing two long Kazakh recordings. Check actual model compatibility, supported language, quotas and pricing before starting. No automatic retry of billable requests. Keep the existing production voice untouched.

## Decision rule
A custom voice ID is not evidence of long-form voice stability. Evaluate complete recordings, particularly later paragraphs, against the same baseline text. Record F0, MFCC, loudness, omissions, intelligibility, human listening notes, and total cost. Stop if the remixed voice worsens pronunciation or increases drift.
