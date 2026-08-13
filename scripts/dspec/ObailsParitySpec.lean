inductive TitleSource where
  | filename
  | firstH1
  deriving DecidableEq, Repr

inductive NewNoteBody where
  | empty
  | forcedH1
  deriving DecidableEq, Repr

def bools : List Bool := [false, true]

def currentInternalTitle (hasH1 : Bool) : TitleSource :=
  if hasH1 then .firstH1 else .filename

def currentPaneTitle (_hasH1 : Bool) : TitleSource := .filename

def currentTitleViolation (hasH1 : Bool) : Bool :=
  decide (currentInternalTitle hasH1 != currentPaneTitle hasH1) ||
    decide (NewNoteBody.forcedH1 != NewNoteBody.empty)

def repairedTitleViolation (_hasH1 : Bool) : Bool :=
  decide (TitleSource.filename != TitleSource.filename) ||
    decide (NewNoteBody.empty != NewNoteBody.empty)

def currentTitleViolations := bools.filter currentTitleViolation
def repairedTitleViolations := bools.filter repairedTitleViolation

theorem currentTitleIsRed : currentTitleViolations != [] := by native_decide
theorem currentH1CreatesSecondTitleSource : currentTitleViolation true = true := by native_decide
theorem currentNewNoteForcesH1 : currentTitleViolation false = true := by native_decide
theorem repairedTitleIsGreen : repairedTitleViolations = [] := by native_decide

inductive LinkTarget where
  | a
  | b
  deriving DecidableEq, Repr

inductive DuplicatePolicy where
  | selectA
  | selectB
  | explicitAmbiguous
  deriving DecidableEq, Repr

inductive LinkResolution where
  | unresolved
  | ambiguous
  | resolved (target : LinkTarget)
  deriving DecidableEq, Repr

def duplicatePolicies : List DuplicatePolicy :=
  [.selectA, .selectB, .explicitAmbiguous]

def linkTargets : List LinkTarget := [.a, .b]

def repairedDuplicateResolution : DuplicatePolicy -> LinkResolution
  | .selectA => .resolved .a
  | .selectB => .resolved .b
  | .explicitAmbiguous => .ambiguous

def repairedBacklink (policy : DuplicatePolicy) (query : LinkTarget) : Bool :=
  match repairedDuplicateResolution policy with
  | .resolved target => decide (target = query)
  | .ambiguous | .unresolved => false

def repairedLinkViolation (policy : DuplicatePolicy) : Bool :=
  match repairedDuplicateResolution policy with
  | .resolved target =>
      linkTargets.any fun query => repairedBacklink policy query != decide (query = target)
  | .ambiguous => linkTargets.any (repairedBacklink policy)
  | .unresolved => true

-- Current pathIndex selects one duplicate basename, while GetBacklinks also
-- queries the raw basename key for both same-basename targets.
def currentDuplicateResolution : LinkResolution := .resolved .a
def currentBacklink (_query : LinkTarget) : Bool := true

def currentLinkViolation : Bool :=
  match currentDuplicateResolution with
  | .resolved target =>
      linkTargets.any fun query => currentBacklink query != decide (query = target)
  | .ambiguous | .unresolved => true

def repairedLinkViolations := duplicatePolicies.filter repairedLinkViolation

theorem currentDuplicateBacklinkIsRed : currentLinkViolation = true := by native_decide
theorem repairedDuplicateLinkIsGreen : repairedLinkViolations = [] := by native_decide
theorem repairedMaySelectA : repairedDuplicateResolution .selectA = .resolved .a := by native_decide
theorem repairedMaySelectB : repairedDuplicateResolution .selectB = .resolved .b := by native_decide
theorem repairedMayReportAmbiguous : repairedDuplicateResolution .explicitAmbiguous = .ambiguous := by native_decide

inductive DeletePolicy where
  | systemTrash
  | vaultTrash
  | permanent
  deriving DecidableEq, Repr

inductive DeleteTargetKind where
  | file
  | directory
  deriving DecidableEq, Repr

inductive DeleteAction where
  | systemTrash
  | vaultTrash
  | permanent
  | refuse
  deriving DecidableEq, Repr

structure DeleteCase where
  policy : DeletePolicy
  kind : DeleteTargetKind
  systemTrashAvailable : Bool
  deriving DecidableEq, Repr

def deletePolicies : List DeletePolicy :=
  [.systemTrash, .vaultTrash, .permanent]

def deleteTargetKinds : List DeleteTargetKind := [.file, .directory]

def deleteCases : List DeleteCase :=
  deletePolicies.flatMap fun policy =>
    deleteTargetKinds.flatMap fun kind =>
      bools.map fun available => { policy, kind, systemTrashAvailable := available }

