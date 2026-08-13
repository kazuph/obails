# Obails 91 parity: Quint result and command manifest

## Outcome

- Historical-current corpus: **RED, 12/12 targeted counterexamples saved**. The aggregate ten cover Markdown/TXT/HTML switch loss, external overwrite/delete/rename resurrection, link readiness/generation, stale task reference, and post-validation task overwrite; two dedicated popout-route traces add shared-active-pane theft and stale child mutation after rejoin (`job-1786356684647-4453-113`).
- Repaired candidate: **GREEN for the aggregate ten safety properties** under Quint random exploration at 200,000 samples × 40 steps, seed `0x0ba12010`, Rust backend, plus the dedicated exact-popout-pair safety invariant at 100,000 samples × 10 steps (`job-1786356684690-4453-114`).
- Non-vacuity: **16/16 expected reachability witnesses saved** for three format flushes, fresh external save, three post-validation external reject branches, readiness rejection, a generation-pinned read, fresh/stale/post-validation task paths, restore-close/rejoin workspace paths, live exact-route mutation, and stale-route rejection (`job-1786356684690-4453-114`).
- Alloy's finite tables separately retain eight historical current counterexamples, nine repaired UNSAT assertions, and three repaired SAT non-vacuity witnesses (`job-1786345001309-76529-240`).

The historical-current model is not the current product source. Current repaired-product source anchors (captured save/CAS, readiness snapshot, pinned graph/backlinks, and task CAS commit) are checked by `scripts/dspec/check-obails-parity-spec.mjs`. That drift GREEN is source-connection evidence only and does not replace this historical RED corpus or the model checks.

## Final frozen-tree rerun (2026-08-12)

| Gate | Final result | Herdr job |
| --- | --- | --- |
| Lean decision tables | Historical current violations remain reachable; all eight repaired violation lists are empty | `job-1786528156735-6985-1268` |
| Alloy finite scopes | Eight historical current assertions SAT; nine repaired assertions UNSAT; repaired witnesses SAT | `job-1786528156770-6985-1269` |
| Product-anchor drift mutation | Expected RED: `title-pane-filename-source` mutation produces exactly one violation | `job-1786528182728-6985-1275` |
| Product-anchor drift | GREEN: 19 implementation anchors and 6 formal/matrix anchors | `job-1786528156869-6985-1271` |
| Historical Quint corpus | `CURRENT_RED_12_OF_12` | `job-1786528157278-6985-1272` |
| Repaired Quint safety and reachability | 200,000 × 40 aggregate safety plus 100,000 × 10 exact-popout safety GREEN; `REPAIRED_GREEN_AND_REACHABLE_16_OF_16` | `job-1786528158962-6985-1273` |
| Apalache bounded verification | Version 0.56.1, 14 steps, 13 verification conditions, `NoError` | `job-1786528159155-6985-1274` |

These are the final reruns against the frozen product anchors. Older jobs below remain provenance for the saved historical counterexamples and dedicated popout traces, not the final acceptance run.

## Identity

| Item | Value |
| --- | --- |
| Historical formal execution | `2026-08-10T12:36:55+09:00` |
| Historical product source commit | `f745ac77e9715c081b184038881b08b83720e297` |
| Current repaired-product anchor source | uncommitted working tree at `f745ac77e9715c081b184038881b08b83720e297`; checker records only named source connections |
| Model commit | uncommitted working tree; commit was prohibited |
| Current model SHA-256 | `924625213657ae0cfa3b24c4ac8e6a6f21dff544bc14f095485161a69fa6e875` |
| Repaired model SHA-256 | `e8c8b5008571678f256a8154c625d02eb7c9c2d34fa9fae6ab6fd127f4786fb0` |
| Quint | `@informalsystems/quint@0.32.0`, exact version confirmed by `job-1786332687514-76555-446`; npm listed it as published four months before this run |
| Apalache | `0.56.1`, reported by `job-1786332950568-76555-496` |

## Current RED evidence

Every row uses `20,000` maximum samples, `12` maximum steps, and the Rust backend. Exit 1 is expected because the named safety invariant is violated.

