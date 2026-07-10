import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names without conflicts (M32 / D-088). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
