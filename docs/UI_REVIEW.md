# Desktop UI direction

The previous card-based Quick/All mechanics redesign was replaced at the user's request with a desktop workspace visually modeled on [Path of Building Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding).

## Reference and adaptation

The repository's [Items screenshot](https://github.com/user-attachments/assets/e5af1326-7e22-43d8-ab12-aa5500da611a) guided the layout: a narrow left navigation/statistics panel, a compact top build bar, a black editor canvas, small rectangular controls, thin gray borders and selective color-coded numbers. Styling is original CSS; no PoB artwork, fonts or application code is included. Heroes of Hammerwatch mechanics and terminology are retained rather than inventing PoE features such as a passive tree.

## Workspace

- **Build bar:** saved builds, New/Copy/Delete, editable name, level, class and specialization. Import/export remains available in the title bar.
- **Left panel:** real editor tabs, weapon-first Main skill selector, maximum health/mana/armor, core damage/timing stats, attribute totals, power/critical stats, target armor and comparison build.
- **Right editor:** Character, Skills, Items, Trinkets, Upgrades, Configuration and Calcs. On desktop this region scrolls independently of the sidebar. On narrow screens the panels stack.
- **Items:** occupied/empty equipment-slot rows beside inventory. Occupied slots open their editor; empty slots preselect the appropriate slot for item creation. Two-handed occupancy is explicit.
- **Calcs:** component base/normal/critical/expected damage, contacts, cycle damage, DPS, timing, derived stats, exclusions, formulas and source references. Incoming-hit controls are permanently expanded here.

There is no global presentation mode. Structural setting groups open by default, while raw definitions remain individually expandable. Open/closed state survives edits and is kept separately from builds under `hammerforge.ui.panels.v2`; the rejected detail-mode preference is ignored.

## Integrity constraints

Weapon-first ordering, source provenance, partial-estimate warnings, native import/export, independent build copies and all existing calculation inputs remain intact. UI colors distinguish attributes and resource types; blue source-modifier text is not a claim that every raw modifier is modeled. Unresolved/unsupported effects still carry explicit exclusions. The changes do not add or recalibrate combat mechanics.

## Validation

Unit tests exercise per-panel state, the same model result rendered into sidebar and Calcs, unavailable-skill status, unique HTML IDs and the inline incoming-hit section. The complete verification suite also covers the existing calculations, imports and progression editor.

Live headless Chromium checks exercised Character/Skills/Items/Upgrades/Configuration/Calcs navigation, keyboard tabs, item creation from an empty slot, item editing, two-handed occupancy, weapon-first focus ordering, progression/combo edits, incoming-hit scenarios, build copy/delete, JSON export/import roundtrip, native-import controls and reload. Geometry checks verified the narrow left sidebar and independent desktop scrolling. Screens were checked for horizontal page overflow at 390, 768, 1024, 1440 and 1920 px; screenshots were reviewed against the PoB reference. Browser tooling and screenshots remained outside the application workspace.

## Interaction regression and fix

A subsequent real-input review reproduced lost clicks: changing a number and clicking the next field committed the first field on blur, synchronously rebuilding the editor between pointer-down and pointer-up. The target node disappeared and typing went to the document rather than the next input. Earlier automation dispatched several change events directly, so it did not reproduce that event sequence.

`ui-render.js` now coalesces render jobs and waits until pointer gestures and click dispatch finish. It retains the newly focused control and its draft/caret across DOM replacement, without overriding checkbox/select model values or stealing deliberate modal focus. Main, focused-calculation, equipment and survival refreshes use the same scheduler. Initial rendering remains synchronous so startup failures still reach the existing loading-error message. The PoB-style layout and calculation inputs are unchanged.

`mise run test:ui` runs `scripts/test-ui.mjs` against a local development server, using actual clicks, held mouse-down, typing, Tab and native select interaction—no synthetic change dispatch. Start `mise run dev` separately. Browser tooling is optional and not an application dependency: set `PLAYWRIGHT_MODULE` to a separate Playwright installation's `index.mjs`, `CHROME_BIN` if using a system Chromium, and `UI_TEST_URL` if not using the default `http://localhost:5173`. The regression covers adjacent attributes/progression, native dropdown cancel, skill ranks, combos, hit scenarios, trinket quantity-to-attunement and item creation.
