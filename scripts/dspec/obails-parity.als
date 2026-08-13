module obails_parity

abstract sig TitleSource {}
one sig Filename, FirstH1 extends TitleSource {}
abstract sig BodyMode {}
one sig EmptyBody, ForcedH1 extends BodyMode {}
sig TitleState {
  internalTitle: one TitleSource,
  paneTitle: one TitleSource,
  newBody: one BodyMode
}
one sig CurrentTitle, RepairedTitle extends TitleState {}

fact TitleFacts {
  CurrentTitle.internalTitle = FirstH1
  CurrentTitle.paneTitle = Filename
  CurrentTitle.newBody = ForcedH1
  RepairedTitle.internalTitle = Filename
  RepairedTitle.paneTitle = Filename
  RepairedTitle.newBody = EmptyBody
}

pred titleContract[s: TitleState] {
  s.internalTitle = Filename
  s.paneTitle = Filename
  s.newBody = EmptyBody
}

assert CurrentTitleMeetsCanonicalContract { titleContract[CurrentTitle] }
assert RepairedTitleMeetsCanonicalContract { titleContract[RepairedTitle] }

abstract sig LinkTarget {}
one sig TargetA, TargetB extends LinkTarget {}
abstract sig LinkOutcome {}
one sig Resolved, ExplicitAmbiguous extends LinkOutcome {}
sig LinkState {
  outcome: one LinkOutcome,
  destination: lone LinkTarget,
  backlinks: set LinkTarget
}
one sig CurrentDuplicate, RepairSelectA, RepairSelectB, RepairAmbiguous extends LinkState {}

fact LinkFacts {
  CurrentDuplicate.outcome = Resolved
  CurrentDuplicate.destination = TargetA
  CurrentDuplicate.backlinks = TargetA + TargetB

  RepairSelectA.outcome = Resolved
  RepairSelectA.destination = TargetA
  RepairSelectA.backlinks = TargetA

  RepairSelectB.outcome = Resolved
  RepairSelectB.destination = TargetB
  RepairSelectB.backlinks = TargetB

  RepairAmbiguous.outcome = ExplicitAmbiguous
  no RepairAmbiguous.destination
  no RepairAmbiguous.backlinks
}

pred minimumDuplicateResolutionContract[s: LinkState] {
  (s.outcome = Resolved and one s.destination) or
  (s.outcome = ExplicitAmbiguous and no s.destination)
}

pred backlinkOwnershipContract[s: LinkState] {
  (s.outcome = Resolved implies s.backlinks = s.destination)
  (s.outcome = ExplicitAmbiguous implies no s.backlinks)
}

assert CurrentDuplicateBacklinksFollowResolution {
  backlinkOwnershipContract[CurrentDuplicate]
}
assert RepairedDuplicateResolutionIsSingleOrExplicitAmbiguous {
  all s: RepairSelectA + RepairSelectB + RepairAmbiguous |
    minimumDuplicateResolutionContract[s]
}
assert RepairedDuplicateBacklinksFollowResolution {
  all s: RepairSelectA + RepairSelectB + RepairAmbiguous |
    backlinkOwnershipContract[s]
}

abstract sig DeletePolicy {}
one sig SystemTrashPolicy, VaultTrashPolicy, PermanentPolicy extends DeletePolicy {}
abstract sig DeleteAction {}
one sig ToSystemTrash, ToVaultTrash, DeletePermanently, RefuseDelete extends DeleteAction {}
sig DeleteState {
  policy: one DeletePolicy,
  systemTrashAvailable: one Int,
  action: one DeleteAction
}
one sig CurrentDefaultDelete, RepairSystemAvailable, RepairSystemUnavailable,
  RepairVaultTrash, RepairPermanent extends DeleteState {}

fact DeleteFacts {
  CurrentDefaultDelete.policy = SystemTrashPolicy
  CurrentDefaultDelete.systemTrashAvailable = 1
  CurrentDefaultDelete.action = DeletePermanently

  RepairSystemAvailable.policy = SystemTrashPolicy
  RepairSystemAvailable.systemTrashAvailable = 1
  RepairSystemAvailable.action = ToSystemTrash

  RepairSystemUnavailable.policy = SystemTrashPolicy
  RepairSystemUnavailable.systemTrashAvailable = 0
  RepairSystemUnavailable.action = RefuseDelete

  RepairVaultTrash.policy = VaultTrashPolicy
  RepairVaultTrash.action = ToVaultTrash

  RepairPermanent.policy = PermanentPolicy
  RepairPermanent.action = DeletePermanently
}