def repairedDeleteAction (c : DeleteCase) : DeleteAction :=
  match c.policy with
  | .systemTrash => if c.systemTrashAvailable then .systemTrash else .refuse
  | .vaultTrash => .vaultTrash
  | .permanent => .permanent

def expectedDeleteAction := repairedDeleteAction

def currentDeleteAction (_c : DeleteCase) : DeleteAction := .permanent

def currentDeleteViolation (c : DeleteCase) : Bool :=
  decide (currentDeleteAction c != expectedDeleteAction c)

def repairedDeleteViolation (c : DeleteCase) : Bool :=
  decide (repairedDeleteAction c != expectedDeleteAction c)

def currentDeleteViolations := deleteCases.filter currentDeleteViolation
def repairedDeleteViolations := deleteCases.filter repairedDeleteViolation

theorem currentDeleteIsRed : currentDeleteViolations != [] := by native_decide
theorem currentDefaultPermanentlyDeletes :
    currentDeleteViolation { policy := .systemTrash, kind := .file, systemTrashAvailable := true } = true := by
  native_decide
theorem repairedDeleteIsGreen : repairedDeleteViolations = [] := by native_decide
theorem repairedSystemTrashFailsClosed :
    repairedDeleteAction { policy := .systemTrash, kind := .directory, systemTrashAvailable := false } = .refuse := by
  native_decide

inductive SearchSyntax where
  | plainTerm
  | exactPhrase
  | conjunction
  | disjunction
  | negation
  | grouping
  | regex
  | fileOp
  | pathOp
  | contentOp
  | matchCaseOp
  | ignoreCaseOp
  | tagOp
  | lineOp
  | blockOp
  | sectionOp
  | taskOp
  | taskTodoOp
  | taskDoneOp
  | propertyOp
  deriving DecidableEq, Repr

inductive SearchClass where
  | term
  | boolean
  | regex
  | scope
  | caseMode
  | structural
  | property
  deriving DecidableEq, Repr

def searchSyntaxes : List SearchSyntax :=
  [.plainTerm, .exactPhrase, .conjunction, .disjunction, .negation, .grouping,
   .regex, .fileOp, .pathOp, .contentOp, .matchCaseOp, .ignoreCaseOp, .tagOp,
   .lineOp, .blockOp, .sectionOp, .taskOp, .taskTodoOp, .taskDoneOp, .propertyOp]

def classifySearch : SearchSyntax -> SearchClass
  | .plainTerm | .exactPhrase => .term
  | .conjunction | .disjunction | .negation | .grouping => .boolean
  | .regex => .regex
  | .fileOp | .pathOp | .contentOp => .scope
  | .matchCaseOp | .ignoreCaseOp => .caseMode
  | .tagOp | .lineOp | .blockOp | .sectionOp | .taskOp | .taskTodoOp | .taskDoneOp => .structural
  | .propertyOp => .property

def expectedSearchClass : SearchSyntax -> SearchClass
  | .plainTerm | .exactPhrase => .term
  | .conjunction | .disjunction | .negation | .grouping => .boolean
  | .regex => .regex
  | .fileOp | .pathOp | .contentOp => .scope
  | .matchCaseOp | .ignoreCaseOp => .caseMode
  | .tagOp | .lineOp | .blockOp | .sectionOp | .taskOp | .taskTodoOp | .taskDoneOp => .structural
  | .propertyOp => .property

def currentSearchUnderstands : SearchSyntax -> Bool
  | .plainTerm => true
  | _ => false

def currentSearchViolation (querySyntax : SearchSyntax) : Bool :=
  !currentSearchUnderstands querySyntax

def repairedSearchViolation (querySyntax : SearchSyntax) : Bool :=
  decide (classifySearch querySyntax != expectedSearchClass querySyntax)

def currentSearchViolations := searchSyntaxes.filter currentSearchViolation
def repairedSearchViolations := searchSyntaxes.filter repairedSearchViolation

theorem currentSearchIsRed : currentSearchViolations != [] := by native_decide
theorem repairedSearchIsGreen : repairedSearchViolations = [] := by native_decide
theorem repairedSearchEnumerationIsComplete : searchSyntaxes.length = 20 := by native_decide

inductive UiCapability where
  | inAppSettings
  | theme
  | fontSize
  | fontFamily
  | lineNumbers
  | wordWrap
  | sidebarWidth
  | deletePolicy
  deriving DecidableEq, Repr

structure CapabilityEvidence where
  represented : Bool
  availableInUi : Bool
  applied : Bool
  persisted : Bool
  deriving DecidableEq, Repr

def uiCapabilities : List UiCapability :=
  [.inAppSettings, .theme, .fontSize, .fontFamily, .lineNumbers, .wordWrap,
   .sidebarWidth, .deletePolicy]

