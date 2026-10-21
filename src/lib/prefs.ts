/** Reader preferences, stored on-device. Applied before first paint by PREFS_SCRIPT. */
export type Theme = "dark" | "light";
export type TextSize = "sm" | "md" | "lg";

export const PREFS_KEY = "nwm:prefs";

export interface Prefs {
  theme: Theme;
  size: TextSize;
}

export const DEFAULT_PREFS: Prefs = { theme: "dark", size: "md" };

/** Inline <head> script: no flash of the wrong theme, page stays fully static. */
export const PREFS_SCRIPT = `(function(){try{var d=document.documentElement;d.setAttribute("data-js","");var p=JSON.parse(localStorage.getItem("${PREFS_KEY}")||"{}");if(p.theme==="light"||p.theme==="dark")d.setAttribute("data-theme",p.theme);if(p.size==="sm"||p.size==="lg")d.setAttribute("data-size",p.size)}catch(e){}})()`;

export function readPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    return {
      theme: p.theme === "light" ? "light" : "dark",
      size: p.size === "sm" || p.size === "lg" ? p.size : "md",
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writePrefs(next: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {}
  const d = document.documentElement;
  d.setAttribute("data-theme", next.theme);
  if (next.size === "md") d.removeAttribute("data-size");
  else d.setAttribute("data-size", next.size);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", next.theme === "light" ? "#f3f5ff" : "#05060a");
}
