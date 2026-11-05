import { randomBytes, pbkdf2Sync, createCipheriv } from "node:crypto";

/** Encrypt one WAV in memory; only the encrypted bytes may be uploaded as an artifact. */
export function encryptWav(wav, password) {
  if (!Buffer.isBuffer(wav) || wav.length < 5 || wav.toString("ascii", 0, 4) !== "RIFF") throw new Error("INVALID_WAV");
  if (typeof password !== "string" || password.length < 20) throw new Error("AUDIO_PASSWORD_TOO_SHORT");
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = pbkdf2Sync(password, salt, 310000, 32, "sha256");
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(wav), cipher.final()]);
  key.fill(0);
  return Buffer.concat([Buffer.from("M3EVAL01", "ascii"), salt, iv, ciphertext, cipher.getAuthTag()]);
}
