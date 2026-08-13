// Current Obails behavior for autosave, file identity, link snapshots, and task references.
// This model intentionally preserves implementation defects so their counterexamples stay RED.
module obails_91_parity_current {
  type Mode = NoMode | SwitchMode | ExternalMode | LinkMode | TaskMode
  type FileId = FileA | FileB
  type FileKind = Markdown | Text | Html
  type Content = BaseA | BaseB | LocalA | ExternalA | MissingContent
  type ExternalState = NoExternal | ExternalModified | ExternalDeleted | ExternalRenamed
  type TaskIdentity = NoTask | TaskA | TaskX

  type State = {
    mode: Mode,
    activeFile: FileId,
    activeKind: FileKind,
    pendingKind: FileKind,
    editorContent: Content,
    diskA: Content,
    diskB: Content,
    dirty: bool,
    pendingAutosave: bool,
    savedA: bool,
    lostSwitchEdit: bool,
    externalState: ExternalState,
    loadedGeneration: int,
    diskGeneration: int,
    externalOverwrite: bool,
    renamedCopyExists: bool,
    deletedResurrection: bool,
    renamedResurrection: bool,
    indexReady: bool,
    indexGeneration: int,
    vaultGeneration: int,
    linkReadOccurred: bool,
    linkReadBeforeReady: bool,
    viewOpen: bool,
    viewForwardGeneration: int,
    viewResolveGeneration: int,
    mixedLinkGeneration: bool,
    taskRefLive: bool,
    taskRefGeneration: int,
    taskFileGeneration: int,
    taskRefIdentity: TaskIdentity,
    taskAtRef: TaskIdentity,
    taskValidationComplete: bool,
    cachedTaskGeneration: int,
    cachedTaskIdentity: TaskIdentity,
    taskTargetChangedAfterValidation: bool,
    taskWriteCommitted: bool,
    wrongTaskUpdated: bool,
    correctTaskUpdated: bool,
  }

  var st: State

