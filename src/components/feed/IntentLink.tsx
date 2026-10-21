"use client";

import Link from "next/link";
import { useState, type ComponentProps } from "react";

/**
 * Link that upgrades to a full per-link prefetch the moment the reader shows
 * intent (hover, touch, focus) — so the click lands on a ready page.
 * Default prefetch only fetches the route's App Shell.
 */
export function IntentLink({ prefetch, ...props }: ComponentProps<typeof Link>) {
  const [hot, setHot] = useState(false);
  const warm = () => setHot(true);
  return (
    <Link
      {...props}
      prefetch={prefetch === true || hot ? true : prefetch}
      onPointerEnter={(e) => {
        warm();
        props.onPointerEnter?.(e);
      }}
      onTouchStart={(e) => {
        warm();
        props.onTouchStart?.(e);
      }}
      onFocus={(e) => {
        warm();
        props.onFocus?.(e);
      }}
    />
  );
}
