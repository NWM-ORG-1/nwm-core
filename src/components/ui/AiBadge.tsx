import Link from "next/link";
import type { AiInvolvement } from "@/db/schema";
import { AI_DISCLOSURE, AI_LABEL, aiLabelLong } from "@/lib/labels";

/**
 * Visible AI-involvement label (AI 기본법 / industry AI codes). Every article
 * carries one; the long form names the human editor who signed off.
 */
export function AiBadge({
  value,
  editorName,
  variant = "short",
}: {
  value: AiInvolvement;
  editorName?: string | null;
  variant?: "short" | "long";
}) {
  if (!AI_DISCLOSURE) return null;
  const label = variant === "long" ? aiLabelLong(value, editorName) : AI_LABEL[value].short;
  const machine = value === "auto" || value === "ai_draft_edited" || value === "ai_assisted";
  return (
    <Link
      href="/policy/ai"
      title={AI_LABEL[value].explain}
      className="inline-flex items-center gap-1.5 rounded-full border border-line-2 px-2 py-[3px] text-[11px] font-medium text-fg-3 hover:border-line-3 hover:text-fg-2 transition-colors"
    >
      <span
        className={`hud !text-[9px] !tracking-[0.12em] ${machine ? "text-ice" : "text-fg-3"}`}
        aria-hidden="true"
      >
        {machine ? "AI" : "HUMAN"}
      </span>
      <span>{label}</span>
    </Link>
  );
}
