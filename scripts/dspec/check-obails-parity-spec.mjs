import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dspecDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dspecDir, "../..");
const mutationId = process.env.DSPEC_MUTATE_ANCHOR || "";

// These anchors describe the repaired product now in the working tree. The
// historical current-RED models are intentionally checked separately below.
const repairedProductAnchors = [
  {
    id: "title-filename-source",
    file: "services/note_service.go",
    allOf: [
      "func (s *NoteService) extractTitle(_ string, path string) string {",
      "return strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))",
    ],
  },
  {
    id: "title-pane-filename-source",
    file: "frontend/src/main.ts",
    allOf: [
      "updatePaneTitles(getDisplayName(path, \"file\"));",
    ],
  },
  {
    id: "new-note-empty-body",
    file: "frontend/src/main.ts",
    allOf: ["await FileService.CreateFile(relativePath, \"\");"],
  },
  {
    id: "duplicate-basename-resolved-owner",
    file: "services/link_service.go",
    allOf: [
      "sort.Slice(files, func(i, j int) bool { return files[i].relative < files[j].relative })",
      "links[i].TargetPath = targetPath",
      "backward[link.TargetPath] = append(backward[link.TargetPath], models.Backlink{",
      "result.Backlinks = cloneBacklinks(snapshot.Backlinks[key])",
    ],
  },
  {
    id: "delete-ui-calls-configured-policy",
    file: "frontend/src/main.ts",
    allOf: ["await FileService.Delete(targetPath);"],
    noneOf: ["await FileService.DeletePath(targetPath);"],
  },
  {
    id: "delete-service-honors-configured-policy",
    file: "services/file_service.go",
    allOf: [
      "mode := s.configService.GetDeleteMode()",
      "case models.DeleteModeSystemTrash:",
      "case models.DeleteModeVaultTrash:",
      "case models.DeleteModePermanent:",
    ],
  },
  {
    id: "delete-default-is-system-trash",
    file: "models/config.go",
    allOf: ["DeleteMode: DeleteModeSystemTrash,"],
  },
  {
    id: "search-ui-calls-vault-search-service",
    file: "frontend/src/main.ts",
    allOf: [
      "const results = await SearchService.Search(options) as VaultSearchResult[];",
      "const options = createVaultSearchOptions({",
    ],
  },
  {
    id: "search-backend-parses-operator-expression",
    file: "services/search_service.go",
    allOf: [
      "query, err := parseSearchQuery(options.Query)",
      "case \"file\", \"path\", \"content\", \"match-case\", \"ignore-case\", \"tag\", \"line\", \"block\", \"section\", \"task\", \"task-todo\", \"task-done\":",
      "return propertyNode{key: key, value: child}, nil",
    ],
  },
  {
    id: "delete-setting-is-in-app-and-persisted",
    file: "frontend/src/main.ts",
    allOf: [
      "deleteMode = normalizeDeleteMode(await ConfigService.GetDeleteMode());",
      "await ConfigService.SetDeleteMode(nextMode);",
    ],
  },
  {
    id: "save-captured-intent-cas",
    file: "frontend/src/main.ts",
    allOf: [
      "documentRuntimeFactory.scheduleSave(activePaneId, captureSaveIntent(document, content), EDITOR_SAVE_DELAY_MS);",
      "const result = await FileService.SaveIfUnchanged(intent.snapshot, intent.content);",
    ],
    ordered: [
      "documentRuntimeFactory.scheduleSave(activePaneId, captureSaveIntent(document, content), EDITOR_SAVE_DELAY_MS);",
      "const result = await FileService.SaveIfUnchanged(intent.snapshot, intent.content);",
    ],
  },
  {
    id: "save-switch-flush-before-open",
    file: "frontend/src/main.ts",
    allOf: [
      "async function flushActiveDocumentBeforeSwitch(): Promise<boolean> {",
      "await documentRuntimeFactory.flushPane(activePaneId)",
      "if (!await flushActiveDocumentBeforeSwitch()) {",
    ],
  },
  {
    id: "link-pinned-generation",
    file: "frontend/src/main.ts",
    allOf: [
      "const snapshot = await LinkService.GetLinkIndexSnapshot();",
      "LinkService.GetBacklinksFromSnapshot(snapshot, path)",
    ],
    ordered: [
      "const snapshot = await LinkService.GetLinkIndexSnapshot();",
      "LinkService.GetBacklinksFromSnapshot(snapshot, path)",
    ],
  },
  {
    id: "task-reference-cas-commit",
    file: "services/task_service.go",
    allOf: [
      "func (s *TaskService) commitTaskReference(snapshot models.FileSnapshot, lines []string, lineIndex int) (string, error) {",
      "result, err := s.fileService.SaveIfUnchanged(snapshot, content)",
    ],
    ordered: [
      "func (s *TaskService) commitTaskReference(snapshot models.FileSnapshot, lines []string, lineIndex int) (string, error) {",
      "result, err := s.fileService.SaveIfUnchanged(snapshot, content)",
    ],
  },
  {
    id: "command-snapshot-dispatch-persistence",
    file: "frontend/src/main.ts",
    allOf: [
      "commandSnapshot = await ConfigService.GetCommandDescriptors() as CommandDescriptor[];",
      "await ConfigService.SetHotkey(command.id, input.value);",
      "async function executeCommand(id: string)",
      "suppressPrintableHotkeyInEditableTarget(e, e.target)",
    ],
  },
  {
    id: "document-history-identity-lifecycle",
    file: "frontend/src/main.ts",
    allOf: [
      "let documentHistory: DocumentHistory = primaryDocumentRuntime.history;",
      "documentHistory.recordEdit(",
      "documentHistory.undo(identity)",
      "documentHistory.redo(identity)",
      "documentHistory.drop(",
      "documentRuntimeFactory.forPane(paneId).rewritePathIdentity(previousPath, nextPath, isDir);",
    ],
  },
  {
    id: "document-history-migrate-on-rename",
    file: "frontend/src/lib/primary-document-runtime.ts",
    allOf: [
      "this.history.migrate(previousIdentity, {",
      "path: this.activeEditableDocument.snapshot.path",
    ],
  },
  {
    id: "attachment-import-insert-save",
    file: "frontend/src/main.ts",
    allOf: [
      "const result = await FileService.ImportAttachment(sourcePath, notePath);",
      "const insertion = insertAttachmentEmbeds(",
      "editor.dispatchEvent(new Event(\"input\", { bubbles: true }));",
    ],
    ordered: [
      "const result = await FileService.ImportAttachment(sourcePath, notePath);",
      "const insertion = insertAttachmentEmbeds(",
      "editor.dispatchEvent(new Event(\"input\", { bubbles: true }));",
    ],
  },
  {
    id: "popout-exact-pair-tab-mutations",
    file: "services/state_service.go",
    allOf: [
      "func (s *StateService) OpenWorkspaceTabInPopout(paneID, popoutID string, tab models.WorkspaceTab)",
      "func (s *StateService) ActivateWorkspaceTabInPopout(paneID, popoutID, path string)",
      "func (s *StateService) CloseWorkspaceTabInPopout(paneID, popoutID, path string)",
      "if err := validatePopoutWorkspaceRoute(workspace, paneID, popoutID); err != nil {",
    ],
  },
  {
    id: "popout-frontend-routes-exact-pair",
    file: "frontend/src/main.ts",
    allOf: [
      "workspaceController.openTabInRoutedPopout(path, resolvedType, popoutRoute.paneId, popoutRoute.popoutId)",
      "workspaceController.activateTabInRoutedPopout(paneId, popoutRoute.popoutId, path)",
      "workspaceController.closeTabInRoutedPopout(paneId, popoutRoute.popoutId, path)",
    ],
  },
];

