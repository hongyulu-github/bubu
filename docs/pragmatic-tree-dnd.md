# Tree drag and drop with Pragmatic (LUL-6 prototype notes)

Working demo: run `npm run dev` and open `/prototypes/tree-dnd`. It is isolated from the editor: it
has its own fixture and local state and never touches the Budget store, history or storage.

| File | Role |
| --- | --- |
| `src/lib/prototypes/tree-dnd/TreeDndDemo.svelte` | The demo: Pragmatic wiring, drop feedback, status line |
| `src/lib/prototypes/tree-dnd/move.ts` | Pure flat-array move (`moveItem`, `rejectionFor`). Prototype only |
| `src/lib/prototypes/tree-dnd/fixture.ts` | Small flat Item fixture |
| `*.spec.ts` | Move logic unit tests; browser tests that really drag rows in Chromium |

Packages: `@atlaskit/pragmatic-drag-and-drop` 4.x and `@atlaskit/pragmatic-drag-and-drop-hitbox` 3.x
(both Apache-2.0, no framework dependency).

## What to reuse in LUL-13

**Wiring per row.** Pragmatic works on plain DOM elements, so a Svelte attachment is the natural fit.
One attachment makes a row both draggable and a drop target, and returns the cleanup function:

```svelte
{@attach rowDnd(item.id, hasChildren)}
```
```ts
(node) => combine(
  draggable({ element: node, getInitialData: () => ({ type: 'tree-row', id }) }),
  dropTargetForElements({
    element: node,
    canDrop: ({ source }) => source.data.type === 'tree-row',
    getData: ({ input, element, source }) => attachInstruction({ id }, { input, element, operations })
  })
)
```
A single `monitorForElements` inside an `$effect` (returning its cleanup) handles the drop for the
whole tree; `location.current.dropTargets[0]` is the innermost target. Use one `$state` for the
current indicator (`{ targetId, kind }`) and render it from a `data-drop` attribute.

**Hitbox: `list-item`, not `tree-item`.** The ticket named the tree-item helpers, but Atlassian's docs
now mark `tree-item` as superseded by `list-item`, so the prototype uses `list-item`:

| Instruction | Meaning here | Where on the row |
| --- | --- | --- |
| `reorder-before` | before | top quarter |
| `combine` | inside (becomes a child) | middle half |
| `reorder-after` | after | bottom quarter |

- Per-operation availability is `available`, `not-available` or `blocked`; the hitbox re-divides the
  row to fit. `blocked` instructions still arrive in `onDrop` (check `instruction.blocked`), and are
  what draws the red feedback.
- Dropping a parent onto itself returns no operations (no feedback). Dropping onto any of its
  descendants is `blocked` on all three operations. Both rejections also live in pure code
  (`rejectionFor`), so the drop handler never trusts the UI alone. In production use `canMoveUnder`
  from `tree.ts` for the same check.
- For an item that shows its children, `reorder-after` is `not-available` (below it visually means
  "inside"); the last child covers that position.
- `tree-item` additionally offers horizontal "reparent" by indent level. The prototype does not use
  it; if LUL-13 wants indent-based reparenting it must come from there.

**Moving a parent with its descendants** needs no extra work in a flat model: descendants keep their
own `parentId`, so changing only the dragged Item's `parentId`/`sortIndex` moves the whole subtree
(`movedIds` reports it). Re-number the destination siblings' `sortIndex` so ordering is exact.

## Gotchas found

- **Static build (SSR).** The Atlaskit packages expose subpaths such as `.../combine` as directories
  with no `exports` map. Node's ESM loader cannot import those, so prerender failed with
  `ERR_UNSUPPORTED_DIR_IMPORT`. Fix, already in `vite.config.ts`:
  `ssr.noExternal: ['@atlaskit/pragmatic-drag-and-drop', '@atlaskit/pragmatic-drag-and-drop-hitbox']`.
  Pragmatic reads no browser global at import time, so prerendering works once it is bundled.
- **Attachment churn.** `{@attach rowDnd(...)}` is re-run when its expression's inputs change. Pass
  stable values (the id) and read live state inside the callbacks (`getData`, `canDrop`) rather than
  capturing objects that are replaced on every move.
- **Pointer only.** Pragmatic uses native HTML5 drag and drop: no keyboard path. Keyboard-accessible
  moves are LUL-66 and must be built separately. Touch behaviour (long-press drag on iOS/Android)
  was not verified on devices here.
- **Selection and text.** Rows use `user-select: none`; otherwise dragging starts text selection.

## Testing notes

Vitest browser mode (real Chromium) drives native drag and drop with
`userEvent.dragAndDrop(source, target, { targetPosition })`. Choose `targetPosition` inside the
row's bounding box to hit the before / inside / after zones (y near 0 is before, the middle is
inside). The tests assert both the resulting outline and the status message.
