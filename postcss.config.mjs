// PostCSS configuration for Next.js 16.
//
// Next 16 auto-detects this file and applies it to CSS imports. We use
// @tailwindcss/postcss (Tailwind v4's official PostCSS plugin) — that's
// all we need; v4 dropped the autoprefixer + postcss-import requirement.
//
// No `plugins` for autoprefixer: Tailwind v4 already ships modern
// cascade layers, light/dark via `@media (prefers-color-scheme)`, and
// most needed vendor prefixes (e.g. `-webkit-backdrop-filter` for
// Safari). Add other plugins here only if needed.

const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