| Behavior | Invariant | Step / seed | Herdr job | ITF terminal evidence |
| --- | --- | --- | --- | --- |
| Markdown edit then switch | `noSwitchEditLoss` | `markdownSwitchStep` / `0x0ba11008` | `job-1786332804524-76555-460` | `current-markdown-switch-loss.itf.json`: `lostSwitchEdit=true`, `diskA=BaseA` |
| TXT edit then switch | `noSwitchEditLoss` | `textSwitchStep` / `0x0ba11001` | `job-1786332920638-76555-489` | `current-switch-loss.itf.json`: `lostSwitchEdit=true`, `diskA=BaseA` |
| HTML edit then switch | `noSwitchEditLoss` | `htmlSwitchStep` / `0x0ba11009` | `job-1786332804814-76555-461` | `current-html-switch-loss.itf.json`: `lostSwitchEdit=true`, `diskA=BaseA` |
| External modify then autosave | `noExternalOverwrite` | `externalStep` / `0x0ba11002` | `job-1786332920876-76555-490` | `current-external-overwrite.itf.json`: `ExternalA → LocalA`, `externalOverwrite=true` |
| External delete then autosave | `noDeletedFileResurrection` | `externalStep` / `0x0ba11003` | `job-1786332921152-76555-491` | `current-delete-resurrection.itf.json`: `MissingContent → LocalA`, `deletedResurrection=true` |
| External rename then autosave | `noRenamedPathResurrection` | `externalStep` / `0x0ba11004` | `job-1786332921437-76555-492` | `current-rename-resurrection.itf.json`: renamed copy plus recreated old path |
| Backlink read before startup build | `linkReadsRequireReady` | `linkStep` / `0x0ba11005` | `job-1786332921803-76555-493` | `current-link-not-ready.itf.json`: read at generation 0 with `indexReady=false` |
| Graph forward/read resolution cross rebuild | `oneLinkSnapshotGeneration` | `linkStep` / `0x0ba11006` | `job-1786332922220-76555-494` | `current-link-mixed-generation.itf.json`: forward generation 1, resolution generation 2 |
| Stale path:line task ref | `taskReferenceTargetsSameTask` | `taskStep` / `0x0ba11007` | `job-1786332922528-76555-495` | `current-stale-task.itf.json`: ref task A updates task X |
| Post-validation external task mutation | `taskReferenceTargetsSameTask` | `taskStep` / `0x0ba1100b` | `job-1786334298877-84957-34` | `current-post-validation-task-overwrite.itf.json`: cached TaskA commit sets `wrongTaskUpdated=true` after TaskX mutation |

## Repaired GREEN and non-vacuity

| Check | Result | Parameters | Herdr job / evidence |
| --- | --- | --- | --- |
| Typecheck, current and repaired | GREEN | fixed Quint 0.32.0 | `job-1786345001324-76529-241` |
| `allSafety` random exploration | GREEN | step `step`, seed `0x0ba12010`, 200,000 samples, 40 steps, Rust | `job-1786345001341-76529-243`; no violation in 106.101 s |
| Historical current targeted corpus | RED 12/12 | `formal/verify-current-red.sh`; aggregate checks at 20,000 × 12 plus two dedicated popout checks at 20,000 × 5, Rust | `job-1786356684647-4453-113`; `CURRENT_RED_12_OF_12` |
| 16 repaired reachability witnesses | expected invariant RED means witness reached | `formal/verify-repaired-green.sh`; aggregate witnesses at 20,000 × 12 plus two dedicated popout witnesses at 20,000 × 5, Rust | `job-1786356684690-4453-114`; `REPAIRED_GREEN_AND_REACHABLE_16_OF_16` and all 16 ITFs |
| Representative Apalache run | GREEN | `verify --max-steps=14`; model expanded to 13 VCs | `job-1786345207378-76529-255`; all 13 verification conditions completed |

The non-vacuity commands negate reachability predicates intentionally. Exit 1 means Quint reached the requested good/rejection state; it is not a repaired safety failure.

## Popout exact-route addendum

The Phase 3 native-window review exposed two additional route defects that the original aggregate model did not distinguish: a child tab open could change the main window's shared active pane, and a pane-only API could still mutate after its popout record was removed. These are now isolated in dedicated current/repaired models.

| Check | Result | Parameters | Herdr job / evidence |
| --- | --- | --- | --- |
| Dedicated model typecheck | GREEN | Quint 0.32.0 | `job-1786356442961-4453-88` |
| Shared active pane stolen | expected current RED | 20,000 × 5, seed `0x0ba13001` | `job-1786356442971-4453-89`; `current-popout-active-stolen.itf.json` reaches `mainActivePane=RoutedPane` |
| Stale child mutates after rejoin | expected current RED | 20,000 × 5, seed `0x0ba13002` | `job-1786356442989-4453-90`; `current-popout-stale-mutation.itf.json` reaches `staleMutationCommitted=true` |
| Exact-pair repaired safety | GREEN | 100,000 × 10, seed `0x0ba13003` | `job-1786356443004-4453-91`; no violation |
| Live exact-route mutation witness | expected reachability RED | 20,000 × 5, seed `0x0ba13004` | `job-1786356471121-4453-94`; mutation commits while `mainActivePane=MainPane` |
| Post-rejoin rejection witness | expected reachability RED | 20,000 × 5, seed `0x0ba13005` | `job-1786356471149-4453-95`; `staleMutationRejected=true` and no stale commit |

