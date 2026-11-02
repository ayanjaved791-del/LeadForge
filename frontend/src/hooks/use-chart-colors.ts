import { useEffect, useState } from "react";

/** Tracks the `dark` class on <html> (set by the theme toggle). */
export function useIsDark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains("dark")));
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

/** Chart colours: brand blue in light mode, monochrome (white/grey) in dark mode. */
export function useChartColors() {
  const dark = useIsDark();
  return dark
    ? { dark, primary: "#fafafa", secondary: "#737373", grid: "#262626" }
    : { dark, primary: "#465fff", secondary: "#9cb9ff", grid: "#f2f4f7" };
}
