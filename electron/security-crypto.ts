import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { hashRawSync, Algorithm, Version } from "@node-rs/argon2";
const options = {
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 1,
  outputLen: 32,
  algorithm: Algorithm.Argon2id,
  version: Version.V0x13,
};
export const digest = (s: string | Buffer) =>
  createHash("sha256").update(s).digest("hex");
export function deriveSecret(secret: string, salt: Buffer) {
  const input = Buffer.from(secret, "utf8");
  try {
    return hashRawSync(input, { ...options, salt });
  } finally {
    input.fill(0);
  }
}
export function hashPassword(password: string) {
  const salt = randomBytes(16);
  const hash = deriveSecret(password, salt);
  try {
    return `$argon2id$v=19$m=65536,t=3,p=1$${salt.toString("base64")}$${hash.toString("base64")}`;
  } finally {
    hash.fill(0);
  }
}
export function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split("$");
  if (
    parts.length !== 6 ||
    parts[1] !== "argon2id" ||
    parts[2] !== "v=19" ||
    parts[3] !== "m=65536,t=3,p=1"
  )
    return false;
  const salt = Buffer.from(parts[4], "base64"),
    expected = Buffer.from(parts[5], "base64");
  if (salt.length !== 16 || expected.length !== 32) return false;
  const actual = deriveSecret(password, salt);
  try {
    return timingSafeEqual(actual, expected);
  } finally {
    actual.fill(0);
  }
}