Dedicated model SHA-256: current `fa2fab5b76ca749922b3c9f5643cf94d5173f840cc1923ffa7e066ab17d6768c`; repaired `86ae01d0b8ae3d8de1ae33c42dd8487e387a7ea8b5e3f10dd2799125e75a0937`.

## Complete final commands

```sh
npx --yes @informalsystems/quint@0.32.0 --version
npx --yes @informalsystems/quint@0.32.0 typecheck formal/obails_91_parity_current.qnt
npx --yes @informalsystems/quint@0.32.0 typecheck formal/obails_91_parity_repaired.qnt

npx --yes @informalsystems/quint@0.32.0 run formal/obails_91_parity_current.qnt --step=markdownSwitchStep --invariant=noSwitchEditLoss --max-samples=20000 --max-steps=12 --seed=0x0ba11008 --backend=rust --mbt --out-itf=formal/current-markdown-switch-loss.itf.json
npx --yes @informalsystems/quint@0.32.0 run formal/obails_91_parity_current.qnt --step=textSwitchStep --invariant=noSwitchEditLoss --max-samples=20000 --max-steps=12 --seed=0x0ba11001 --backend=rust --mbt --out-itf=formal/current-switch-loss.itf.json
npx --yes @informalsystems/quint@0.32.0 run formal/obails_91_parity_current.qnt --step=htmlSwitchStep --invariant=noSwitchEditLoss --max-samples=20000 --max-steps=12 --seed=0x0ba11009 --backend=rust --mbt --out-itf=formal/current-html-switch-loss.itf.json
npx --yes @informalsystems/quint@0.32.0 run formal/obails_91_parity_current.qnt --step=externalStep --invariant=noExternalOverwrite --max-samples=20000 --max-steps=12 --seed=0x0ba11002 --backend=rust --mbt --out-itf=formal/current-external-overwrite.itf.json
npx --yes @informalsystems/quint@0.32.0 run formal/obails_91_parity_current.qnt --step=externalStep --invariant=noDeletedFileResurrection --max-samples=20000 --max-steps=12 --seed=0x0ba11003 --backend=rust --mbt --out-itf=formal/current-delete-resurrection.itf.json
npx --yes @informalsystems/quint@0.32.0 run formal/obails_91_parity_current.qnt --step=externalStep --invariant=noRenamedPathResurrection --max-samples=20000 --max-steps=12 --seed=0x0ba11004 --backend=rust --mbt --out-itf=formal/current-rename-resurrection.itf.json
npx --yes @informalsystems/quint@0.32.0 run formal/obails_91_parity_current.qnt --step=linkStep --invariant=linkReadsRequireReady --max-samples=20000 --max-steps=12 --seed=0x0ba11005 --backend=rust --mbt --out-itf=formal/current-link-not-ready.itf.json
npx --yes @informalsystems/quint@0.32.0 run formal/obails_91_parity_current.qnt --step=linkStep --invariant=oneLinkSnapshotGeneration --max-samples=20000 --max-steps=12 --seed=0x0ba11006 --backend=rust --mbt --out-itf=formal/current-link-mixed-generation.itf.json
npx --yes @informalsystems/quint@0.32.0 run formal/obails_91_parity_current.qnt --step=taskStep --invariant=taskReferenceTargetsSameTask --max-samples=20000 --max-steps=12 --seed=0x0ba11007 --backend=rust --mbt --out-itf=formal/current-stale-task.itf.json
npx --yes @informalsystems/quint@0.32.0 run formal/obails_91_parity_current.qnt --step=taskStep --invariant=taskReferenceTargetsSameTask --max-samples=20000 --max-steps=12 --seed=0x0ba1100b --backend=rust --mbt --out-itf=formal/current-post-validation-task-overwrite.itf.json

zsh formal/verify-repaired-green.sh
# typecheck + 200,000 × 40 safety exploration + every 20,000 × 12 witness.

npx --yes @informalsystems/quint@0.32.0 verify formal/obails_91_parity_repaired.qnt --step=step --invariant=allSafety --max-steps=14
```

All commands above were launched through `herdr run --cwd /Users/kazuph/src/github.com/kazuph/obails -- ...`; the manifest shows the exact child command recorded in each job log.

## Unmodeled dimensions and proof boundary

See `obails-91-parity-mapping.md` for the full dimension inventory and implementation/action map. The main unmodeled areas are save-error UI recovery, crash/fsync durability, multiple windows/processes, link parser and duplicate-basename semantics owned by the Alloy/Lean stream, watcher timing counts, stable-ID construction for identical task bodies, and the external-event × editable-format UI cross-product. `SaveIfUnchanged` checks final identity/content at `services/file_service.go:208-243` then calls `os.Rename` at line 244; a non-cooperating external writer can still win that final-recheck-to-rename interval, while `writeMu` only coordinates Obails writers. The repaired GREEN is therefore not production implementation or live-app evidence, and does not prove that OS-level interval closed.
