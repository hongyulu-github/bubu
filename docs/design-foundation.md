# Design foundation

> **Update:** the look is now the [stdf](https://stdf.dev) component library (MIT) with its built-in **Cherry** theme: raspberry pink on a pale pink canvas, big rounded corners, pill-shaped fields. `Button` and the Name fields (`TextField`) are stdf components behind the same app-level wrappers; the grid cell editors, the native `<dialog>` and the currency `<select>` stay native (stdf's Input/Dialog have no per-field aria attributes, refs, `role="dialog"` or Escape handling, which the keyboard grid and accessibility work rely on) and are coloured by the tokens below, which now carry Cherry's palette. The Apple HIG sections below describe the earlier foundation; the accessibility targets (44px controls, 4.5:1 contrast, visible focus) still apply.
>
> - Tailwind 4 + stdf are set up in `src/lib/styles/stdf.css`; `<html data-theme="Cherry">` selects the theme (change `name` there and in `app.html` to re-skin). stdf's theme plugin only defines CSS variables, so the `@theme inline` block in that file registers them as Tailwind colours.
> - stdf defaults to Chinese text, so `+layout.svelte` wraps the app in `ConfigProvider locale={en_US}`.
> - The app's own light/dark switch attribute is `data-appearance` (it used to be `data-theme`, which stdf owns).

Apple-inspired visual foundation for BuBu: CSS tokens plus five base Svelte 5 components.

## Source and license

- **Design reference:** [`dickwu/apple-design-skill`](https://github.com/dickwu/apple-design-skill), an agent skill that reviews UI against Apple's Human Interface Guidelines (HIG).
- **License status:** the repository has **no open-source license file** (GitHub reports none), and its README says the skill is "provided as they are" and that the guideline text belongs to Apple Inc. It is therefore **not openly licensed**, so it is used strictly as a *reference*:
  - no code, text or assets from the skill or from Apple's HIG are copied into this repository;
  - the skill itself is not committed (it lives untracked in `.agents/`);
  - the tokens and components here are original code (MIT-compatible, owned by this project), written to follow the HIG guidance cited below.
- **No React:** the skill contains no component code to port. Every component is written directly in Svelte 5 (runes), and `react` is not a dependency.
- **If an openly licensed source is required**, swap the reference for one with a license file and update this section; nothing in the code depends on the skill.

### HIG guidance applied

| Area | Guidance followed |
| --- | --- |
| Buttons | Primary style for the likely action; never primary for a destructive action; a visible pressed state (`buttons.md`) |
| Text fields | Label plus hint, validate dynamically, numeric input constrained (`text-fields.md`) |
| Dark mode | Follow the OS setting, no app-specific appearance switch, semantic colours, 4.5:1 minimum contrast (`dark-mode.md`) |
| Motion | Brief, purposeful, optional; none for frequent interactions (`motion.md`) |
| Accessibility | 44px targets, 4.5:1 text contrast, visible keyboard focus (`accessibility.md`) |

## Tokens

Defined in `src/lib/styles/tokens.css`, loaded by `src/routes/+layout.svelte`.

- **Colour:** background, surface, text, secondary text, borders, accent, danger, focus ring, selection, disabled, overlay. Light and dark values; dark applies via `prefers-color-scheme`, and `data-appearance="light|dark"` on `<html>` forces a theme (used by tests and the `/design` preview, not exposed to users).
- **Spacing:** `--space-1` to `--space-8` (4px base).
- **Type:** system stack `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; sizes caption to display; no bundled SF Pro.
- **Radii:** `--radius-sm|md|lg|full`.
- **Motion:** `--duration-fast|base`; reduced motion is respected.

Contrast, light / dark: body text on surface 16.8 / 12.8, secondary text 5.1 / 5.4, primary button 5.6 / 7.0, destructive 5.4 / 7.5, control borders 3.6 / 4.3 (all above WCAG AA: 4.5 for text, 3 for UI boundaries).

## Components (`src/lib/components`)

| Component | Notes |
| --- | --- |
| `Button` | `primary`, `secondary`, `destructive`; native `<button>` so Enter/Space work; disabled state; focus ring |
| `Input` | Required `label`, `hint`, `error` (sets `aria-invalid`, announced politely), disabled |
| `NumberInput` | Built on `Input`; `oninput`/`onchange` emit `number \| null`; `min`, `max`, `required`; validation shown after the field is touched. Plain decimal notation only (locale-aware parsing belongs to the decimal helpers) |
| `Dialog` | Native modal `<dialog>`: focus moves in on open, Escape or backdrop click cancels, focus returns to the opener; `bind:open`, `title`, `description`, `footer` snippet. Subtle Svelte `scale`/`fade` on entry |
| `TableCell` | `<td>` or `<th>` (`header`); `numeric` (right-aligned tabular figures), `selected`, `invalid`, focus ring when focusable |

Import with `import { Button, Dialog, Input, NumberInput, TableCell } from '#lib'`.

Run `npm run dev` and open `/design` for a preview of everything in both themes.

## Tests

Browser component tests (`*.svelte.spec.ts`, real Chromium) cover, per component: both themes (computed contrast), focus visibility, disabled state; NumberInput events and validation; Button Enter/Space activation; Dialog focus entry, Escape/Cancel and focus return.
