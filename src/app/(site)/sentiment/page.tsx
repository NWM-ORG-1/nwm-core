import type { Metadata } from "next";
import { BeatPage, beatMetadata } from "@/components/beat/BeatPage";
import { SentimentDashboard } from "@/components/beat/SentimentDashboard";

export const metadata: Metadata = {
  ...beatMetadata("sentiment"),
  description: "커뮤니티와 소셜에서 측정한 투자자 심리. NWM 센티먼트 인덱스와 종목별 심리 지표.",
};

export default function Page() {
  return (
    <BeatPage beat="sentiment">
      <SentimentDashboard />
    </BeatPage>
  );
}
