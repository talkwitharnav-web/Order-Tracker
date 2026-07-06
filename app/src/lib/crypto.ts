import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { readFileSync, appendFileSync, existsSync } from "fs";
import path from "path";
import { logger } from "@/lib/logger";

/**
 * Encrypts/decrypts data-at-rest fields (currently: a soft-deleted
 * restaurant's `name` column) so a deleted restaurant's plaintext name no
 * longer exists anywhere in the DB — freeing it up for a new registration to
 * reuse immediately, while still being reversible (Undelete) for admins.
 *
 * This is NOT session signing (see session.ts's SESSION_SECRET, a separate
 * HMAC key for a separate purpose — don't conflate the two secrets even
 * though the "auto-generate and persist to .env.local if missing" pattern is
 * shared). AES-256-GCM: authenticated encryption, so a tampered ciphertext
 * fails to decrypt loudly instead of silently returning garbage.
 */

const ENV_KEY_NAME = "DATA_ENCRYPTION_KEY";
const ENV_FILE = path.join(process.cwd(), ".env.local");

function loadOrCreateKey(): Buffer {
  const fromEnv = process.env[ENV_KEY_NAME];
  if (fromEnv) {
    const buf = Buffer.from(fromEnv, "base64");
    if (buf.length === 32) return buf;
    logger.warn(`${ENV_KEY_NAME} is set but is not a valid 32-byte base64 key — generating a new one instead.`);
  }

  const key = randomBytes(32);
  const encoded = key.toString("base64");
  process.env[ENV_KEY_NAME] = encoded;

  // Persist it so it survives a server restart -- an in-memory-only key
  // would make every previously-soft-deleted restaurant's name
  // permanently undecryptable the moment the process restarts.
  try {
    const line = `\n${ENV_KEY_NAME}=${encoded}\n`;
    if (existsSync(ENV_FILE)) {
      const existing = readFileSync(ENV_FILE, "utf8");
      if (!existing.includes(`${ENV_KEY_NAME}=`)) {
        appendFileSync(ENV_FILE, line);
      }
    } else {
      appendFileSync(ENV_FILE, line.trimStart());
    }
    logger.warn(`Generated a new ${ENV_KEY_NAME} and saved it to .env.local.`);
  } catch (err) {
    logger.error(
      `Generated a new ${ENV_KEY_NAME} but failed to persist it to .env.local -- ` +
      `it will change on next restart, making any currently-soft-deleted restaurant names undecryptable. ` +
      `Set ${ENV_KEY_NAME} manually in .env.local to fix this.`,
      err,
    );
  }

  return key;
}

let cachedKey: Buffer | null = null;
function getKey(): Buffer {
  if (!cachedKey) cachedKey = loadOrCreateKey();
  return cachedKey;
}

const IV_LENGTH = 12; // recommended IV size for GCM

export function encryptText(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // iv.authTag.ciphertext, all base64url -- single string, easy to store in
  // one TEXT column without a schema change for extra metadata columns.
  return `${iv.toString("base64url")}.${authTag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

export function decryptText(ciphertext: string): string {
  const [ivPart, tagPart, dataPart] = ciphertext.split(".");
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error("Malformed ciphertext");
  }
  const key = getKey();
  const iv = Buffer.from(ivPart, "base64url");
  const authTag = Buffer.from(tagPart, "base64url");
  const data = Buffer.from(dataPart, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

// Soft-deleted restaurant names are stored as `ENC:<ciphertext>` so a plain
// SELECT can trivially tell an encrypted-at-rest name apart from a normal
// live one without needing to attempt a decrypt (which would throw on a
// non-ciphertext string anyway, but this is cheaper and clearer).
const ENC_PREFIX = "ENC:";

export function encryptForStorage(plaintext: string): string {
  return ENC_PREFIX + encryptText(plaintext);
}

export function isEncryptedForStorage(value: string): boolean {
  return value.startsWith(ENC_PREFIX);
}

export function decryptFromStorage(value: string): string {
  if (!isEncryptedForStorage(value)) return value;
  return decryptText(value.slice(ENC_PREFIX.length));
}
