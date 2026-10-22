/**
 * Claude models the newsroom can call, with their prices and the request
 * fields each one accepts. Shared by the sentiment labeller (worker) and the
 * draft generator (web), so it stays free of server-only imports.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

interface ModelInfo {
  label: string;
  /** USD per million tokens; cache writes (5-minute) cost 1.25 × input */
  input: number;
  output: number;
  cacheRead: number;
  /**
   * How a quick call turns thinking off: `disabled` (accepted at effort ≤ high),
   * `between_tools` (Sonnet 5.5 — with no tools it never thinks), or null when
   * the model always thinks and only effort keeps it short.
   */
  thinkingOff: "disabled" | "between_tools" | null;
}

export const MODELS: Record<string, ModelInfo> = {
  "claude-fable-5-1": { label: "Claude Fable 5.1", input: 10, output: 50, cacheRead: 0.25, thinkingOff: null },
  "claude-opus-5-5": { label: "Claude Opus 5.5", input: 4, output: 20, cacheRead: 0.2, thinkingOff: null },
  "claude-opus-5": { label: "Claude Opus 5", input: 5, output: 25, cacheRead: 0.5, thinkingOff: "disabled" },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", input: 2, output: 10, cacheRead: 0.2, thinkingOff: "between_tools" },
  "claude-sonnet-5": { label: "Claude Sonnet 5", input: 2, output: 10, cacheRead: 0.2, thinkingOff: "disabled" },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5", input: 0.1, output: 0.5, cacheRead: 0.01, thinkingOff: "disabled" },
};

/** An unknown model is priced like the most expensive known one, so a budget never under-counts. */
const PRICIEST = Object.values(MODELS).reduce((a, b) => (b.output > a.output ? b : a));

export function modelInfo(model: string): ModelInfo & { known: boolean } {
  const m = MODELS[model];
  return m ? { ...m, known: true } : { ...PRICIEST, label: model, known: false };
}

export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function usageCostUsd(model: string, u: TokenUsage): number {
  const p = modelInfo(model);
  const usd =
    ((u.input_tokens ?? 0) * p.input +
      (u.cache_creation_input_tokens ?? 0) * p.input * 1.25 +
      (u.cache_read_input_tokens ?? 0) * p.cacheRead +
      (u.output_tokens ?? 0) * p.output) /
    1e6;
  return Math.round(usd * 1e6) / 1e6;
}

/** Prompt tokens of a call, cached or not. */
export function promptTokens(u: TokenUsage): number {
  return (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
}

/**
 * Fields for a short, latency-sensitive call (classification, headline ideas):
 * low effort and no thinking where the model allows it. Sending
 * `{type: "disabled"}` to a model that cannot disable thinking is a 400.
 */
export function quickParams(model: string): { thinking?: { type: "disabled" } | { type: "between_tools" }; output_config: { effort: Effort } } {
  const off = modelInfo(model).thinkingOff;
  return { ...(off ? { thinking: { type: off } } : {}), output_config: { effort: "low" } };
}

export function hasAnthropicKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function parseEffort(v: string | undefined | null): Effort | undefined {
  const s = v?.trim().toLowerCase();
  return s && (EFFORTS as readonly string[]).includes(s) ? (s as Effort) : undefined;
}
