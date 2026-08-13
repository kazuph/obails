# Obails 91 parity: Alloy + Lean + drift evidence

## Scope and proof boundary

This ledger covers the Wave 0 decision tables plus the command, document-history, and attachment handoff tables assigned to the Alloy/Lean/drift owner. The `current RED` rows below are historical counterexamples captured from the pre-repair implementation at `f745ac77e9715c081b184038881b08b83720e297`; they are deliberately retained. The current uncommitted product working tree is checked against repaired-product anchors by `check-obails-parity-spec.mjs`.

The static models prove finite decision tables only. They do not prove event order, index generations, filesystem races, persistence timing, or that future product code executes the modeled decision exactly. Those require Quint and real product tests.

## Dimension inventory

| Area | Enumerated dimensions | Deliberately unexpressed dimensions |
|---|---|---|
| filename唯一title・新規本文空 | existing body has H1 yes/no; internal title source; pane title source; new-note body empty/forced H1 | frontmatter aliases; non-Markdown files; rename timing; daily-note template behavior |
| duplicate basename link/backlink | duplicate target A/B; repaired outcome selects A/selects B/explicit ambiguity; backlink query target A/B | **selection policy is undecided**: source proximity, folder precedence, walk order, aliases, Markdown links, heading/block fragments, index generation/readiness |
| System Trash / Vault Trash / permanent | configured policy; file/directory; System Trash available/unavailable; resulting action | vault-trash collision naming, restoration/recovery, OS permission failures, symlinks, concurrent external deletion |
| 検索演算子の分類 | plain term, exact phrase, AND, OR, negation, grouping, regex, `file:`, `path:`, `content:`, `match-case:`, `ignore-case:`, `tag:`, `line:`, `block:`, `section:`, `task:`, `task-todo:`, `task-done:`, property query | parser precedence details, escaping, Unicode normalization, regex errors, result ranking/sort/context, Canvas search, excluded-file rules |
| UI capabilityと設定反映 | in-app Settings; theme; font size/family; line numbers; word wrap; sidebar width; delete policy; represented/UI/applied/persisted state | hotkeys, session/tabs/splits, accessibility focus/ARIA, platform-specific native menus, partial persistence failure and restart timing |
| command descriptor → palette dispatch / hotkey | palette/new-note/graph descriptor presence; palette dispatch target; one hotkey per command | command predicates, scope-specific conflict policy, editable-target suppression, native menu routing |
| path + kind document history lifecycle | Markdown/TXT record, migration, deletion/drop, undo, redo; path-and-kind key isolation | snapshot contents, selection/scroll fidelity, memory bounds, browser undo interoperability, rename event timing |
| attachment destination → import → embed insertion | note-folder/vault-root/configured-folder × source exists × Markdown target; destination, import, insertion | filename collision UX, multi-file partial failure policy, binary MIME preview, save-failure recovery, drag-and-drop event order |

The inventory was checked both before and after modeling. A green proof is limited to these explicit finite domains.

## Current RED

1. `NoteService.Title` uses `extractTitle` and prefers the first H1, while `main.ts` `openNote` derives pane title directly from the basename. This is a two-source internal/display title contract. New note creation also writes ``# ${initialTitle}\n\n`` instead of an empty body.
2. `registerPathIndex` preserves the first duplicate-basename winner, while backlinks are recorded under the raw link text and the resolved path; `GetBacklinks` queries both `relativePath` and `baseName`. A source resolved to target A can therefore be attributed to same-basename target B.
3. The GUI calls `FileService.DeletePath`, whose file and directory branches use `os.Remove`/`os.RemoveAll`. `TrashPath` exists but is not the GUI path, and no System/Vault/permanent policy is represented in `Config`.
4. The GUI file search lowercases and performs `data-name.includes(query)`. The backend content search is literal line matching with a separate case flag, and is exposed to the CLI, not to an Obsidian-operator parser in the GUI.
5. The Settings button opens the TOML file externally. Theme is read, applied, and persisted. Font size/family, line numbers, word wrap, and sidebar width are represented in Go config but are not applied by `main.ts`; delete policy and an in-app Settings capability are absent.
6. The historical command table permits a duplicated `Cmd+P`, omits the graph descriptor, and leaves a descriptor without palette dispatch. This is retained as a finite historical model, not a statement about the current working tree.
7. The historical history table keys by path alone and leaves the source timeline after migration/delete, so Markdown and TXT can alias and lifecycle operations cannot establish isolation.
8. The historical attachment table accepts a valid import at the vault root regardless of the selected configured destination and never inserts the returned embed through the editor input path.

