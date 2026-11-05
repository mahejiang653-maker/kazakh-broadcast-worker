import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { randomBytes, publicEncrypt, constants } from 'node:crypto';
import { runRemixComparison } from './m3-remix-runner.mjs';
import { encryptWav } from './m3-remix-encryption.mjs';

const temp = process.env.RUNNER_TEMP;
if (!temp) throw new Error('RUNNER_TEMP_MISSING');
const output = `${temp}/m3-encrypted-output`;
const [token, text, publicKey] = await Promise.all([
  readFile(`${temp}/m3-probe-token`, 'utf8'),
  readFile('tests/fixtures/m3-remix-eval-10news.txt', 'utf8'),
  readFile('experiments/m3-delivery-public.pem'),
]);
const password = randomBytes(32).toString('base64url');
const wrapped = publicEncrypt({ key: publicKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(password));
encryptWav(Buffer.from('RIFFx'), password);
await mkdir(output, { recursive: true, mode: 0o700 });
await writeFile(`${output}/key.enc`, wrapped, { mode: 0o600 });
const metadata = { outcome: 'started', takes: {}, noContentVerification: true };
const save = async () => writeFile(`${output}/metadata.json`, JSON.stringify(metadata, null, 2), { mode: 0o600 });
try {
  const pair = await runRemixComparison({ text, token: token.trim(), onTake: async (name, take) => {
    await writeFile(`${output}/${name}.m3enc`, encryptWav(take.wav, password), { mode: 0o600 });
    metadata.takes[name] = { seconds: take.seconds, sha256: take.sha256, chunks: take.chunks };
    await save();
  } });
  metadata.outcome = 'complete';
  metadata.calls = pair.calls;
  metadata.creationUsage = pair.creationUsage;
  await save();
  console.log(JSON.stringify(metadata));
} catch (e) {
  const allowed = new Set(['INVALID_INPUT','REQUEST_OUTCOME_UNKNOWN','REQUEST_FAILED','CREATION_RESULT_INVALID','INVALID_AUDIO_STREAM','INVALID_STREAM','INVALID_STREAM_JSON','UPSTREAM_STREAM_ERROR','AUDIO_AFTER_STOP','INVALID_BASE64','AUDIO_FORMAT_MISMATCH','AUDIO_SIZE_LIMIT','REPEATED_AUDIO','CUMULATIVE_AUDIO','OVERLAPPING_AUDIO','INCOMPLETE_AUDIO','DUPLICATE_STOP','FRAME_SIZE_LIMIT','STREAM_INTERRUPTED','NO_AUDIO','SUSPICIOUSLY_SHORT_AUDIO']);
  metadata.outcome = 'failed';
  metadata.error = { code: allowed.has(e?.message) ? e.message : 'COMPARISON_FAILED', phase: ['create','baseline','remix'].includes(e?.phase) ? e.phase : 'local', calls: Number.isSafeInteger(e?.calls) ? e.calls : 0, voiceCreated: e?.voiceCreated === true, outcomeUnknown: e?.outcomeUnknown === true, ...(Number.isInteger(e?.status) ? { status: e.status } : {}) };
  await save();
  console.error(JSON.stringify(metadata));
  process.exitCode = 1;
}