const formalAnchors = [
  {
    file: "scripts/dspec/ObailsParitySpec.lean",
    allOf: [
      "theorem currentModelIsRed",
      "theorem repairedCandidateIsGreen",
      "theorem repairedCapabilitiesAreGreen",
      "theorem repairedMayReportAmbiguous",
    ],
  },
  {
    file: "scripts/dspec/obails-parity.als",
    allOf: [
      "assert CurrentDuplicateBacklinksFollowResolution",
      "assert RepairedDuplicateResolutionIsSingleOrExplicitAmbiguous",
      "run CurrentRedWitness",
      "run RepairedGreenWitness",
    ],
  },
  {
    file: "scripts/dspec/PARITY-MATRIX.md",
    allOf: [
      "filename唯一title・新規本文空",
      "単一解決または明示的曖昧",
      "System Trash / Vault Trash / permanent",
      "検索演算子の分類",
      "Historical current RED artifacts",
      "Current repaired-product anchor coverage",
    ],
  },
  {
    file: "scripts/dspec/EVIDENCE.json",
    allOf: [
      "currentRedChecksWithCounterexamples",
      "repairedGreenChecksUnsat",
      "intentionalRedExitCode",
      "currentProductRepairedAnchorChecks",
      "unexpressedDimensions",
    ],
  },
  {
    file: "formal/workspace_popout_current.qnt",
    allOf: [
      "action openWithSharedActiveApi",
      "action staleChildMutatesPane",
      "val mainWindowActivePaneIsStable",
      "val staleChildCannotMutate",
    ],
  },
  {
    file: "formal/workspace_popout_repaired.qnt",
    allOf: [
      "action openWithExactPopoutPair",
      "action rejectStaleChildMutation",
      "val allSafety",
      "val notStaleRejectionReached",
    ],
  },
];

const failures = [];

function readRelative(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function checkAnchors(spec, content) {
  for (const expected of spec.allOf) {
    if (!content.includes(expected)) {
      failures.push(`${spec.id || spec.file}: missing ${JSON.stringify(expected)}`);
    }
  }
  for (const forbidden of spec.noneOf || []) {
    if (content.includes(forbidden)) {
      failures.push(`${spec.id || spec.file}: unexpectedly contains ${JSON.stringify(forbidden)}`);
    }
  }
  let previousIndex = -1;
  for (const expected of spec.ordered || []) {
    const index = content.indexOf(expected, previousIndex + 1);
    if (index < 0) {
      failures.push(`${spec.id || spec.file}: missing ordered ${JSON.stringify(expected)}`);
      continue;
    }
    previousIndex = index;
  }
}

for (const anchor of repairedProductAnchors) {
  let content = readRelative(anchor.file);
  if (mutationId === anchor.id) {
    content = content.replace(anchor.allOf[0], "__DSPEC_INTENTIONAL_MUTATION__");
  }
  checkAnchors(anchor, content);
}

for (const anchor of formalAnchors) {
  checkAnchors(anchor, readRelative(anchor.file));
}

if (mutationId && !repairedProductAnchors.some((anchor) => anchor.id === mutationId)) {
  failures.push(`unknown DSPEC_MUTATE_ANCHOR=${mutationId}`);
}

if (failures.length > 0) {
  console.error(`drift RED (${failures.length} violation${failures.length === 1 ? "" : "s"})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`drift GREEN (${repairedProductAnchors.length} repaired-product anchors, ${formalAnchors.length} formal/matrix anchors)`);
console.log("Historical current RED counterexamples remain preserved; repaired-product anchors are automated evidence, while native acceptance remains separate.");
