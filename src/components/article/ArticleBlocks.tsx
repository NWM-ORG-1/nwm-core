import type { Block, SentimentSnapshot } from "@/lib/content/blocks";
import { BLOCK_TITLE_KO, SECTION_LABEL_KO } from "@/lib/content/meta";
import { ChartBlock } from "./ChartBlock";
import { RichText } from "./RichText";
import { SentimentBlock } from "./SentimentBlock";

/**
 * The smart-brevity body. Pure and hook-free so the newsroom preview renders
 * exactly what readers will see.
 */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="kicker mb-2.5 flex items-center gap-2 text-ice">
      <span className="h-px w-4 bg-current opacity-60" aria-hidden="true" />
      {children}
    </h2>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((t, i) => (
        <li key={i} className="relative pl-5">
          <span className="absolute left-0 top-[0.72em] size-1.5 -translate-y-1/2 rounded-full bg-ice/70" aria-hidden="true" />
          <RichText text={t} />
        </li>
      ))}
    </ul>
  );
}

export function ArticleBlocks({ blocks, sentiment }: { blocks: Block[]; sentiment?: SentimentSnapshot | null }) {
  return (
    <div className="prose-nwm space-y-8">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "why":
            return (
              <section key={i}>
                <Label>{BLOCK_TITLE_KO.why}</Label>
                <Bullets items={b.items} />
              </section>
            );
          case "numbers":
            return (
              <section key={i} data-noswipe>
                <Label>{BLOCK_TITLE_KO.numbers}</Label>
                <dl className={`grid gap-2.5 ${b.items.length >= 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
                  {b.items.map((n, j) => (
                    <div key={j} className="panel px-3.5 py-3">
                      <dd className="tabular text-[24px] font-bold leading-tight tracking-[-0.03em] text-fg">{n.value}</dd>
                      <dt className="mt-1 text-[13px] leading-snug text-fg-3">{n.label}</dt>
                      {n.delta && (
                        <dd className={`tabular mt-1 font-mono text-[12px] ${n.trend === "up" ? "text-up" : n.trend === "down" ? "text-down" : "text-flat"}`}>
                          {n.trend === "up" ? "▲ " : n.trend === "down" ? "▼ " : ""}
                          {n.delta}
                        </dd>
                      )}
                    </div>
                  ))}
                </dl>
              </section>
            );
          case "section":
            return (
              <section key={i}>
                <Label>{SECTION_LABEL_KO[b.label]}</Label>
                {b.text && (
                  <p className={b.bullets?.length ? "mb-3" : ""}>
                    <RichText text={b.text} />
                  </p>
                )}
                {b.bullets && b.bullets.length > 0 && <Bullets items={b.bullets} />}
              </section>
            );
          case "quote":
            return (
              <figure key={i} className="border-l-2 border-ice/60 pl-5">
                <blockquote className="text-[1.08em] font-medium leading-relaxed text-fg">“<RichText text={b.text} />”</blockquote>
                <figcaption className="mt-2 text-[13px] text-fg-3">
                  — {b.attribution}
                  {b.role ? `, ${b.role}` : ""}
                </figcaption>
              </figure>
            );
          case "chart":
            return <ChartBlock key={i} title={b.title} unit={b.unit} points={b.points} source={b.source} />;
          case "table":
            return (
              <figure key={i} className="panel overflow-x-auto" data-noswipe>
                <table className="w-full border-collapse text-[14px]">
                  <caption className="hud px-4 pb-1 pt-3 text-left text-fg-3">{b.caption}</caption>
                  <thead>
                    <tr>
                      {b.columns.map((c, j) => (
                        <th key={j} className={`border-b border-line px-4 py-2 text-[12px] font-semibold text-fg-3 ${j ? "text-right" : "text-left"}`}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j} className="border-b border-line last:border-0">
                        {r.map((cell, k) => {
                          const tone = /^▲|^\+/.test(cell) ? "text-up" : /^▼|^[-−]/.test(cell) ? "text-down" : k ? "text-fg" : "text-fg-2";
                          return (
                            <td key={k} className={`tabular px-4 py-2 ${k ? "text-right font-mono text-[13px]" : ""} ${tone}`}>
                              {cell}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </figure>
            );
          case "sentiment":
            return sentiment ? <SentimentBlock key={i} s={sentiment} /> : null;
          case "next":
            return (
              <section key={i} className="panel brackets px-4 py-4">
                <Label>{BLOCK_TITLE_KO.next}</Label>
                <Bullets items={b.items} />
              </section>
            );
          case "deeper":
            return (
              <section key={i}>
                <Label>{BLOCK_TITLE_KO.deeper}</Label>
                <ul className="space-y-1.5 text-[15px]">
                  {b.links.map((l, j) => (
                    <li key={j}>
                      {l.href.startsWith("/") ? (
                        <a href={l.href} className="text-ice hover:underline">
                          {l.title} →
                        </a>
                      ) : (
                        <span className="text-fg-2">{l.title}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
        }
      })}
    </div>
  );
}
