import Link from "next/link";
import type { Beat } from "@/db/schema";
import { BEATS } from "@/lib/beats";

const DOT: Record<Beat, string> = {
  ai: "bg-beat-ai",
  crypto: "bg-beat-crypto",
  economy: "bg-beat-economy",
  tech: "bg-beat-tech",
  sentiment: "bg-beat-sentiment",
};
const TEXT: Record<Beat, string> = {
  ai: "text-beat-ai",
  crypto: "text-beat-crypto",
  economy: "text-beat-economy",
  tech: "text-beat-tech",
  sentiment: "text-beat-sentiment",
};

export function beatTextClass(b: Beat) {
  return TEXT[b];
}
export function beatDotClass(b: Beat) {
  return DOT[b];
}

/** Beat label: coloured dot + mono code. Colour is decorative; the text carries meaning. */
export function BeatChip({ beat, link = false, size = "sm" }: { beat: Beat; link?: boolean; size?: "sm" | "md" }) {
  const meta = BEATS[beat];
  const body = (
    <span className={`inline-flex items-center gap-1.5 ${size === "md" ? "text-[12.5px]" : "text-[11.5px]"} font-semibold ${TEXT[beat]}`}>
      <span className={`size-1.5 rounded-full ${DOT[beat]}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
  return link ? (
    <Link href={meta.path} className="hover:opacity-80 transition-opacity">
      {body}
    </Link>
  ) : (
    body
  );
}