pred deletionContract[s: DeleteState] {
  (s.policy = SystemTrashPolicy and s.systemTrashAvailable = 1 implies s.action = ToSystemTrash)
  (s.policy = SystemTrashPolicy and s.systemTrashAvailable = 0 implies s.action = RefuseDelete)
  (s.policy = VaultTrashPolicy implies s.action = ToVaultTrash)
  (s.policy = PermanentPolicy implies s.action = DeletePermanently)
  (s.action = DeletePermanently implies s.policy = PermanentPolicy)
}

assert CurrentDeleteHonorsConfiguredPolicy { deletionContract[CurrentDefaultDelete] }
assert RepairedDeleteHonorsConfiguredPolicy {
  all s: RepairSystemAvailable + RepairSystemUnavailable + RepairVaultTrash + RepairPermanent |
    deletionContract[s]
}

abstract sig SearchClass {}
one sig TermClass, BooleanClass, RegexClass, ScopeClass, CaseClass,
  StructuralClass, PropertyClass extends SearchClass {}
abstract sig SearchSyntax { expected: one SearchClass }
one sig PlainTerm, ExactPhrase extends SearchSyntax {}
one sig Conjunction, Disjunction, Negation, Grouping extends SearchSyntax {}
one sig RegexSyntax extends SearchSyntax {}
one sig FileOp, PathOp, ContentOp extends SearchSyntax {}
one sig MatchCaseOp, IgnoreCaseOp extends SearchSyntax {}
one sig TagOp, LineOp, BlockOp, SectionOp, TaskOp, TaskTodoOp,
  TaskDoneOp extends SearchSyntax {}
one sig PropertyOp extends SearchSyntax {}
sig SearchState { classified: SearchSyntax -> lone SearchClass }
one sig CurrentSearch, RepairedSearch extends SearchState {}

fact SearchFacts {
  (PlainTerm + ExactPhrase).expected = TermClass
  (Conjunction + Disjunction + Negation + Grouping).expected = BooleanClass
  RegexSyntax.expected = RegexClass
  (FileOp + PathOp + ContentOp).expected = ScopeClass
  (MatchCaseOp + IgnoreCaseOp).expected = CaseClass
  (TagOp + LineOp + BlockOp + SectionOp + TaskOp + TaskTodoOp + TaskDoneOp).expected = StructuralClass
  PropertyOp.expected = PropertyClass

  CurrentSearch.classified = PlainTerm -> TermClass
  RepairedSearch.classified = expected
}

pred searchClassificationContract[s: SearchState] {
  all syntax: SearchSyntax | one s.classified[syntax]
  s.classified = expected
}

assert CurrentSearchClassifiesOfficialSyntax { searchClassificationContract[CurrentSearch] }
assert RepairedSearchClassifiesOfficialSyntax { searchClassificationContract[RepairedSearch] }

abstract sig Capability {}
one sig InAppSettings, Theme, FontSize, FontFamily, LineNumbers,
  WordWrap, SidebarWidth, DeletePolicySetting extends Capability {}
sig CapabilityState {
  represented: set Capability,
  availableInUi: set Capability,
  applied: set Capability,
  persisted: set Capability
}
one sig CurrentCapabilities, RepairedCapabilities extends CapabilityState {}

fact CapabilityFacts {
  CurrentCapabilities.represented = Theme + FontSize + FontFamily + LineNumbers + WordWrap + SidebarWidth
  CurrentCapabilities.availableInUi = Theme
  CurrentCapabilities.applied = Theme
  CurrentCapabilities.persisted = Theme + FontSize + FontFamily + LineNumbers + WordWrap + SidebarWidth

  RepairedCapabilities.represented = Capability
  RepairedCapabilities.availableInUi = Capability
  RepairedCapabilities.applied = Capability
  RepairedCapabilities.persisted = Capability
}

pred capabilityContract[s: CapabilityState] {
  s.represented = Capability
  s.availableInUi = Capability
  s.applied = Capability
  s.persisted = Capability
}

assert CurrentCapabilitiesAreConnected { capabilityContract[CurrentCapabilities] }
assert RepairedCapabilitiesAreConnected { capabilityContract[RepairedCapabilities] }

abstract sig CommandId {}
one sig PaletteCommand, NewNoteCommand, GraphCommand extends CommandId {}
abstract sig CommandHotkey {}
one sig CmdP, CmdN, CmdG extends CommandHotkey {}
sig CommandState {
  describedCommands: set CommandId,
  paletteDispatch: set CommandId,
  hotkeys: CommandId -> lone CommandHotkey
}
one sig CurrentCommands, RepairedCommands extends CommandState {}

