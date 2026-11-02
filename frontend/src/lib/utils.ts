import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge about the custom font-size tokens so `text-theme-xs` isn't treated as a text colour.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["theme-xs", "theme-sm", "title-sm"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
