# Accessibility walkthrough (LUL-28)

**What this is and is not.** This is a walkthrough of the browser's *accessibility tree* (Playwright `ariaSnapshot`, which is what a screen reader reads), taken on the built site at 1440×900, flow by flow. It is **not** a VoiceOver, NVDA or JAWS session: nobody listened to a screen reader here. The checklist at the end is for the person who does that, on the same flows.

## Flows walked and what the tree says

| Flow | What a reader finds |
| --- | --- |
| Landing, drawer closed | One `h1`. "Create a budget" and "My budgets" are buttons with `aria-haspopup="dialog"` and `aria-expanded="false"`. |
| Open "My budgets" | A `dialog` named "My budgets" (its heading), a "Close" button, "More actions", and the list. The opener becomes `expanded`; the other opener stays collapsed. |
| New-Budget form, empty submit | `dialog "New budget"`. Name and Currency are `invalid`, each with its message (and the hint) as its description. Focus goes to the first invalid field. |
| Budget editor | `treegrid "Budget Items"` with column headers Code, Description, Quantity, Unit, Unit price, Total (+ Actions), each `scope="col"`. Every row has a level (`aria-level`), and every Group row says whether it is open (`aria-expanded`). Inputs are named "Description 1.1", "Quantity 1.1" and so on; the icon buttons are named "Add item below 1.1", "Add child to 1.1", "Delete 1.1". |
| Collapse and expand a Group | The toggle is "Collapse 1" / "Expand 1" with `aria-expanded`; the row's `aria-expanded` follows, and the hidden rows are removed from the tree. |
| Computed cells | Code, Total and a Group's Unit price are `aria-readonly="true"` and contain no input; editable cells have an input and no `aria-readonly`. |
| Delete a Group | `dialog "Delete “…”?"`, described by what will be removed, with the list of Items labelled "Items that will be deleted". |

## Blockers found and fixed

1. **The table was a `grid`**, which cannot carry a hierarchy. It is now a `treegrid`: each row has `aria-level`, each Group row `aria-expanded`.
2. **Computed and editable cells sounded the same.** Computed cells now carry `aria-readonly="true"`.
3. **The openers did not say they open a dialog or whether it is open.** They now have `aria-haspopup="dialog"` and `aria-expanded`.
4. **The drawer header was exposed as a second `banner` landmark.** It is a plain `div` now.
5. **The Currency select listed two placeholders** ("Choose option ..." from the component library, then "Choose a currency"). The library's is removed.

Already right and left alone: dialog titles, field labels, error text tied to fields with `aria-invalid` and `aria-describedby`, icon-button names, header scopes.

## Known limits

- The Group toggle's name changes ("Collapse 1" / "Expand 1") as well as its `aria-expanded`. Some guidance prefers a fixed name with only the state changing; changing it would touch many tests and the behaviour reads clearly, so it was left.
- Cell values are read as the cell content ("0.00") with the column header from the grid; there is no per-cell extra label.

## Checklist for a real screen-reader pass (not yet done)

- [ ] VoiceOver (Safari) and NVDA (Firefox or Chrome): open the drawer from "My budgets"; hear the dialog name and that the button is expanded; close it and hear focus return.
- [ ] Move through the treegrid by row and column: hear the column header with each cell, the level of each row, and "collapsed" or "expanded" on Groups.
- [ ] Collapse a Group and confirm its rows are no longer reachable.
- [ ] Type an invalid Quantity: hear it announced as invalid with its message.
- [ ] Delete a Group: hear the dialog title and description, and where focus lands afterwards.
