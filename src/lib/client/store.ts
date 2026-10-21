"use client";

/** Tiny external-store helper for useSyncExternalStore with storage persistence. */
export function createStore<T>(read: () => T) {
  let value: T | undefined;
  const listeners = new Set<() => void>();
  return {
    get(): T {
      if (value === undefined) value = read();
      return value;
    },
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    refresh() {
      value = read();
      listeners.forEach((l) => l());
    },
    subscribe(cb: () => void) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}

export function readJSON<T>(storage: "local" | "session", key: string, fallback: T): T {
  try {
    const s = storage === "local" ? window.localStorage : window.sessionStorage;
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON(storage: "local" | "session", key: string, value: unknown) {
  try {
    const s = storage === "local" ? window.localStorage : window.sessionStorage;
    s.setItem(key, JSON.stringify(value));
  } catch {}
}