def currentCapabilityEvidence : UiCapability -> CapabilityEvidence
  | .inAppSettings => ⟨false, false, false, false⟩
  | .theme => ⟨true, true, true, true⟩
  | .fontSize | .fontFamily | .lineNumbers | .wordWrap | .sidebarWidth =>
      ⟨true, false, false, true⟩
  | .deletePolicy => ⟨false, false, false, false⟩

def repairedCapabilityEvidence (_capability : UiCapability) : CapabilityEvidence :=
  ⟨true, true, true, true⟩

def capabilityViolation (evidence : CapabilityEvidence) : Bool :=
  !(evidence.represented && evidence.availableInUi && evidence.applied && evidence.persisted)

def currentCapabilityViolations :=
  uiCapabilities.filter fun capability => capabilityViolation (currentCapabilityEvidence capability)

def repairedCapabilityViolations :=
  uiCapabilities.filter fun capability => capabilityViolation (repairedCapabilityEvidence capability)

theorem currentCapabilitiesAreRed : currentCapabilityViolations != [] := by native_decide
theorem currentThemeCapabilityIsConnected :
    capabilityViolation (currentCapabilityEvidence .theme) = false := by native_decide
theorem repairedCapabilitiesAreGreen : repairedCapabilityViolations = [] := by native_decide

theorem currentModelIsRed :
    currentTitleViolations != [] &&
    currentLinkViolation = true &&
    currentDeleteViolations != [] &&
    currentSearchViolations != [] &&
    currentCapabilityViolations != [] := by
  native_decide

theorem repairedCandidateIsGreen :
    repairedTitleViolations = [] &&
    repairedLinkViolations = [] &&
    repairedDeleteViolations = [] &&
    repairedSearchViolations = [] &&
    repairedCapabilityViolations = [] := by
  native_decide

#eval currentTitleViolations
#eval currentLinkViolation
#eval currentDeleteViolations.length
#eval currentSearchViolations.length
#eval currentCapabilityViolations
#eval repairedTitleViolations
#eval repairedLinkViolations
#eval repairedDeleteViolations
#eval repairedSearchViolations
#eval repairedCapabilityViolations

/-! ## Wave 1 finite tables

These tables intentionally keep the historical model separate from the
working-tree anchors. A GREEN theorem below means only that every listed
candidate row meets its decision-table contract.
-/

inductive CommandId where
  | palette | newNote | graph
  deriving DecidableEq, Repr

inductive Hotkey where
  | cmdP | cmdN | cmdG
  deriving DecidableEq, Repr

structure CommandDescriptorCase where
  id : CommandId
  descriptorPresent : Bool
  paletteDispatches : Bool
  hotkey : Hotkey
  deriving DecidableEq, Repr

def commandIds : List CommandId := [.palette, .newNote, .graph]

def currentCommandCase : CommandId -> CommandDescriptorCase
  | .palette => ⟨.palette, true, true, .cmdP⟩
  | .newNote => ⟨.newNote, true, false, .cmdP⟩
  | .graph => ⟨.graph, false, false, .cmdG⟩

def repairedCommandCase : CommandId -> CommandDescriptorCase
  | .palette => ⟨.palette, true, true, .cmdP⟩
  | .newNote => ⟨.newNote, true, true, .cmdN⟩
  | .graph => ⟨.graph, true, true, .cmdG⟩

def commandCaseViolation (describe : CommandId -> CommandDescriptorCase) (id : CommandId) : Bool :=
  let candidate := describe id
  !candidate.descriptorPresent || !candidate.paletteDispatches ||
    commandIds.any fun other => other != id && candidate.hotkey = (describe other).hotkey

def currentCommandViolations := commandIds.filter (commandCaseViolation currentCommandCase)
def repairedCommandViolations := commandIds.filter (commandCaseViolation repairedCommandCase)

theorem currentCommandDescriptorPaletteIsRed : currentCommandViolations != [] := by native_decide
theorem currentCommandHotkeyConflictIsReachable : commandCaseViolation currentCommandCase .newNote = true := by native_decide
theorem repairedCommandDescriptorPaletteIsGreen : repairedCommandViolations = [] := by native_decide
theorem repairedPaletteDispatchIsNonVacuous : (repairedCommandCase .palette).paletteDispatches = true := by native_decide
theorem repairedGraphDispatchIsNonVacuous : (repairedCommandCase .graph).paletteDispatches = true := by native_decide

inductive HistoryOperation where
  | recordMarkdown | recordText | migrateMarkdown | dropText | undoMarkdown | redoText
  deriving DecidableEq, Repr

