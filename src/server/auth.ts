import "server-only";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { cache } from "react";
import { db } from "@/db/client";
import { staff } from "@/db/schema";
import { verifyBasicAuth } from "./credentials";

export type StaffRow = typeof staff.$inferSelect;

export class AuthError extends Error {
  constructor(message = "인증이 필요합니다.") {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Re-verifies the caller inside every Server Action and admin data loader.
 * proxy.ts guards /admin pages, but Server Action IDs can be POSTed to any
 * path, so the proxy alone is not a security boundary.
 */
export const requireStaff = cache(async (): Promise<StaffRow> => {
  const h = await headers();
  const login = await verifyBasicAuth(h.get("authorization"));
  if (login === "busy") throw new AuthError("요청이 많습니다. 잠시 후 다시 시도하세요.");
  if (!login) throw new AuthError();

  // CSRF defence in depth: browsers attach Basic credentials cross-site.
  const site = h.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new AuthError("허용되지 않은 요청 출처입니다.");

  const existing = await db.query.staff.findFirst({ where: eq(staff.login, login) });
  if (existing) {
    if (!existing.active) throw new AuthError("비활성화된 계정입니다.");
    return existing;
  }
  // First login of a configured admin user → provision a staff profile.
  // The public slug is random (never the login); name/title are edited in /admin/settings.
  const [created] = await db
    .insert(staff)
    .values({ login, name: "편집국", slug: `editor-${randomBytes(4).toString("hex")}`, title: "편집국", role: "admin" })
    .onConflictDoNothing()
    .returning();
  return created ?? (await db.query.staff.findFirst({ where: eq(staff.login, login) }))!;
});
