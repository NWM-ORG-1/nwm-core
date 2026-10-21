import type { Metadata } from "next";
import { BeatPage, beatMetadata } from "@/components/beat/BeatPage";

export const metadata: Metadata = beatMetadata("economy");

export default function Page() {
  return <BeatPage beat="economy" />;
}
