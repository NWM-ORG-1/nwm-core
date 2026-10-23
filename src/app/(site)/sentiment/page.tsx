import type { Metadata } from "next";
import { BeatPage, beatMetadata } from "@/components/beat/BeatPage";
import { SentimentDashboard } from "@/components/beat/SentimentDashboard";

export const metadata: Metadata = {
  ...beatMetadata("sentiment"),
  description: "커뮤니티와 SNS 글, 시장 지표로 집계한 NWM 투자심리지수와 종목별 심리 지표.",
};

export default function Page() {
  return (
    <BeatPage beat="sentiment">
      <SentimentDashboard />
    </BeatPage>
  );
}