## Current repaired-product anchor coverage

The normal drift GREEN proves the following source-level connections in the current working tree, not a full product acceptance result:

1. `NoteService.extractTitle` derives the title from the path basename, every ordinary new-note route calls `CreateFile(path, "")`, and `openNote` presents `getDisplayName(path, "file")`.
2. Link indexing sorts paths before retaining a duplicate-basename winner, assigns `TargetPath` during resolution, and writes/reads backlinks exclusively under that resolved target path.
3. The UI calls `FileService.Delete`; the service dispatches the persisted `system_trash`, `vault_trash`, and `permanent` modes, and `DefaultConfig` selects `system_trash`.
4. The vault-search dialog sends `createVaultSearchOptions` to `SearchService.Search`, which parses the full operator expression including structural and property operators.
5. The current tree exposes in-app controls for theme, font size/family, line numbers, word wrap, sidebar widths, and delete policy; applies them to the running UI; and persists them through ConfigService/StateService. This is repaired-product source and unit/integration evidence, while native restart acceptance remains separate.
6. `GetCommandDescriptors` supplies `commandSnapshot`; palette activation and hotkeys both call `executeCommand`, while `SetHotkey` rejects same-scope conflicts before the snapshot is refreshed.
7. `DocumentHistory` uses `JSON.stringify([path, kind])`; `migrate` moves the exact timeline and `drop` removes it after deletion/missing-file recovery.
8. `ImportAttachment(sourcePath, notePath)` selects the configured destination; the drop path collects returned embeds, applies `insertAttachmentEmbeds`, then dispatches `input` so the normal save pipeline owns the resulting edit.

Historical current RED artifacts and current repaired-product anchors are intentionally separate. Removing the former would erase the counterexamples; treating source anchors alone as native acceptance would overstate the product.

## Repaired candidate invariants

1. Filename is the sole internal and displayed title source. A newly created ordinary note has an empty body. An existing H1 remains ordinary body content.
2. A duplicate basename follows the minimum invariant **単一解決または明示的曖昧**: it produces either exactly one resolved destination or an explicit ambiguous outcome. If resolved, backlink ownership equals that destination; if ambiguous, no target owns the backlink. **Which target to select, or whether to select at all, remains an explicit product-policy decision.**
3. System Trash is the default. Vault Trash and permanent deletion occur only when explicitly configured. An unavailable System Trash operation fails closed rather than falling back to permanent deletion.
4. Every official syntax family is classified exactly once into term, boolean, regex, scope, case, structural, or property evaluation.
5. Every declared UI setting capability is represented, available in-app, applied to the running UI, and persisted. The current tree satisfies the source-level and automated-test contract; native restart acceptance remains pending.
6. Every published command descriptor has exactly one palette dispatch target and no duplicate hotkey in the finite global command set.
7. A history timeline is identified by both path and editable kind; migration removes the old identity, drop removes deleted identity, and undo/redo remain reachable for the retained identity.
8. A valid Markdown attachment import uses its selected destination and commits exactly one returned embed insertion; invalid source or non-Markdown target imports and inserts neither.

## Canonical → implementation → formal → product-test correspondence

