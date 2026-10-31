# Design foundation

> **Update:** the look is now the [stdf](https://stdf.dev) component library (MIT) with its built-in **Starbucks** theme (green and warm neutrals). Only the colours come from the theme; radius, spacing and type are the app's own tokens. `Button` is the stdf component behind an app-level wrapper; the form fields (`Input`, `Select`), the grid cell editors and the native `<dialog>` stay native, sharing one field look (surface fill, one border, the shared radius, semibold label above, custom select chevron), (stdf's Input has a different markup that cannot match the select, and it and its Dialog have no per-field aria attributes, refs, `role="dialog"` or Escape handling, which the keyboard grid and accessibility work rely on) and are coloured by the tokens below, which are defined as `color-mix()` and `var()` expressions over the theme's palette variables (never hard-coded hex values). The Apple HIG sections below describe the earlier foundation; the accessibility targets (44px controls, 4.5:1 contrast, visible focus) still apply.
>
> - Tailwind 4 + stdf are set up in `src/lib/styles/stdf.css`; `<html data-theme="Starbucks">` selects the theme (change `name` there and in `app.html` to re-skin). stdf's theme plugin only defines CSS variables, so the `@theme inline` block in that file registers them as Tailwind colours.
> - stdf defaults to Chinese text, so `+layout.svelte` wraps the app in `ConfigProvider locale={en_US}`.
> - The app's own light/dark switch attribute is `data-appearance` (it used to be `data-theme`, which stdf owns).

Apple-inspired visual foundation for BuBu: CSS tokens plus five base Svelte 5 components.

## LUL-68 redesign (Apple design skill applied to the stdf Starbucks theme)

The `apple-design` skill was run as a design review/improvement pass (platform: desktop-first web app; references read: `accessibility`, `layout`, `typography`, `color`, `buttons`, `menus`, `context-menus`, `toolbars`, `lists-and-tables`, `designing-for-macos`). Decisions, all expressed as tokens in `src/lib/styles/tokens.css` (and applied to stdf through `src/lib/styles/stdf.css`):

| Area | Decision | Source |
| --- | --- | --- |
| Type scale | caption 11, footnote 12, callout 13, body 14, title3 15, title2 17, title 22, large title 26 px; bold for titles, semibold for emphasis. Body is 14px, one step above macOS's 13pt, as a web judgment; nothing is below the 11pt minimum | `typography.md › macOS built-in text styles` |
| Radius scale | 6 (icon buttons, chips) / 10 (buttons, fields, menu items) / 14 (cards, menus, table) / 20 (dialogs) / full. Nested shapes step down one level. stdf's `--radius-form/box/small` are mapped onto the same scale | judgment, concentric corners |
| Controls | 32px (28pt desktop default plus focus-ring room); 44px under `(pointer: coarse)`. Icon buttons 28px | `accessibility.md › Controls` |
| Icon buttons | One accessible name each (`aria-label`), a tooltip with the shortcut on hover (after a delay) and on keyboard focus, dismissed by Escape; the tooltip is visual only so the name is not announced twice | `toolbars.md`, WCAG 1.4.13 |
| Menus | On Budget cards the "⋯" button and right-click open the same menu: icons, destructive item last and in the danger colour behind a separator, at most three groups, one level | `context-menus.md`, `menus.md` |
| Toolbar | Undo/Redo and Collapse/Expand all as two icon groups (max three groups); text only where symbols are unclear | `toolbars.md › Item groupings` |
| Colour | Starbucks palette, derived from the theme variables in light and dark; one colour, one meaning (accent for primary action and links, danger only for destructive); contrast checked in tests | `color.md` |

New shared components (`src/lib/components`): `Icon`, `IconButton` (stdf `Button` underneath, plus tooltip), `Menu` (popover menu with arrow-key navigation), `MoreMenu`. stdf's own `Tooltip` (click only) and `ActionPopover` (no menu roles or keyboard handling) were not usable for the accessibility requirements, so those two behaviours are built here on the shared tokens.

Budgets list: a plain list, not boxed cards: bold name, then currency and item count, the Budget's total on the right, hairline separators, a soft highlight on hover, and the "⋯" menu revealed on hover or focus (always visible on touch screens).

Scrolling (LUL-69): the editor is exactly one window tall and does not scroll. The table is one native `overflow: auto` container (stdf has no scroll-area component) whose header row and "New item" row are `position: sticky` with opaque backgrounds, so their columns are the rows' own columns and cannot drift. The header's and footer's heights become `scroll-padding`, so keyboard focus never lands underneath them; the separators darken when rows are scrolled under the header or hidden below the footer. The table has a 58rem minimum width so the Description stays readable on small screens, and the "New item" button is pinned to the visible width so it stays clickable there.

Editor: the table spans the window (page padding only), rows are compact, row actions are hover/focus icon buttons (touch screens keep them visible; no right-click menu in the table, so the browser menu works in cells), "New item" is the last row, and the Budget name renames in place (double-click, or the pencil, which is the keyboard route).

### Table hierarchy and cells (LUL-68 follow-up)

Guided by `outline-views.md` ("Expose data hierarchy in the first column only", disclosure triangles, indentation) and `lists-and-tables.md` (separators, optional alternating rows). Combination chosen, kept subtle:

- **Group rows** get a translucent tint of the theme accent that fades with depth (`--tint-depth-0/1/2`: 11%, 7%, 4% in light) and heavier text, so they read as section headers.
- **Accent bar:** a 3px bar of the theme accent on the left edge of every row inside a top-level Group's section (the Group and all its descendants), so each section is easy to follow. Top-level Lines have none.
- **First column carries the structure:** disclosure chevron, then the Code, indented per level; Lines get an empty spacer of the chevron's width so Codes align at the same depth. The Description indents with depth too.
- Not used: depth-coloured rainbows, vertical guide lines (extra ink for information the first column already gives) and zebra stripes.
- **Not colour alone:** indentation, weight, chevrons and the Codes themselves say the same thing. Hover and selection are overlays (`linear-gradient`) on top of the tint; the cell focus ring is unchanged.
- **Cells:** no fill for read-only cells. Editable cells show a text cursor and the field border on hover and focus; read-only values (Code, Group Unit price) are muted with a default cursor; Total stays full-strength and bold. The table has no outline, only 1px row separators.
- **Contrast:** tests compute WCAG contrast of every cell's text on its real background (all translucent layers composited) in light and dark, including hover.

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
