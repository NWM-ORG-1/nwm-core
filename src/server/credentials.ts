import { scryptSync, timingSafeEqual } from "node:crypto";

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

let cached: { raw: string | undefined; creds: Cred[] } | null = null;

export function hashPassword(password: string, salt: Buffer): Buffer {
  return scryptSync(password.normalize("NFKC"), salt, KEYLEN);
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
    creds = [{ login: DEV_LOGIN, salt, hash: hashPassword(DEV_PASSWORD, salt) }];
  }
  cached = { raw, creds };
  return creds;
}

export function adminConfigured(): boolean {
  return loadCreds().length > 0;
}

/** Returns the login for a valid `Authorization: Basic …` header, else null. */
export function verifyBasicAuth(header: string | null | undefined): string | null {
  if (!header || !header.startsWith("Basic ")) return null;
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
  const cred = loadCreds().find((c) => c.login === login);
  if (!cred) {
    // spend comparable time so user enumeration is not trivially observable
    hashPassword(password, Buffer.alloc(16));
    return null;
  }
  const candidate = hashPassword(password, cred.salt);
  return timingSafeEqual(candidate, cred.hash) ? login : null;
}