| Canonical decision | Historical current anchor / current repaired-product anchor | Lean theorem / Alloy command | Current or required product contract |
|---|---|---|---|
| Filename is the only title; ordinary new body is empty | Historical: H1 title source / forced H1. Current: `extractTitle(_, path)` uses `filepath.Base`, `CreateFile(path, "")`, and `getDisplayName(path, "file")` | `currentTitleIsRed`, `repairedTitleIsGreen`; `CurrentTitleMeetsCanonicalContract`, `RepairedTitleMeetsCanonicalContract` | Current Go/Vitest contract is linked in P-001/P-002. Native acceptance remains in the traceability ledger. |
| Duplicate basename is single-resolved or explicitly ambiguous; backlink owner equals destination | Historical: raw basename backlink lookup. Current: sorted path index, resolved `TargetPath`, and `backward[TargetPath]` only | `currentDuplicateBacklinkIsRed`, `repairedDuplicateLinkIsGreen`; three duplicate-resolution repaired asserts | `TestLinkService_RebuildIndex_AssignsDuplicateBacklinkToResolvedWinnerOnly` covers the current selected-winner policy. |
| System Trash default; Vault Trash/permanent explicit; no permanent fallback | Historical: UI `DeletePath`. Current: `FileService.Delete`, `GetDeleteMode`, three explicit switch cases, default System Trash | `currentDeleteIsRed`, `repairedDeleteIsGreen`, `repairedSystemTrashFailsClosed`; current/repaired delete asserts | Go/Vitest/E2E contracts are linked in P-069–P-072. Native acceptance remains pending. |
| Search syntax has an explicit classification | Historical: file-name substring / legacy literal line search. Current: `SearchService.Search` → `parseSearchQuery` and operator/property nodes | `currentSearchIsRed`, `repairedSearchIsGreen`, `repairedSearchEnumerationIsComplete`; current/repaired search asserts | Go/Vitest/E2E contracts are linked in P-050–P-053. Native acceptance remains pending. |
| UI settings are in-app, applied, and persisted | Historical: only theme. Current: in-app theme/editor/sidebar/delete controls apply to DOM/CSS and persist through ConfigService/StateService | `currentCapabilitiesAreRed`, `currentThemeCapabilityIsConnected`, `repairedCapabilitiesAreGreen`; current/repaired capability asserts | Backend config/state integration tests and frontend settings tests cover the automated contract; native restart acceptance remains pending. |
| Command descriptor reaches palette dispatch without a hotkey conflict | Historical: duplicate `Cmd+P`, graph descriptor absent. Current: descriptors flow through `commandSnapshot`, `executeCommand`, and `SetHotkey` | `currentCommandDescriptorPaletteIsRed`, `repairedCommandDescriptorPaletteIsGreen`; current/repaired command asserts and `RepairedCommandNonVacuity` | `settings_state_test.go` covers normalized conflict rejection; frontend command registry tests cover dispatch filtering and key matching. |
| Document history is isolated by path and kind across record/migrate/drop/undo/redo | Historical: path-only key and retained old timeline. Current: `DocumentHistory` key, `migrate`, `drop`, `undo`, `redo` | `currentPathKindHistoryLifecycleIsRed`, `repairedPathKindHistoryLifecycleIsGreen`; current/repaired lifecycle asserts and `RepairedHistoryNonVacuity` | `document-history.test.ts` covers exact identity and lifecycle behavior. |
| Attachment destination, import result, and embed insertion agree | Historical: vault-root import and no editor insertion. Current: `ImportAttachment`, `insertAttachmentEmbeds`, input event | `currentAttachmentDestinationImportEmbedIsRed`, `repairedAttachmentDestinationImportEmbedIsGreen`; current/repaired attachment asserts and `RepairedAttachmentNonVacuity` | `file_service_test.go` and `attachment-drop.test.ts` cover import destination and insertion behavior. |

## Commands and expected evidence

```text
cd scripts/dspec && lean ObailsParitySpec.lean
# current lists/counts are non-empty; every repaired list prints []

java -jar /tmp/org.alloytools.alloy.dist-6.2.0.jar exec -f -c '*' \
  -o /tmp/obails-alloy-evidence -t json scripts/dspec/obails-parity.als
# eight Current* checks have counterexamples; nine Repaired* checks are UNSAT;
# repaired non-vacuity witnesses and both aggregate witnesses are SAT

DSPEC_MUTATE_ANCHOR=title-filename-source node scripts/dspec/check-obails-parity-spec.mjs
# intentional drift RED, exit 1

node scripts/dspec/check-obails-parity-spec.mjs
# drift GREEN
```

## Sources

- Repository canonical: `.codex/obails-91-parity-rules.md`
- Obsidian internal-link formats and vault-root paths: <https://obsidian.md/help/Linking%2Bnotes%2Band%2Bfiles/Internal%2Blinks>
- Obsidian search terms, operators, regex, and case behavior: <https://obsidian.md/help/Plugins/Search>

The official help documents path-capable links but does not specify the duplicate-basename winner. This ledger therefore does not invent proximity, traversal-order, or another winner policy.
