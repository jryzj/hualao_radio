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

// iOS 14 Safari compat: strip @layer from Tailwind v4 output.
// Safari 14 doesn't support CSS @layer (added in Safari 15.4) and
// ignores entire @layer blocks, discarding all utility classes.
const removeLayer = {
  postcssPlugin: "remove-layer",
  AtRule: {
    layer: (atRule) => {
      if (atRule.nodes && atRule.nodes.length > 0) {
        atRule.replaceWith(atRule.nodes);
      } else {
        atRule.remove();
      }
    },
  },
};

const config = {
  plugins: [
    "@tailwindcss/postcss",
    removeLayer,
  ],
};

export default config;
