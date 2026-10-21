import type { Metadata } from "next";
import { BeatPage, beatMetadata } from "@/components/beat/BeatPage";

export const metadata: Metadata = beatMetadata("ai");

export default function Page() {
  return <BeatPage beat="ai" />;
}
