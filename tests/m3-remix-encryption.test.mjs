import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";

let encryption = {};
try { encryption = await import("../experiments/m3-remix-encryption.mjs"); }
catch (error) { if (error.code !== "ERR_MODULE_NOT_FOUND") throw error; }

async function browserDecrypt(data, password) {
  const raw = new Uint8Array(data);
  assert.equal(new TextDecoder().decode(raw.slice(0, 8)), "M3EVAL01");
  const source = await webcrypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]);
  const key = await webcrypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: raw.slice(8, 24), iterations: 310000 }, source, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  return Buffer.from(await webcrypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(24, 36), tagLength: 128 }, key, raw.slice(36)));
}
test("encrypted WAV is readable by browser WebCrypto and hides original bytes", async () => {
  assert.equal(typeof encryption.encryptWav, "function");
  const wav = Buffer.concat([Buffer.from("RIFF"), Buffer.from("sensitive waveform bytes")]);
  const password = "example test password of 32 chars";
  const one = encryption.encryptWav(wav, password);
  const two = encryption.encryptWav(wav, password);
  assert.equal(one.includes(wav), false);
  assert.notDeepEqual(one, two);
  assert.deepEqual(await browserDecrypt(one, password), wav);
  await assert.rejects(() => browserDecrypt(one, "wrong password of 32 characters"));
  const tampered = Buffer.from(one); tampered[tampered.length - 1] ^= 1;
  await assert.rejects(() => browserDecrypt(tampered, password));
});
test("short passwords and non-WAV content fail before any output", () => {
  assert.equal(typeof encryption.encryptWav, "function");
  assert.throws(() => encryption.encryptWav(Buffer.from("RIFFpayload"), "short"));
  assert.throws(() => encryption.encryptWav(Buffer.from("not wav"), "long enough example password 2026"));
});