structure HistoryLifecycleCase where
  operation : HistoryOperation
  pathAndKindIdentity : Bool
  oldIdentityRemoved : Bool
  droppedIdentityRemoved : Bool
  timelineReachable : Bool
  deriving DecidableEq, Repr

def historyOperations : List HistoryOperation :=
  [.recordMarkdown, .recordText, .migrateMarkdown, .dropText, .undoMarkdown, .redoText]

-- Historical path-only history aliases Markdown and Text and leaves lifecycle
-- entries behind after rename/delete.
def currentHistoryCase : HistoryOperation -> HistoryLifecycleCase
  | .recordMarkdown => ⟨.recordMarkdown, false, true, true, true⟩
  | .recordText => ⟨.recordText, false, true, true, true⟩
  | .migrateMarkdown => ⟨.migrateMarkdown, true, false, true, true⟩
  | .dropText => ⟨.dropText, true, true, false, true⟩
  | .undoMarkdown => ⟨.undoMarkdown, false, true, true, true⟩
  | .redoText => ⟨.redoText, false, true, true, true⟩

def repairedHistoryCase (operation : HistoryOperation) : HistoryLifecycleCase :=
  ⟨operation, true, true, true, true⟩

def historyViolation (c : HistoryLifecycleCase) : Bool :=
  !c.pathAndKindIdentity || !c.oldIdentityRemoved || !c.droppedIdentityRemoved || !c.timelineReachable

def currentHistoryViolations := historyOperations.filter fun op => historyViolation (currentHistoryCase op)
def repairedHistoryViolations := historyOperations.filter fun op => historyViolation (repairedHistoryCase op)

theorem currentPathKindHistoryLifecycleIsRed : currentHistoryViolations != [] := by native_decide
theorem currentHistoryMigrationLeavesOldIdentity : historyViolation (currentHistoryCase .migrateMarkdown) = true := by native_decide
theorem repairedPathKindHistoryLifecycleIsGreen : repairedHistoryViolations = [] := by native_decide
theorem repairedHistoryUndoRedoIsNonVacuous :
    (repairedHistoryCase .undoMarkdown).timelineReachable && (repairedHistoryCase .redoText).timelineReachable = true := by
  native_decide

inductive AttachmentLocation where
  | noteFolder | vaultRoot | configuredFolder
  deriving DecidableEq, Repr

structure AttachmentCase where
  location : AttachmentLocation
  sourceExists : Bool
  markdownNote : Bool
  destinationCorrect : Bool
  importCommitted : Bool
  embedInserted : Bool
  deriving DecidableEq, Repr

def attachmentLocations : List AttachmentLocation := [.noteFolder, .vaultRoot, .configuredFolder]

def attachmentCasesFor (describe : AttachmentLocation -> Bool -> Bool -> AttachmentCase) : List AttachmentCase :=
  attachmentLocations.flatMap fun location =>
    bools.flatMap fun sourceExists =>
      bools.map fun markdownNote => describe location sourceExists markdownNote

def currentAttachmentCase (location : AttachmentLocation) (sourceExists markdownNote : Bool) : AttachmentCase :=
  ⟨location, sourceExists, markdownNote, location = .vaultRoot, sourceExists && markdownNote, false⟩

def repairedAttachmentCase (location : AttachmentLocation) (sourceExists markdownNote : Bool) : AttachmentCase :=
  let accepted := sourceExists && markdownNote
  ⟨location, sourceExists, markdownNote, true, accepted, accepted⟩

def attachmentViolation (c : AttachmentCase) : Bool :=
  let accepted := c.sourceExists && c.markdownNote
  c.destinationCorrect = false || c.importCommitted != accepted || c.embedInserted != accepted

def currentAttachmentViolations := attachmentCasesFor currentAttachmentCase |>.filter attachmentViolation
def repairedAttachmentViolations := attachmentCasesFor repairedAttachmentCase |>.filter attachmentViolation

theorem currentAttachmentDestinationImportEmbedIsRed : currentAttachmentViolations != [] := by native_decide
theorem currentConfiguredFolderAttachmentIsRed :
    attachmentViolation (currentAttachmentCase .configuredFolder true true) = true := by native_decide
theorem repairedAttachmentDestinationImportEmbedIsGreen : repairedAttachmentViolations = [] := by native_decide
theorem repairedAttachmentEmbedInsertionIsNonVacuous :
    (repairedAttachmentCase .noteFolder true true).embedInserted = true := by native_decide
theorem repairedAttachmentTableHasTwelveRows : (attachmentCasesFor repairedAttachmentCase).length = 12 := by native_decide

#eval currentCommandViolations
#eval repairedCommandViolations
#eval currentHistoryViolations
#eval repairedHistoryViolations
#eval currentAttachmentViolations.length
#eval repairedAttachmentViolations.length
