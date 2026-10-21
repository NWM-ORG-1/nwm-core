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
  console.error("[action]", error);
  return { ok: false, error: "처리 중 오류가 발생했습니다. 잠시 후 다시 시도하세요.", code: "server", at: Date.now() };
}
