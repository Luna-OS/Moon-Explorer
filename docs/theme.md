# The Moon theme

Moon Explorer wears the same "night sky" look as the other Luna-OS Moon apps.
This page records what that look is, where each value comes from, and how
Moon Explorer applies it.

**Source of truth in this repo:** [`src/theme/tokens.css`](../src/theme/tokens.css).
Everything theme-related lives in `src/theme/`; the explorer UI in `src/App.tsx`
and `src/explorer/` only consumes it.

## Sources

| Repo | Theme file | Last commit looked at | Notes |
| --- | --- | --- | --- |
| [Moon-Browser](https://github.com/Luna-OS/Moon-Browser) | `src/renderer/theme/tokens.css` (`--mb-*`) | 2026-09-30 | Newest and most complete: adds popover, frame/toolbar, switch, icon button, breadcrumb. |
| [Moon-Task](https://github.com/Luna-OS/Moon-Task) | `src/styles/tokens.css` (`--mt-*`) | 2026-09-26 | Adds dense table, chips, meters, owner colors. Says it uses "the same night-sky palette as MoonDisk". |
| [MoonDisk](https://github.com/Luna-OS/MoonDisk) | `src/styles/tokens.css` (`--md-color-*`) | 2026-09-25 | The original palette. Older naming (`--md-color-surface`, …). |
| [Moon-Terminal](https://github.com/Luna-OS/Moon-Terminal) | `app/renderer/style.css`, `renderer.js` | 2026-09-28 | Plain CSS, Tokyo-Night-style colors (`#10121c`). Doesn't use the shared tokens. |
| [Moon-Sniping](https://github.com/Luna-OS/Moon-Sniping) | — | 2026-09-26 | Only README + LICENSE, so there's no theme yet. |
| [lunabin](https://github.com/Luna-OS/lunabin) | `css/style.css` | 2025-10-21 | Older PHP pastebin. Generic dark theme (`#0a0a0a`, purple `#8a2be2`). It predates the Moon look. |

### Where they agree

MoonDisk, Moon-Task and Moon-Browser are the same family. They use:

- the same stack: **React 19 + Vite + Tailwind CSS v4**, configured CSS-first through `@theme` in a single `tokens.css`
- the **identical `@theme` palette**, value for value (Moon-Task and Moon-Browser also add `peach-300` and `--font-mono`)
- the same **two-layer token model**: a raw palette in `@theme` plus semantic per-app variables with a two-letter prefix (`--md-*`, `--mt-*`, `--mb-*`)
- **night (dark) as the default**, with a day theme selected through `<html data-theme="light">`
- the same decorative **night sky** (two star layers plus a crescent moon in the top-right corner), the **glass** surfaces, the **lavender gradient title**, the **MoonPhase** gauge and **2px round-stroke line icons**

### Where they differ

- **Naming:** MoonDisk uses `--md-color-*`; Moon-Task and Moon-Browser use the shorter `--{prefix}-bg/-text/-border/...`. Moon Explorer follows the newer pattern.
- **Twinkle:** MoonDisk and Moon-Browser animate the bright stars. Moon-Task turned the animation off to save CPU, because it stays open all day. Moon Explorer does the same, since it is also a long-running app.
- **Window chrome:** Moon-Browser and Moon-Terminal are frameless and draw their own title bar (`frame: false`). Moon-Browser colors the native window buttons to match (`FRAME_COLORS`). The Tauri apps keep native decorations.
- **Moon-Terminal and lunabin** use their own older palettes and aren't part of the shared look. Their values are listed below only for reference.

In short, **Moon-Browser's tokens are the canonical variant**, with Moon-Task's table, chip and meter components added.

## Palette (`@theme`, identical in all three apps)

| Token | Hex | Role | From |
| --- | --- | --- | --- |
| `--color-night-950` | `#0b0920` | App background, frame (night) | MoonDisk, Moon-Task, Moon-Browser |
| `--color-night-900` | `#141030` | Solid surface, table header, toolbar | all three |
| `--color-night-800` | `#1d1742` | Glass top, raised surface | all three |
| `--color-violet-700` | `#3b2e6b` | Sky glow; day-theme border tint | all three |
| `--color-lavender-400` | `#b9aefb` | Primary accent base (borders, glows, selection) | all three |
| `--color-lavender-300` | `#d6cffd` | Accent text, focus ring, primary button | all three |
| `--color-moon-100` | `#f4f1ff` | Moon, title highlight | all three |
| `--color-mint-400` | `#7fe3c6` | Secondary / success | all three |
| `--color-sky-300` | `#9ad7f5` | Info, sky glow, stars | all three |
| `--color-peach-300` | `#f7b89a` | Tertiary category color | Moon-Task, Moon-Browser |
| `--color-cream-100` | `#fbf7f0` | Body text (night) | all three |
| `--color-success-400` | `#7fe3c6` | Success | all three |
| `--color-warning-400` | `#f3c766` | Warning | all three |
| `--color-error-500` | `#e5626b` | Error / danger base | all three |

Other fixed values used by components:

| Value | Use | From |
| --- | --- | --- |
| `#a597f5` | End of the primary button gradient (`lavender-300 → #a597f5`, 135°) | Moon-Task, Moon-Browser |
| `#8676e3` | Meter / chart series 1 | Moon-Task, Moon-Browser |
| `#181338` | Popover background (night) | Moon-Browser |
| `#f28b92` | Danger text (night) | Moon-Task, Moon-Browser |
| `#221b47`, `#fdfbff → #ddd6ff → #a89cf2`, `#8f82e0` | MoonPhase: dark disc, lit gradient, craters | all three |
| `#2a2060 → #0b0920` | App icon tile gradient | Moon-Task logo |

## Semantic tokens (`--me-*`)

These are the same names as Moon-Browser's `--mb-*` and Moon-Task's `--mt-*`,
with Moon Explorer's `me` prefix.

| Token | Night | Day |
| --- | --- | --- |
| `--me-bg` | `#0b0920` | `#f5f2fb` |
| `--me-text` | `#fbf7f0` | `#1c1733` |
| `--me-text-muted` | cream 62% | `#1c1733` 64% |
| `--me-text-faint` | cream 40% | `#1c1733` 42% |
| `--me-border` | lavender-400 18% | violet-700 16% |
| `--me-border-strong` | lavender-400 36% | violet-700 32% |
| `--me-accent` | `#d6cffd` | `#5b4bc4` |
| `--me-focus-ring` | `#d6cffd` | `#6c5ce0` |
| `--me-glass-top` / `-bottom` | night-800 62% / night-900 70% | white 82% / 70% |
| `--me-solid` | `#141030` | `#ffffff` |
| `--me-popover` | `#181338` | `#ffffff` |
| `--me-inset` | night-950 55% | violet-700 5% on white |
| `--me-hover` | white 4% | violet-700 5% |
| `--me-selected` | lavender-400 15% | `#7d6de0` 14% |
| `--me-warning` / `-danger` / `-success` | `#f3c766` / `#f28b92` / `#7fe3c6` | `#a86b00` / `#c2323d` / `#1d7d65` |
| `--me-frame` / `--me-toolbar` | `#0b0920` / `#141030` | `#ece7f7` / `#f7f4fd` (Moon-Browser) |
| `--me-motion` | 180ms (0ms with reduced motion) | |

New for Moon Explorer are the **file-kind colors** `--me-kind-{folder,image,media,code,archive,file}`.
They reuse the palette in the same way as Moon-Task's owner colors: lavender, sky, peach, mint, warning, and muted cream. They always appear next to a name or type label, so color is never the only signal.

The **drive icon tints** `--me-tint-{lavender,sky,mint,peach,gold,rose}` are the colors a user can give a custom drive icon (see [drive-icons.md](drive-icons.md)).
At night they are the palette colors; in the day theme they are the darker variants that the file-kind colors use, so a tinted icon stays readable on white.

## Background and decoration

- **Night background:** three radial glows (lavender 16% top right, violet-700 55% top left, sky 8% bottom) over `linear-gradient(180deg, night-900, night-950 70%)`, fixed. (all three)
- **Day background:** a lavender 28% glow over `linear-gradient(180deg, #f7f4fd, #eee9f8)`. (Moon-Task, Moon-Browser)
- **Sky:** `.me-sky` has two tiled star layers (320px and 540px tiles) and `.me-moon`, a 260px crescent built from an inset box-shadow, rotated -12° at 40% opacity in the top-right corner. Stars are hidden in the day theme.

## Typography

| | Value | From |
| --- | --- | --- |
| UI font | `system-ui, -apple-system, "Segoe UI Variable Text", "Segoe UI", Roboto, "Noto Sans", sans-serif` | Moon-Browser (Moon-Task without Noto) |
| Mono | `ui-monospace, "Cascadia Code", "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace` | Moon-Task, Moon-Browser |
| Base size | 14px, antialiased, `tabular-nums` for numbers | all three |
| App name | `text-xl font-semibold tracking-tight` + `.me-title` gradient (moon-100 → lavender-300 → lavender-400; day: `#2b2160 → #5b4bc4`) | Moon-Task |
| Page heading | `text-2xl font-semibold tracking-tight` | Moon-Task |
| Eyebrow | 11px, 600, `letter-spacing: .12em`, uppercase, accent 75% | all three |
| Buttons / inputs | 13px, weight 550 | Moon-Task, Moon-Browser |
| Table header | 11px, 600, `.06em`, uppercase, muted | Moon-Task |

## Shape, depth and motion

| | Value | From |
| --- | --- | --- |
| Radii | `--radius-md: .75rem` (insets), `--radius-lg: 1.25rem` (glass panels), `.65rem` buttons/inputs, `.7rem` nav items, `.9rem` popovers, `999px` chips/meters | all three |
| Glass | `linear-gradient(glass-top, glass-bottom)`, 1px border, `backdrop-filter: blur(14px)`, shadow `inset 0 1px 0 rgb(255 255 255/.05), 0 24px 60px -30px rgb(0 0 0/.55)` | all three |
| Popover shadow | `0 18px 50px -12px rgb(0 0 0/.6)`; day: `0 18px 50px -14px rgb(43 33 96/.35)` | Moon-Browser |
| Primary glow | `0 8px 24px -10px lavender-400 80%` | Moon-Task, Moon-Browser |
| Focus | `2px solid focus-ring`, offset 2px; inputs get a `0 0 0 3px` lavender 20% ring | all three |
| Control heights | 32px (`h-8`) buttons/inputs, 28px small, 36px nav items, 30px table rows | Moon-Task |
| Motion | 180–200ms transitions, turned off with `prefers-reduced-motion` | all three |
| Scrollbars | thin, lavender 28% thumb | all three |

## Components (`src/theme/tokens.css`)

`.me-glass`, `.me-popover`, `.me-inset`, `.me-title`, `.me-eyebrow`,
`.me-btn` (+ `-primary`, `-ghost`, `-danger`, `-sm`, `-icon`), `.me-icon-btn`,
`.me-input`, `.me-crumb`, `.me-chip` (+ `-mint`, `-warning`, `-danger`, `-muted`),
`.me-table`, `.me-meter`, `.me-switch`, `.me-kbd`, `.me-titlebar`,
`.me-menu-item`, `.me-icon-choice` and `.me-swatch`.

Each one is a straight port of the Moon-Task or Moon-Browser class with the same name.
`.me-titlebar` is new. It is the drag region for a frameless window, following Moon-Terminal and Moon-Browser.
The drive icon picker added `.me-menu-item` (a context menu row), `.me-icon-choice` (a gallery tile) and `.me-swatch` (a round tint swatch). They use the same tokens, radii and motion as the other controls.

The React pieces in `src/theme/` are:

- `Sky.tsx`: the decorative sky (Moon-Task, Moon-Browser)
- `MoonPhase.tsx`: the moon gauge, used here to show drive fill (Moon-Task)
- `icons.tsx`: a 24px grid with 2px round strokes and `currentColor`; it reuses Moon-Browser and Moon-Task paths where they exist. It also holds the drive icon gallery (moon phases, planet, rocket, …), drawn on the same grid
- `useTheme.ts`: the `dark | light | system` choice applied as `data-theme` (Moon-Task's `resolveTheme`)
- `frame-colors.ts`: native frame and window-button colors (Moon-Browser's `FRAME_COLORS`)

## Window chrome

Moon Explorer uses a 40px custom title bar (`TITLE_BAR_HEIGHT`, the same as Moon-Browser's tab strip).
It holds the back, forward, up and refresh buttons, the breadcrumb path in an inset, and search.
The right 138px stay free for the native window buttons.
The bar has the `--me-frame` background and a bottom border.
The shell can use `FRAME_COLORS` for the window's `backgroundColor` and title-bar overlay.

## Reference only: palettes outside the shared look

- **Moon-Terminal**: background `#10121c`, title bar `#14172a`, border `#262a44`, text `#d8dee9`, cursor/yellow `#e0c880`, red `#f7768e`, blue `#7aa2f7`, magenta `#bb9af7`, cyan `#7dcfff`, scrollbar `#414868`. The font is Segoe UI, with a 32px title bar and 44px window buttons.
- **lunabin**: backgrounds `#0a0a0a / #1a1a1a / #2a2a2a`, accent `#8a2be2 → #9932cc`, radii 4/8/12/16px, spacing 4/8/16/24/32px.

## Hooking in OS theme settings

The night/day switch is just `data-theme` on `<html>`.
If a Windows theme reader supplies a light/dark preference, it can call `useDocumentTheme` or set `data-theme` directly.
To pick up a system accent color, it should override `--me-accent` and `--me-focus-ring` on `:root` and leave the palette alone, so the app still looks like a Moon app.
