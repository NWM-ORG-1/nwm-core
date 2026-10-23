import { BEATS, NAV_BEATS } from "@/lib/beats";

export const NAV = [
  { href: "/", label: "홈" },
  ...NAV_BEATS.map((b) => ({ href: BEATS[b].path, label: BEATS[b].label })),
  { href: "/latest", label: "최신" },
] as const;
