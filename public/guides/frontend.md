# Frontend design guidelines

Goal: interfaces that look designed by a person with taste, not generated. Every screen has a point of view, a clear hierarchy, and finished details. Follow this before writing any markup.

## 0. Process
1. Name the product, the user, and the one job of each screen. Write the real copy first (no lorem ipsum, no "Feature 1").
2. Pick ONE design direction and commit: editorial (serif display, generous whitespace), utilitarian (dense, monochrome, mono accents), warm-tactile (paper tones, soft shadows), crisp-modern (white, hairlines, one saturated accent), playful (rounded, bold colour blocks), luxury (dark, restrained, fine type). Write the direction in two sentences in a comment at the top of the CSS.
3. Build design tokens first, then components, then pages. Never hard-code colours or sizes in components.
4. Build mobile-first at 360px, then enhance at 768 and 1200. Test all three.

## 1. Tokens (put in :root, theme through variables)
- Colour: a neutral ramp of 10-12 steps (bg, surface, surface-2, border, border-strong, text-faint, text-muted, text, ink) with a slight hue tint matching the accent; ONE accent (+ hover/deep/soft variants); semantic colours (success, warning, danger, info) used sparingly. Text contrast >= 4.5:1, large text >= 3:1. Provide dark mode via `prefers-color-scheme` and a `data-theme` override.
- Type: choose a real pairing. Safe, good-looking stacks: `Inter, ui-sans-serif, system-ui`, `"Iowan Old Style", "Palatino Linotype", Georgia, serif` for editorial headings, `ui-monospace, "SF Mono", Menlo, Consolas` for code. Scale with ratio ~1.2: 12 13 15 16 18 22 26 32 40 52 (px). Body 16px minimum on mobile, line-height 1.5-1.7; headings 1.1-1.25, tracking -0.01em to -0.03em on large sizes, positive tracking on small caps labels. Max line length 62-72ch.
- Spacing: 4px base: 4 8 12 16 20 24 32 40 56 80 120. Use rhythm: related things close, sections far apart.
- Radius: one family (e.g. 8 / 12 / 20 / 999). Elevation: 3 levels of soft, low-opacity, multi-layer shadows; prefer 1px hairline borders on flat designs.
- Motion: durations 120/200/320ms; easing `cubic-bezier(.32,.72,0,1)` for entrances, `ease-out` for hovers. Animate transform and opacity only.

## 2. Layout
- Use CSS grid/flex with `gap`; container `width:min(100% - 2rem, 72rem)`. Mobile-first media queries (min-width). Use `dvh` not `vh`, respect `env(safe-area-inset-*)`.
- One clear primary action per screen. Align to a grid; align text baselines; keep consistent gutters.
- Navigation: bottom tab bar or compact top bar on mobile; sidebar on desktop. Sticky headers use backdrop blur sparingly.
- Never let content touch screen edges; minimum 16px side padding on mobile.

## 3. Components (design every state)
- Buttons: height 44px+ on touch, clear primary/secondary/ghost/destructive, states: hover, active (scale .98), focus-visible ring (2px accent, 2px offset), disabled, loading (spinner, width stable).
- Inputs: visible labels (not placeholder-only), 16px font (prevents iOS zoom), clear focus, inline validation text, error colour AND icon/text, helper text. Group related fields; use correct `type`/`inputmode`/`autocomplete`.
- Cards: only when grouping helps; avoid card-in-card. Use consistent padding and one hierarchy (title, meta, body, action).
- Lists/tables: hairline separators, tabular numbers (`font-variant-numeric: tabular-nums`), right-align numbers, sticky header, responsive (stack or scroll with fade).
- Overlays: modal/sheet with focus trap, Esc, scroll lock, backdrop; bottom sheets on mobile.
- Feedback: toasts (short, dismissible, aria-live), skeletons that mimic final layout, optimistic updates with undo.
- Empty states: illustration or icon + one sentence + one action. Error states: what happened, what to do, retry.
- Icons: one consistent inline-SVG set (stroke 1.5-2px, 24px grid). Never use emoji as UI icons.

## 4. Avoid the "AI look"
No purple-blue gradient hero, no giant gradient blobs, no glassmorphism everywhere, no three identical feature cards with emoji, no centered-everything hero + two buttons template, no stock-photo placeholders, no "Welcome to X" headline, no fake testimonials/logos, no drop-shadow on everything, no overuse of rounded-2xl + shadow-lg. Instead: strong typographic hierarchy, restrained palette, real content, purposeful asymmetry, tight details (alignment, spacing, borders), and one memorable signature element (a distinctive logo mark, an unusual layout, a custom illustration in SVG, a data visualisation).

## 5. Accessibility (non-negotiable)
Semantic HTML (`header nav main section button a label`), one `h1`, logical heading order. Everything keyboard reachable with visible focus. `aria-label` on icon-only buttons, `aria-live` for async status, `alt` on images. Colour never the only signal. Respect `prefers-reduced-motion`. Targets >= 44px. Test with zoom 200%.

## 6. Performance
System fonts or `font-display: swap` + preload; set image width/height (no layout shift); `loading="lazy"`; avoid heavy libraries for simple jobs; inline critical CSS for static sites; split bundles; debounce input handlers; no layout thrash in scroll handlers.

## 7. Stack choices
- Static site / small app: plain HTML + CSS variables + a little JS (ES modules). Fast and robust.
- Interactive app: Vite + React (or Preact/Svelte) + CSS Modules or a single global stylesheet; Tailwind only if you define the theme tokens in its config and avoid the default look.
- Needs SEO/SSR: Next.js or Astro. State: local state first; add a store only when needed.
- Always provide `npm run dev`, `npm run build`, `npm start`.

## 8. Starter CSS (adapt, do not copy blindly)
```css
:root{--bg:#F7F4EE;--surface:#fff;--surface-2:#EFEAE0;--border:#E3DCCD;--text:#1B1713;--muted:#6B6054;--accent:#B5532E;--accent-deep:#9A4424;--accent-soft:rgba(181,83,46,.1);--r-s:8px;--r-m:14px;--r-l:24px;--ease:cubic-bezier(.32,.72,0,1);--font:Inter,ui-sans-serif,system-ui,sans-serif}
@media(prefers-color-scheme:dark){:root{--bg:#14110E;--surface:#1D1914;--surface-2:#26211A;--border:#342D24;--text:#EFE8DC;--muted:#A09484}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.6 var(--font);-webkit-font-smoothing:antialiased}
button,input,select,textarea{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.btn{min-height:44px;padding:0 20px;border-radius:999px;border:0;background:var(--accent-deep);color:#fff;font-weight:600;transition:transform .15s var(--ease)}
.btn:active{transform:scale(.97)}
@media(prefers-reduced-motion:reduce){*{animation-duration:.001ms!important;transition-duration:.001ms!important}}
```

## 9. Verify before delivering
Run the build with zero warnings. Open every route. Check 360, 768, 1280 widths, dark mode, keyboard-only use, empty/loading/error states, no console errors, no horizontal scroll, images and fonts load. If a vision tool is available, render and `<view>` screenshots, then fix spacing/contrast issues you can see.