fact CommandFacts {
  CurrentCommands.describedCommands = PaletteCommand + NewNoteCommand
  CurrentCommands.paletteDispatch = PaletteCommand
  CurrentCommands.hotkeys = PaletteCommand->CmdP + NewNoteCommand->CmdP + GraphCommand->CmdG

  RepairedCommands.describedCommands = CommandId
  RepairedCommands.paletteDispatch = CommandId
  RepairedCommands.hotkeys = PaletteCommand->CmdP + NewNoteCommand->CmdN + GraphCommand->CmdG
}

pred commandDescriptorPaletteContract[s: CommandState] {
  s.describedCommands = CommandId
  s.paletteDispatch = CommandId
  all disj left, right: CommandId | s.hotkeys[left] != s.hotkeys[right]
}

assert CurrentCommandDescriptorPaletteDispatchesWithoutConflict {
  commandDescriptorPaletteContract[CurrentCommands]
}
assert RepairedCommandDescriptorPaletteDispatchesWithoutConflict {
  commandDescriptorPaletteContract[RepairedCommands]
}
pred RepairedCommandNonVacuity {
  GraphCommand in RepairedCommands.paletteDispatch
  RepairedCommands.hotkeys[PaletteCommand] = CmdP
}

abstract sig HistoryOperation {}
one sig RecordMarkdown, RecordText, MigrateMarkdown, DropText, UndoMarkdown, RedoText extends HistoryOperation {}
sig HistoryState {
  distinctPathKind: one Int,
  oldIdentityRemoved: one Int,
  droppedIdentityRemoved: one Int,
  reachableOperations: set HistoryOperation
}
one sig CurrentHistory, RepairedHistory extends HistoryState {}

fact HistoryFacts {
  CurrentHistory.distinctPathKind = 0
  CurrentHistory.oldIdentityRemoved = 0
  CurrentHistory.droppedIdentityRemoved = 0
  CurrentHistory.reachableOperations = HistoryOperation

  RepairedHistory.distinctPathKind = 1
  RepairedHistory.oldIdentityRemoved = 1
  RepairedHistory.droppedIdentityRemoved = 1
  RepairedHistory.reachableOperations = HistoryOperation
}

pred pathKindHistoryLifecycleContract[s: HistoryState] {
  s.distinctPathKind = 1
  s.oldIdentityRemoved = 1
  s.droppedIdentityRemoved = 1
  s.reachableOperations = HistoryOperation
}

assert CurrentPathKindHistoryLifecycleIsolated { pathKindHistoryLifecycleContract[CurrentHistory] }
assert RepairedPathKindHistoryLifecycleIsolated { pathKindHistoryLifecycleContract[RepairedHistory] }
pred RepairedHistoryNonVacuity {
  UndoMarkdown + RedoText in RepairedHistory.reachableOperations
}

abstract sig AttachmentLocation {}
one sig NoteFolder, VaultRoot, ConfiguredFolder extends AttachmentLocation {}
abstract sig AttachmentInput {}
one sig ValidMarkdown, InvalidSource, NonMarkdownNote extends AttachmentInput {}
sig AttachmentState {
  selectedLocation: one AttachmentLocation,
  input: one AttachmentInput,
  destinationCorrect: one Int,
  imported: one Int,
  embedInserted: one Int
}
one sig CurrentConfiguredAttachment, RepairNoteFolderAttachment,
  RepairVaultRootAttachment, RepairConfiguredFolderAttachment,
  RepairInvalidAttachment extends AttachmentState {}

fact AttachmentFacts {
  CurrentConfiguredAttachment.selectedLocation = ConfiguredFolder
  CurrentConfiguredAttachment.input = ValidMarkdown
  CurrentConfiguredAttachment.destinationCorrect = 0
  CurrentConfiguredAttachment.imported = 1
  CurrentConfiguredAttachment.embedInserted = 0

  RepairNoteFolderAttachment.selectedLocation = NoteFolder
  RepairNoteFolderAttachment.input = ValidMarkdown
  RepairNoteFolderAttachment.destinationCorrect = 1
  RepairNoteFolderAttachment.imported = 1
  RepairNoteFolderAttachment.embedInserted = 1

  RepairVaultRootAttachment.selectedLocation = VaultRoot
  RepairVaultRootAttachment.input = ValidMarkdown
  RepairVaultRootAttachment.destinationCorrect = 1
  RepairVaultRootAttachment.imported = 1
  RepairVaultRootAttachment.embedInserted = 1

  RepairConfiguredFolderAttachment.selectedLocation = ConfiguredFolder
  RepairConfiguredFolderAttachment.input = ValidMarkdown
  RepairConfiguredFolderAttachment.destinationCorrect = 1
  RepairConfiguredFolderAttachment.imported = 1
  RepairConfiguredFolderAttachment.embedInserted = 1

  RepairInvalidAttachment.selectedLocation = ConfiguredFolder
  RepairInvalidAttachment.input = InvalidSource
  RepairInvalidAttachment.destinationCorrect = 1
  RepairInvalidAttachment.imported = 0
  RepairInvalidAttachment.embedInserted = 0
}

