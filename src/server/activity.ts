import { activityLog } from "@/db/schema";
import type { DB } from "@/db/client";

export type ActivityKind =
  | "ingest"
  | "promote"
  | "dismiss"
  | "restore"
  | "draft"
  | "assist"
  | "move"
  | "check"
  | "publish"
  | "schedule"
  | "reject"
  | "unpublish"
  | "correct"
  | "edit"
  | "feature"
  | "story"
  | "source"
  | "experiment"
  | "settings"
  | "request";

type Tx = Pick<DB, "insert">;

export async function logActivity(
  tx: Tx,
  e: {
    actorId: string | null;
    kind: ActivityKind;
    entityType: "feed_item" | "candidate" | "article" | "source" | "experiment" | "story" | "settings" | "correction_request";
    entityId: string;
    summary: string;
    meta?: Record<string, unknown>;
  },
) {
  await tx.insert(activityLog).values({
    actorId: e.actorId,
    kind: e.kind,
    entityType: e.entityType,
    entityId: e.entityId,
    summary: e.summary,
    meta: e.meta ?? {},
  });
}
