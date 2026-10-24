import { createHash, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/**
 * Basic Auth credential store, shared by proxy.ts and Server Actions.
 * ADMIN_USERS = "login:saltHex:scryptHex;login2:…" (generate with `npm run hash-password`).
 * Without ADMIN_USERS, development falls back to admin / nwm-dev; production denies all.
 */

interface Cred {
  login: string;
  salt: Buffer;
  hash: Buffer;
}

const KEYLEN = 32;
export const DEV_LOGIN = "admin";
export const DEV_PASSWORD = "nwm-dev";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

let cached: { raw: string | undefined; creds: Cred[] } | null = null;

/** For the CLI and the one-time dev credential; request paths use the async form. */
export function hashPasswordSync(password: string, salt: Buffer): Buffer {
  return scryptSync(password.normalize("NFKC"), salt, KEYLEN);
}

function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password.normalize("NFKC"), salt, KEYLEN);
}

function loadCreds(): Cred[] {
  const raw = process.env.ADMIN_USERS;
  if (cached && cached.raw === raw) return cached.creds;
  let creds: Cred[] = [];
  if (raw && raw.trim()) {
    creds = raw
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((entry) => {
        const [login, saltHex, hashHex] = entry.split(":");
        return { login, salt: Buffer.from(saltHex ?? "", "hex"), hash: Buffer.from(hashHex ?? "", "hex") };
      })
      .filter((c) => c.login && c.salt.length >= 8 && c.hash.length === KEYLEN);
  } else if (process.env.NODE_ENV !== "production") {
    const salt = Buffer.from("6e776d2d6465762d73616c74", "hex");
    creds = [{ login: DEV_LOGIN, salt, hash: hashPasswordSync(DEV_PASSWORD, salt) }];
  }
  cached = { raw, creds };
  okCache.clear();
  return creds;
}

export function adminConfigured(): boolean {
  return loadCreds().length > 0;
}

/** A newsroom login that may still sign in — removing it from ADMIN_USERS also ends its Telegram sessions. */
export function isConfiguredLogin(login: string): boolean {
  return loadCreds().some((c) => c.login === login);
}

/*
 * Every admin request carries the header, and both the proxy and requireStaff() check it,
 * so verified headers are remembered briefly (keyed by a digest, never the header itself).
 * Failures are never cached. Hashing is capped at a few concurrent runs so a burst of bad
 * logins can't occupy the libuv pool that fs and DNS share.
 */
const OK_TTL = 60_000;
const OK_MAX = 256;
const MAX_INFLIGHT = 4;
const okCache = new Map<string, { login: string; exp: number }>();
let inflight = 0;

export type AuthCheck = string | null | "busy";

/** Returns the login for a valid `Authorization: Basic …` header, null if invalid, "busy" when hashing is saturated. */
export async function verifyBasicAuth(header: string | null | undefined): Promise<AuthCheck> {
  if (!header || !header.startsWith("Basic ")) return null;
  const creds = loadCreds();
  const key = createHash("sha256").update(header).digest("base64");
  const hit = okCache.get(key);
  if (hit && hit.exp > Date.now()) return hit.login;
  if (hit) okCache.delete(key);

  let decoded: string;
  try {
    decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
  } catch {
    return null;
  }
  const idx = decoded.indexOf(":");
  if (idx < 1) return null;
  const login = decoded.slice(0, idx);
  const password = decoded.slice(idx + 1);
  if (password.length > 1024) return null;

  if (inflight >= MAX_INFLIGHT) return "busy";
  inflight += 1;
  try {
    const cred = creds.find((c) => c.login === login);
    // unknown users spend comparable time so enumeration is not trivially observable
    const candidate = await hashPassword(password, cred?.salt ?? Buffer.alloc(16));
    if (!cred || !timingSafeEqual(candidate, cred.hash)) return null;
  } finally {
    inflight -= 1;
  }
  okCache.set(key, { login, exp: Date.now() + OK_TTL });
  if (okCache.size > OK_MAX) okCache.delete(okCache.keys().next().value!);
  return login;
}