pred attachmentDestinationImportEmbedContract[s: AttachmentState] {
  s.destinationCorrect = 1
  (s.input = ValidMarkdown implies s.imported = 1 and s.embedInserted = 1)
  (s.input != ValidMarkdown implies s.imported = 0 and s.embedInserted = 0)
}

assert CurrentAttachmentDestinationImportEmbedContract {
  attachmentDestinationImportEmbedContract[CurrentConfiguredAttachment]
}
assert RepairedAttachmentDestinationImportEmbedContract {
  all s: RepairNoteFolderAttachment + RepairVaultRootAttachment + RepairConfiguredFolderAttachment + RepairInvalidAttachment |
    attachmentDestinationImportEmbedContract[s]
}
pred RepairedAttachmentNonVacuity {
  RepairNoteFolderAttachment.embedInserted = 1
  RepairVaultRootAttachment.embedInserted = 1
  RepairConfiguredFolderAttachment.embedInserted = 1
}

pred CurrentRedWitness {
  not titleContract[CurrentTitle]
  not backlinkOwnershipContract[CurrentDuplicate]
  not deletionContract[CurrentDefaultDelete]
  not searchClassificationContract[CurrentSearch]
  not capabilityContract[CurrentCapabilities]
  not commandDescriptorPaletteContract[CurrentCommands]
  not pathKindHistoryLifecycleContract[CurrentHistory]
  not attachmentDestinationImportEmbedContract[CurrentConfiguredAttachment]
}

pred RepairedGreenWitness {
  titleContract[RepairedTitle]
  all s: RepairSelectA + RepairSelectB + RepairAmbiguous |
    minimumDuplicateResolutionContract[s] and backlinkOwnershipContract[s]
  all s: RepairSystemAvailable + RepairSystemUnavailable + RepairVaultTrash + RepairPermanent |
    deletionContract[s]
  searchClassificationContract[RepairedSearch]
  capabilityContract[RepairedCapabilities]
  commandDescriptorPaletteContract[RepairedCommands]
  pathKindHistoryLifecycleContract[RepairedHistory]
  all s: RepairNoteFolderAttachment + RepairVaultRootAttachment + RepairConfiguredFolderAttachment + RepairInvalidAttachment |
    attachmentDestinationImportEmbedContract[s]
}

check CurrentTitleMeetsCanonicalContract for 6 but 4 Int
check CurrentDuplicateBacklinksFollowResolution for 6 but 4 Int
check CurrentDeleteHonorsConfiguredPolicy for 6 but 4 Int
check CurrentSearchClassifiesOfficialSyntax for 24 but 4 Int
check CurrentCapabilitiesAreConnected for 12 but 4 Int

check RepairedTitleMeetsCanonicalContract for 6 but 4 Int
check RepairedDuplicateResolutionIsSingleOrExplicitAmbiguous for 8 but 4 Int
check RepairedDuplicateBacklinksFollowResolution for 8 but 4 Int
check RepairedDeleteHonorsConfiguredPolicy for 12 but 4 Int
check RepairedSearchClassifiesOfficialSyntax for 24 but 4 Int
check RepairedCapabilitiesAreConnected for 12 but 4 Int

check CurrentCommandDescriptorPaletteDispatchesWithoutConflict for 12 but 4 Int
check RepairedCommandDescriptorPaletteDispatchesWithoutConflict for 12 but 4 Int
run RepairedCommandNonVacuity for 12 but 4 Int
check CurrentPathKindHistoryLifecycleIsolated for 12 but 4 Int
check RepairedPathKindHistoryLifecycleIsolated for 12 but 4 Int
run RepairedHistoryNonVacuity for 12 but 4 Int
check CurrentAttachmentDestinationImportEmbedContract for 12 but 4 Int
check RepairedAttachmentDestinationImportEmbedContract for 16 but 4 Int
run RepairedAttachmentNonVacuity for 16 but 4 Int

run CurrentRedWitness for 24 but 4 Int
run RepairedGreenWitness for 24 but 4 Int
