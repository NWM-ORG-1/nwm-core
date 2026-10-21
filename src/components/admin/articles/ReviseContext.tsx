"use client";

import { createContext, use, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import type { CorrectionKind } from "./labels";

/**
 * Shared state between the 수정·정정 form and the correction-request list:
 * "정정으로 처리" on a request pre-fills the form (kind = correction, linked
 * request) and brings it into view.
 */
interface ReviseState {
  kind: CorrectionKind | "";
  setKind: (k: CorrectionKind | "") => void;
  requestId: string;
  setRequestId: (id: string) => void;
  /** Pre-fill from a correction request and reveal the form. */
  prefill: (requestId: string) => void;
  /** The form registers how to reveal itself (scroll + focus the public note). */
  revealRef: React.RefObject<(() => void) | null>;
}

const Ctx = createContext<ReviseState | null>(null);

export function ReviseProvider({ children }: { children: ReactNode }) {
  const [kind, setKind] = useState<CorrectionKind | "">("");
  const [requestId, setRequestId] = useState("");
  const revealRef = useRef<(() => void) | null>(null);

  const prefill = useCallback((id: string) => {
    // Commit synchronously so the note field exists before we focus it.
    flushSync(() => {
      setKind("correction");
      setRequestId(id);
    });
    revealRef.current?.();
  }, []);

  const value = useMemo(() => ({ kind, setKind, requestId, setRequestId, prefill, revealRef }), [kind, requestId, prefill]);
  return <Ctx value={value}>{children}</Ctx>;
}

export function useRevise(): ReviseState {
  const v = use(Ctx);
  if (!v) throw new Error("useRevise must be used inside <ReviseProvider>");
  return v;
}
