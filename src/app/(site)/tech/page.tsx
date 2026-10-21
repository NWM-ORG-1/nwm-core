import type { Metadata } from "next";
import { BeatPage, beatMetadata } from "@/components/beat/BeatPage";

export const metadata: Metadata = beatMetadata("tech");

export default function Page() {
  return <BeatPage beat="tech" />;
}
