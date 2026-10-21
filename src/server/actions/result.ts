import { z } from "zod";
import { AuthError } from "../auth";
import { NewsroomError } from "../newsroom";

export type ActionState<T = undefined> =
  | { ok: true; message?: string; data?: T; at: number }
  | { ok: false; error: string; code?: string; at: number }
  | null;

export function ok<T>(message?: string, data?: T): ActionState<T> {
  return { ok: true, message, data, at: Date.now() };
}

export function fail(error: unknown): ActionState<never> {
  if (error instanceof AuthError) return { ok: false, error: error.message, code: "auth", at: Date.now() };
  if (error instanceof NewsroomError) return { ok: false, error: error.message, code: error.code, at: Date.now() };
  if (error instanceof z.ZodError) {
    return { ok: false, error: error.issues.map((i) => `${i.path.join(".") || "입력"}: ${i.message}`).join(" · "), code: "invalid", at: Date.now() };
  }
  // Next.js control-flow errors (redirect/notFound) must propagate.
  if (error && typeof error === "object" && "digest" in error) throw error;
  // Races the pre-checks can't rule out (two editors saving at once) surface as Postgres errors.
  const pg = pgCode(error);
  if (pg === "23505") return { ok: false, error: "같은 값이 이미 있습니다. 다른 편집자가 방금 저장했을 수 있으니 새로고침한 뒤 확인하세요.", code: "conflict", at: Date.now() };
  if (pg === "40001" || pg === "40P01") return { ok: false, error: "다른 편집자의 작업과 겹쳤습니다. 잠시 후 다시 시도하세요.", code: "conflict", at: Date.now() };
  console.error("[action]", error);
  return { ok: false, error: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.", code: "server", at: Date.now() };
}

/** SQLSTATE of a Postgres error, also when Drizzle wraps it ("Failed query" with a cause). */
function pgCode(error: unknown): string | null {
  for (let e = error, depth = 0; e && typeof e === "object" && depth < 4; e = (e as { cause?: unknown }).cause, depth++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}
