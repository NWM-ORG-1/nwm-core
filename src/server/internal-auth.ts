import { timingSafeEqual } from "node:crypto";

/** Bearer check for /api/internal/* (scheduler, phase-2 workers). */
export function internalAuthorized(header: string | null): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret || (secret === "change-me" && process.env.NODE_ENV === "production")) return false;
  const got = header?.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
