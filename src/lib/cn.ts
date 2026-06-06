// Tiny className joiner. Replaces the `clsx` dep without adding a
// runtime helper. Filters falsy values so callers can pass ternaries
// and conditionals without an explosion of `&& "..."` fragments.
//
// Usage:
//   cn("base", isOpen && "is-open", variant === "primary" && "primary")
//
// Not a substitute for `tailwind-merge` — Tailwind class conflicts
// (`p-2` + `p-4`) aren't resolved. This project doesn't generate
// conflicting classes in practice (each component sets layout once), so
// we keep the dep footprint at zero.
export function cn(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}
