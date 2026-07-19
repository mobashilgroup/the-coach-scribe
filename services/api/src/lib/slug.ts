import { randomBytes } from "node:crypto";

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 40) || "org";
}

/** Slug with a short random suffix to avoid collisions. */
export function uniqueSlug(input: string): string {
  return `${slugify(input)}-${randomBytes(3).toString("hex")}`;
}
