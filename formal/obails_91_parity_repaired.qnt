// Candidate repaired contract. GREEN here is a bounded design result, not production proof.
module obails_91_parity_repaired {
  type Mode = NoMode | SwitchMode | ExternalMode | LinkMode | TaskMode | WorkspaceMode
  type FileId = FileA | FileB
  type FileKind = Markdown | Text | Html
  type Content = BaseA | BaseB | LocalA | ExternalA | MissingContent
  type ExternalState = NoExternal | ExternalModified | ExternalDeleted | ExternalRenamed
  type TaskIdentity = NoTask | TaskA | TaskX
  type PaneId = PaneA | PaneB

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
    capturedFile: FileId,
    capturedGeneration: int,
    savedA: bool,
    switchedAfterFlush: bool,
    lostSwitchEdit: bool,
    externalState: ExternalState,
    diskGeneration: int,
    saveValidationComplete: bool,
    externalSaveCommitted: bool,
    externalCommitRejected: bool,
    saveConflict: bool,
    externalOverwrite: bool,
    renamedCopyExists: bool,
    deletedResurrection: bool,
    renamedResurrection: bool,
    indexReady: bool,
    indexGeneration: int,
    vaultGeneration: int,
    readinessGuardExercised: bool,
    linkReadOccurred: bool,
    linkReadBeforeReady: bool,
    viewOpen: bool,
    viewGeneration: int,
    graphReadGeneration: int,
    backlinksReadGeneration: int,
    rebuiltDuringView: bool,
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
    taskCommitRejected: bool,
    staleTaskRejected: bool,
    correctTaskUpdated: bool,
    workspaceLoaded: bool,
    workspaceSplit: bool,
    workspaceTabsReady: bool,
    workspacePersisted: bool,
    activePane: PaneId,
    detachedPane: PaneId,
    popoutRecordCount: int,
    trackedPopout: bool,
    popoutDetached: bool,
    restoreAttempted: bool,
    restoreConsistent: bool,
    popoutClosed: bool,
    popoutRejoined: bool,
    duplicateRecordAttempted: bool,
    duplicateRecordCreated: bool,
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
      capturedFile: FileA,
      capturedGeneration: 1,
      savedA: false,
      switchedAfterFlush: false,
      lostSwitchEdit: false,
      externalState: NoExternal,
      diskGeneration: 1,
      saveValidationComplete: false,
      externalSaveCommitted: false,
      externalCommitRejected: false,
      saveConflict: false,
      externalOverwrite: false,
      renamedCopyExists: false,
      deletedResurrection: false,
      renamedResurrection: false,
      indexReady: false,
      indexGeneration: 0,
      vaultGeneration: 1,
      readinessGuardExercised: false,
      linkReadOccurred: false,
      linkReadBeforeReady: false,
      viewOpen: false,
      viewGeneration: 0,
      graphReadGeneration: 0,
      backlinksReadGeneration: 0,
      rebuiltDuringView: false,
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
      taskCommitRejected: false,
      staleTaskRejected: false,
      correctTaskUpdated: false,
      workspaceLoaded: false,
      workspaceSplit: false,
      workspaceTabsReady: false,
      workspacePersisted: false,
      activePane: PaneA,
      detachedPane: PaneA,
      popoutRecordCount: 0,
      trackedPopout: false,
      popoutDetached: false,
      restoreAttempted: false,
      restoreConsistent: false,
      popoutClosed: false,
      popoutRejoined: false,
      duplicateRecordAttempted: false,
      duplicateRecordCreated: false,
    }
  }

  // Edit captures path/content/base generation. Switching is gated on a completed flush.
  action editMarkdownForSwitch = all {
    st.mode == NoMode,
    st' = { ...st, mode: SwitchMode, activeKind: Markdown, pendingKind: Markdown,
      editorContent: LocalA, dirty: true, pendingAutosave: true,
      capturedFile: FileA, capturedGeneration: st.diskGeneration }
  }
  action editTextForSwitch = all {
    st.mode == NoMode,
    st' = { ...st, mode: SwitchMode, activeKind: Text, pendingKind: Text,
      editorContent: LocalA, dirty: true, pendingAutosave: true,
      capturedFile: FileA, capturedGeneration: st.diskGeneration }
  }
  action editHtmlForSwitch = all {
    st.mode == NoMode,
    st' = { ...st, mode: SwitchMode, activeKind: Html, pendingKind: Html,
      editorContent: LocalA, dirty: true, pendingAutosave: true,
      capturedFile: FileA, capturedGeneration: st.diskGeneration }
  }
  action flushCapturedEdit = all {
    st.mode == SwitchMode,
    st.pendingAutosave,
    st.capturedFile == FileA,
    st.capturedGeneration == st.diskGeneration,
    st' = { ...st, diskA: LocalA, pendingAutosave: false, dirty: false, savedA: true }
  }
  action switchToMarkdown = all {
    st.mode == SwitchMode,
    st.activeFile == FileA,
    not(st.pendingAutosave),
    st.savedA,
    st' = { ...st, activeFile: FileB, activeKind: Markdown, editorContent: BaseB,
      switchedAfterFlush: true }
  }
  action switchToText = all {
    st.mode == SwitchMode,
    st.activeFile == FileA,
    not(st.pendingAutosave),
    st.savedA,
    st' = { ...st, activeFile: FileB, activeKind: Text, editorContent: BaseB,
      switchedAfterFlush: true }
  }
  action switchToHtml = all {
    st.mode == SwitchMode,
    st.activeFile == FileA,
    not(st.pendingAutosave),
    st.savedA,
    st' = { ...st, activeFile: FileB, activeKind: Html, editorContent: BaseB,
      switchedAfterFlush: true }
  }

  // Candidate external save protocol: validate, permit an external event, then
  // recheck at commit. This is an abstract candidate boundary, not an OS CAS proof.
  action editForExternalRace = all {
    st.mode == NoMode,
    st' = { ...st, mode: ExternalMode, activeKind: Markdown, pendingKind: Markdown,
      editorContent: LocalA, dirty: true, pendingAutosave: true,
      capturedFile: FileA, capturedGeneration: st.diskGeneration }
  }
  action validateExternalSave = all {
    st.mode == ExternalMode,
    st.externalState == NoExternal,
    st.pendingAutosave,
    not(st.saveValidationComplete),
    st.capturedGeneration == st.diskGeneration,
    st' = { ...st, saveValidationComplete: true }
  }
  action externalModifyAfterValidation = all {
    st.mode == ExternalMode,
    st.externalState == NoExternal,
    st.pendingAutosave,
    st.saveValidationComplete,
    st' = { ...st, externalState: ExternalModified, diskA: ExternalA,
      diskGeneration: st.diskGeneration + 1 }
  }
  action externalDeleteAfterValidation = all {
    st.mode == ExternalMode,
    st.externalState == NoExternal,
    st.pendingAutosave,
    st.saveValidationComplete,
    st' = { ...st, externalState: ExternalDeleted, diskA: MissingContent,
      diskGeneration: st.diskGeneration + 1 }
  }
  action externalRenameAfterValidation = all {
    st.mode == ExternalMode,
    st.externalState == NoExternal,
    st.pendingAutosave,
    st.saveValidationComplete,
    st' = { ...st, externalState: ExternalRenamed, diskA: MissingContent,
      renamedCopyExists: true, diskGeneration: st.diskGeneration + 1 }
  }
  action commitValidatedExternalSave = all {
    st.mode == ExternalMode,
    st.pendingAutosave,
    st.saveValidationComplete,
    if (st.externalState == NoExternal and st.capturedGeneration == st.diskGeneration) {
      st' = { ...st, diskA: LocalA, pendingAutosave: false, dirty: false,
        saveValidationComplete: false, externalSaveCommitted: true }
    } else {
      st' = { ...st, pendingAutosave: false, saveValidationComplete: false,
        saveConflict: true, externalCommitRejected: true }
    }
  }

  // Reads are unavailable before readiness; each view pins one immutable generation.
  action beginLinkScenario = all {
    st.mode == NoMode,
    st' = { ...st, mode: LinkMode, indexReady: false, indexGeneration: 0,
      vaultGeneration: 1 }
  }
  action rejectReadBeforeReady = all {
    st.mode == LinkMode,
    not(st.indexReady),
    st' = { ...st, readinessGuardExercised: true }
  }
  action buildFirstIndex = all {
    st.mode == LinkMode,
    not(st.indexReady),
    st' = { ...st, indexReady: true, indexGeneration: st.vaultGeneration }
  }
  action beginPinnedView = all {
    st.mode == LinkMode,
    st.indexReady,
    not(st.viewOpen),
    st' = { ...st, viewOpen: true, viewGeneration: st.indexGeneration,
      graphReadGeneration: st.indexGeneration, backlinksReadGeneration: 0,
      linkReadOccurred: true }
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
    st' = { ...st, indexGeneration: st.vaultGeneration,
      rebuiltDuringView: st.viewOpen or st.rebuiltDuringView }
  }
  action readBacklinksFromPinnedView = all {
    st.mode == LinkMode,
    st.viewOpen,
    st.viewGeneration > 0,
    st' = { ...st, backlinksReadGeneration: st.viewGeneration, viewOpen: false,
      mixedLinkGeneration: st.graphReadGeneration != st.viewGeneration }
  }

  // Validation returns a cached edit plan; commit rechecks generation/identity atomically.
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
    st.taskFileGeneration == st.taskRefGeneration,
    st.taskAtRef == st.taskRefIdentity,
    st' = { ...st, taskValidationComplete: true,
      cachedTaskGeneration: st.taskFileGeneration,
      cachedTaskIdentity: st.taskAtRef }
  }
  action rejectStaleTaskReference = all {
    st.mode == TaskMode,
    st.taskRefLive,
    not(st.taskValidationComplete),
    st.taskFileGeneration != st.taskRefGeneration or st.taskAtRef != st.taskRefIdentity,
    st' = { ...st, staleTaskRejected: true, taskRefLive: false }
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
    if (st.taskFileGeneration == st.cachedTaskGeneration and
        st.taskAtRef == st.cachedTaskIdentity) {
      st' = { ...st, taskWriteCommitted: true, correctTaskUpdated: true,
        taskRefLive: false, taskValidationComplete: false }
    } else {
      st' = { ...st, taskCommitRejected: true, staleTaskRejected: true,
        taskRefLive: false, taskValidationComplete: false }
    }
  }

  // Workspace/popup lifecycle keeps the persisted record and native tracking
  // distinct. A duplicate record request is rejected before it can alter state.
  action loadWorkspace = all {
    st.mode == NoMode,
    st' = { ...st, mode: WorkspaceMode, workspaceLoaded: true, activePane: PaneA }
  }
  action splitWorkspace = all {
    st.mode == WorkspaceMode,
    st.workspaceLoaded,
    not(st.workspaceSplit),
    st' = { ...st, workspaceSplit: true, workspaceTabsReady: true, activePane: PaneB }
  }
  action persistWorkspace = all {
    st.mode == WorkspaceMode,
    st.workspaceSplit,
    st.workspaceTabsReady,
    not(st.workspacePersisted),
    st' = { ...st, workspacePersisted: true }
  }
  action detachPaneToPopout = all {
    st.mode == WorkspaceMode,
    st.workspacePersisted,
    not(st.popoutDetached),
    st.activePane == PaneB,
    st' = { ...st, detachedPane: PaneB, popoutRecordCount: 1, popoutDetached: true }
  }
  action rejectDuplicatePopoutRecord = all {
    st.mode == WorkspaceMode,
    st.popoutDetached,
    st.popoutRecordCount == 1,
    st' = { ...st, duplicateRecordAttempted: true }
  }
  action restoreDetachedPopout = all {
    st.mode == WorkspaceMode,
    st.popoutDetached,
    st.popoutRecordCount == 1,
    not(st.trackedPopout),
    st' = { ...st, trackedPopout: true, restoreAttempted: true,
      restoreConsistent: st.detachedPane == PaneB }
  }
  action closeRestoredPopout = all {
    st.mode == WorkspaceMode,
    st.trackedPopout,
    st.popoutRecordCount == 1,
    st' = { ...st, trackedPopout: false, popoutRecordCount: 0, popoutClosed: true }
  }
  action rejoinRestoredPopout = all {
    st.mode == WorkspaceMode,
    st.trackedPopout,
    st.popoutRecordCount == 1,
    st' = { ...st, trackedPopout: false, popoutRecordCount: 0,
      popoutClosed: true, popoutRejoined: true }
  }

  action switchStep = any { editMarkdownForSwitch, editTextForSwitch, editHtmlForSwitch,
    flushCapturedEdit, switchToMarkdown, switchToText, switchToHtml }
  action markdownSwitchStep = any { editMarkdownForSwitch, flushCapturedEdit,
    switchToMarkdown, switchToText, switchToHtml }
  action textSwitchStep = any { editTextForSwitch, flushCapturedEdit,
    switchToMarkdown, switchToText, switchToHtml }
  action htmlSwitchStep = any { editHtmlForSwitch, flushCapturedEdit,
    switchToMarkdown, switchToText, switchToHtml }
  action externalStep = any { editForExternalRace, validateExternalSave,
    externalModifyAfterValidation, externalDeleteAfterValidation, externalRenameAfterValidation,
    commitValidatedExternalSave }
  action linkStep = any { beginLinkScenario, rejectReadBeforeReady, buildFirstIndex, beginPinnedView,
    externalLinkChange, rebuildSecondIndex, readBacklinksFromPinnedView }
  action taskStep = any { scanTaskA, insertTaskBeforeReference, validateTaskReference,
    rejectStaleTaskReference, externalTaskMutationAfterValidation,
    commitValidatedTaskReference }
  action workspaceStep = any { loadWorkspace, splitWorkspace, persistWorkspace,
    detachPaneToPopout, rejectDuplicatePopoutRecord, restoreDetachedPopout,
    closeRestoredPopout, rejoinRestoredPopout }
  action step = any { switchStep, externalStep, linkStep, taskStep, workspaceStep }

  val noSwitchEditLoss = not(st.lostSwitchEdit)
  val noExternalOverwrite = not(st.externalOverwrite)
  val noDeletedFileResurrection = not(st.deletedResurrection)
  val noRenamedPathResurrection = not(st.renamedResurrection)
  val linkReadsRequireReady = not(st.linkReadBeforeReady)
  val oneLinkSnapshotGeneration = not(st.mixedLinkGeneration) and
    (st.backlinksReadGeneration == 0 or st.backlinksReadGeneration == st.graphReadGeneration)
  val wrongTaskUpdated = st.taskWriteCommitted and st.taskTargetChangedAfterValidation
  val taskReferenceTargetsSameTask = not(wrongTaskUpdated)
  val noDuplicatePopoutRecord = not(st.duplicateRecordCreated) and st.popoutRecordCount <= 1
  val popoutRestoreUsesPersistedPaneIdentity = not(st.restoreAttempted) or
    (st.restoreConsistent and st.detachedPane == PaneB)
  val popoutTrackingMatchesRecord =
    (st.trackedPopout implies st.popoutRecordCount == 1) and
    (st.popoutClosed implies not(st.trackedPopout) and st.popoutRecordCount == 0)
  val allSafety = all { noSwitchEditLoss, noExternalOverwrite, noDeletedFileResurrection,
    noRenamedPathResurrection, linkReadsRequireReady, oneLinkSnapshotGeneration,
    taskReferenceTargetsSameTask, noDuplicatePopoutRecord,
    popoutRestoreUsesPersistedPaneIdentity, popoutTrackingMatchesRecord }

  // Negated reachability properties used to produce non-vacuity witnesses.
  val notMarkdownSwitchFlushReached = not(st.switchedAfterFlush and st.diskA == LocalA and st.pendingKind == Markdown)
  val notTextSwitchFlushReached = not(st.switchedAfterFlush and st.diskA == LocalA and st.pendingKind == Text)
  val notHtmlSwitchFlushReached = not(st.switchedAfterFlush and st.diskA == LocalA and st.pendingKind == Html)
  val notFreshExternalCommitReached = not(st.externalSaveCommitted and not(st.saveConflict))
  val notModifiedConflictReached = not(st.externalCommitRejected and st.externalState == ExternalModified)
  val notDeletedConflictReached = not(st.externalCommitRejected and st.externalState == ExternalDeleted)
  val notRenamedConflictReached = not(st.externalCommitRejected and st.externalState == ExternalRenamed)
  val notReadinessGuardReached = not(st.readinessGuardExercised)
  val notPinnedRebuildReached = not(st.rebuiltDuringView and st.backlinksReadGeneration > 0)
  val notFreshTaskUpdateReached = not(st.correctTaskUpdated)
  val notStaleTaskRejectionReached = not(st.staleTaskRejected)
  val notPostValidationTaskRejectionReached = not(st.taskCommitRejected and
    st.taskTargetChangedAfterValidation and not(st.taskWriteCommitted))
  val notWorkspaceRestoreCloseReached = not(st.workspaceLoaded and st.workspaceSplit and
    st.workspaceTabsReady and st.workspacePersisted and st.restoreAttempted and
    st.restoreConsistent and st.popoutClosed and not(st.popoutRejoined))
  val notWorkspaceRejoinReached = not(st.workspaceLoaded and st.workspaceSplit and
    st.workspaceTabsReady and st.workspacePersisted and st.restoreAttempted and
    st.restoreConsistent and st.popoutClosed and st.popoutRejoined)
}
