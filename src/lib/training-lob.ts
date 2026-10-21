import { useEffect, useState } from "react";

/**
 * The recruitment goal lives in the sidebar, but only the Training page knows which
 * LOB tab is open. This tiny channel lets the page tell the navigation the current tab
 * so the sidebar summary always matches what the recruiter is looking at.
 */
const KEY = "e4cc-training-lob";
const EVENT = "e4cc-training-lob";

export function publishTrainingLob(lob: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, lob);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: lob }));
}

export function useTrainingLob() {
  const [lob, setLob] = useState("ONLINE");
  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    if (stored) setLob(stored);
    const on = (e: Event) => setLob((e as CustomEvent<string>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return lob;
}
