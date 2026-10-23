import { useEffect, useState } from "react";

/**
 * The sidebar keeps its collapsed state in localStorage. The Training page needs to
 * know it too: when the sidebar is collapsed (icon-only rail) the recruitment goal
 * must render inside the page, otherwise no copy of the goal is visible at all.
 */
const KEY = "e4cc-nav-collapsed";
const EVENT = "e4cc-nav-collapsed";

export function publishNavCollapsed(value: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, value ? "1" : "0");
  window.dispatchEvent(new CustomEvent(EVENT, { detail: value }));
}

export function useNavCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    setCollapsed(window.localStorage.getItem(KEY) === "1");
    const on = (e: Event) => setCollapsed((e as CustomEvent<boolean>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  return collapsed;
}