  action init = {
    st' = {
      mode: NoMode,
      activeFile: FileA,
      activeKind: Markdown,
      pendingKind: Markdown,
      editorContent: BaseA,
      diskA: BaseA,
      diskB: BaseB,
      dirty: false,
      pendingAutosave: false,
      savedA: false,
      lostSwitchEdit: false,
      externalState: NoExternal,
      loadedGeneration: 1,
      diskGeneration: 1,
      externalOverwrite: false,
      renamedCopyExists: false,
      deletedResurrection: false,
      renamedResurrection: false,
      indexReady: false,
      indexGeneration: 0,
      vaultGeneration: 1,
      linkReadOccurred: false,
      linkReadBeforeReady: false,
      viewOpen: false,
      viewForwardGeneration: 0,
      viewResolveGeneration: 0,
      mixedLinkGeneration: false,
      taskRefLive: false,
      taskRefGeneration: 0,
      taskFileGeneration: 1,
      taskRefIdentity: NoTask,
      taskAtRef: NoTask,
      taskValidationComplete: false,
      cachedTaskGeneration: 0,
      cachedTaskIdentity: NoTask,
      taskTargetChangedAfterValidation: false,
      taskWriteCommitted: false,
      wrongTaskUpdated: false,
      correctTaskUpdated: false,
    }
  }

  // The debounce callback captures no path/content. It reads global active state when it fires.
  action editMarkdownForSwitch = all {
    st.mode == NoMode,
    st' = { ...st, mode: SwitchMode, activeKind: Markdown, pendingKind: Markdown,
      editorContent: LocalA, dirty: true, pendingAutosave: true }
  }
  action editTextForSwitch = all {
    st.mode == NoMode,
    st' = { ...st, mode: SwitchMode, activeKind: Text, pendingKind: Text,
      editorContent: LocalA, dirty: true, pendingAutosave: true }
  }
  action editHtmlForSwitch = all {
    st.mode == NoMode,
    st' = { ...st, mode: SwitchMode, activeKind: Html, pendingKind: Html,
      editorContent: LocalA, dirty: true, pendingAutosave: true }
  }
  action autosaveBeforeSwitch = all {
    st.mode == SwitchMode,
    st.activeFile == FileA,
    st.pendingAutosave,
    st' = { ...st, diskA: LocalA, pendingAutosave: false, dirty: false, savedA: true }
  }
  action switchToMarkdown = all {
    st.mode == SwitchMode,
    st.activeFile == FileA,
    st.pendingAutosave,
    st' = { ...st, activeFile: FileB, activeKind: Markdown, editorContent: BaseB, dirty: false }
  }
  action switchToText = all {
    st.mode == SwitchMode,
    st.activeFile == FileA,
    st.pendingAutosave,
    st' = { ...st, activeFile: FileB, activeKind: Text, editorContent: BaseB, dirty: false }
  }
  action switchToHtml = all {
    st.mode == SwitchMode,
    st.activeFile == FileA,
    st.pendingAutosave,
    st' = { ...st, activeFile: FileB, activeKind: Html, editorContent: BaseB, dirty: false }
  }
  action debouncedAutosaveAfterSwitch = all {
    st.mode == SwitchMode,
    st.activeFile == FileB,
    st.pendingAutosave,
    st.diskA == BaseA,
    st' = { ...st, pendingAutosave: false, lostSwitchEdit: true }
  }

  // Dirty refresh is skipped, then WriteFile has no revision/existence CAS.
  action editForExternalRace = all {
    st.mode == NoMode,
    st' = { ...st, mode: ExternalMode, activeKind: Markdown, pendingKind: Markdown,
      editorContent: LocalA, dirty: true, pendingAutosave: true }
  }
  action externalModify = all {
    st.mode == ExternalMode,
    st.externalState == NoExternal,
    st.pendingAutosave,
    st' = { ...st, externalState: ExternalModified, diskA: ExternalA,
      diskGeneration: st.diskGeneration + 1 }
  }
  action externalDelete = all {
    st.mode == ExternalMode,
    st.externalState == NoExternal,
    st.pendingAutosave,
    st' = { ...st, externalState: ExternalDeleted, diskA: MissingContent,
      diskGeneration: st.diskGeneration + 1 }
  }
  action externalRename = all {
    st.mode == ExternalMode,
    st.externalState == NoExternal,
    st.pendingAutosave,
    st' = { ...st, externalState: ExternalRenamed, diskA: MissingContent,
      renamedCopyExists: true, diskGeneration: st.diskGeneration + 1 }
  }
  action saveAfterExternalModify = all {
    st.externalState == ExternalModified,
    st.pendingAutosave,
    st' = { ...st, diskA: LocalA, pendingAutosave: false, dirty: false,
      externalOverwrite: true }
  }
  action saveAfterExternalDelete = all {
    st.externalState == ExternalDeleted,
    st.pendingAutosave,
    st' = { ...st, diskA: LocalA, pendingAutosave: false, dirty: false,
      deletedResurrection: true }
  }
  action saveAfterExternalRename = all {
    st.externalState == ExternalRenamed,
    st.pendingAutosave,
    st' = { ...st, diskA: LocalA, pendingAutosave: false, dirty: false,
      renamedResurrection: true }
  }

  // Startup exposes an empty index as if it were a complete generation.
  action beginLinkScenario = all {
    st.mode == NoMode,
    st' = { ...st, mode: LinkMode, indexReady: false, indexGeneration: 0,
      vaultGeneration: 1 }
  }
  action readBacklinksBeforeReady = all {
    st.mode == LinkMode,
    not(st.indexReady),
    st' = { ...st, linkReadOccurred: true, linkReadBeforeReady: true }
  }
  action buildFirstIndex = all {
    st.mode == LinkMode,
    not(st.indexReady),
    st' = { ...st, indexReady: true, indexGeneration: st.vaultGeneration }
  }
  action beginGraphRead = all {
    st.mode == LinkMode,
    st.indexReady,
    not(st.viewOpen),
    st' = { ...st, viewOpen: true, viewForwardGeneration: st.indexGeneration }
  }
  action externalLinkChange = all {
    st.mode == LinkMode,
    st.indexReady,
    st.vaultGeneration == 1,
    st' = { ...st, vaultGeneration: 2 }
  }
  action rebuildSecondIndex = all {
    st.mode == LinkMode,
    st.indexReady,
    st.indexGeneration < st.vaultGeneration,
    st' = { ...st, indexGeneration: st.vaultGeneration }
  }
  action resolveGraphAgainstLiveIndex = all {
    st.mode == LinkMode,
    st.viewOpen,
    st.indexGeneration != st.viewForwardGeneration,
    st' = { ...st, viewResolveGeneration: st.indexGeneration, viewOpen: false,
      mixedLinkGeneration: true }
  }

  // resolveTaskReference validates generation/identity and returns cached lines. WriteFile is later.
  action scanTaskA = all {
    st.mode == NoMode,
    st' = { ...st, mode: TaskMode, taskRefLive: true,
      taskRefGeneration: 1, taskFileGeneration: 1,
      taskRefIdentity: TaskA, taskAtRef: TaskA }
  }
  action insertTaskBeforeReference = all {
    st.mode == TaskMode,
    st.taskRefLive,
    not(st.taskValidationComplete),
    st.taskAtRef == TaskA,
    st' = { ...st, taskFileGeneration: 2, taskAtRef: TaskX }
  }
  action validateTaskReference = all {
    st.mode == TaskMode,
    st.taskRefLive,
    not(st.taskValidationComplete),
    st.taskAtRef == TaskA,
    st.taskFileGeneration == st.taskRefGeneration,
    st.taskAtRef == st.taskRefIdentity,
    st' = { ...st, taskValidationComplete: true,
      cachedTaskGeneration: st.taskFileGeneration,
      cachedTaskIdentity: st.taskAtRef }
  }
  action externalTaskMutationAfterValidation = all {
    st.mode == TaskMode,
    st.taskRefLive,
    st.taskValidationComplete,
    st.taskAtRef == st.cachedTaskIdentity,
    st.taskFileGeneration == st.cachedTaskGeneration,
    st' = { ...st, taskFileGeneration: st.taskFileGeneration + 1,
      taskAtRef: TaskX, taskTargetChangedAfterValidation: true }
  }
  action commitValidatedTaskReference = all {
    st.mode == TaskMode,
    st.taskRefLive,
    st.taskValidationComplete,
    st' = { ...st,
      taskAtRef: st.cachedTaskIdentity,
      taskWriteCommitted: true,
      wrongTaskUpdated: st.taskTargetChangedAfterValidation or
        st.taskFileGeneration != st.cachedTaskGeneration or
        st.taskAtRef != st.cachedTaskIdentity,
      correctTaskUpdated: not(st.taskTargetChangedAfterValidation) and
        st.taskFileGeneration == st.cachedTaskGeneration and
        st.taskAtRef == st.cachedTaskIdentity,
      taskRefLive: false,
      taskValidationComplete: false }
  }

  action switchStep = any { editMarkdownForSwitch, editTextForSwitch, editHtmlForSwitch,
    autosaveBeforeSwitch, switchToMarkdown, switchToText, switchToHtml, debouncedAutosaveAfterSwitch }
  action markdownSwitchStep = any { editMarkdownForSwitch, autosaveBeforeSwitch,
    switchToMarkdown, switchToText, switchToHtml, debouncedAutosaveAfterSwitch }
  action textSwitchStep = any { editTextForSwitch, autosaveBeforeSwitch,
    switchToMarkdown, switchToText, switchToHtml, debouncedAutosaveAfterSwitch }
  action htmlSwitchStep = any { editHtmlForSwitch, autosaveBeforeSwitch,
    switchToMarkdown, switchToText, switchToHtml, debouncedAutosaveAfterSwitch }
  action externalStep = any { editForExternalRace, externalModify, externalDelete, externalRename,
    saveAfterExternalModify, saveAfterExternalDelete, saveAfterExternalRename }
  action linkStep = any { beginLinkScenario, readBacklinksBeforeReady, buildFirstIndex, beginGraphRead,
    externalLinkChange, rebuildSecondIndex, resolveGraphAgainstLiveIndex }
  action taskStep = any { scanTaskA, insertTaskBeforeReference, validateTaskReference,
    externalTaskMutationAfterValidation, commitValidatedTaskReference }
  action step = any { switchStep, externalStep, linkStep, taskStep }

  val noSwitchEditLoss = not(st.lostSwitchEdit)
  val noExternalOverwrite = not(st.externalOverwrite)
  val noDeletedFileResurrection = not(st.deletedResurrection)
  val noRenamedPathResurrection = not(st.renamedResurrection)
  val linkReadsRequireReady = not(st.linkReadBeforeReady)
  val oneLinkSnapshotGeneration = not(st.mixedLinkGeneration)
  val taskReferenceTargetsSameTask = not(st.wrongTaskUpdated)
  val allSafety = all { noSwitchEditLoss, noExternalOverwrite, noDeletedFileResurrection,
    noRenamedPathResurrection, linkReadsRequireReady, oneLinkSnapshotGeneration,
    taskReferenceTargetsSameTask }

  val notSafeSwitchSaveReached = not(st.savedA)
  val notFreshTaskUpdateReached = not(st.correctTaskUpdated)
}
