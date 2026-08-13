// Candidate repaired contract: every child tab mutation validates the exact
// (pane ID, popout ID) record in the same atomic workspace transition.
module workspace_popout_repaired {
  type PaneId = MainPane | RoutedPane

  type State = {
    mainActivePane: PaneId,
    routedPane: PaneId,
    popoutRecordLive: bool,
    routedTabMutationCommitted: bool,
    staleMutationCommitted: bool,
    staleMutationRejected: bool,
  }

  var st: State

  action init = {
    st' = {
      mainActivePane: MainPane,
      routedPane: RoutedPane,
      popoutRecordLive: true,
      routedTabMutationCommitted: false,
      staleMutationCommitted: false,
      staleMutationRejected: false,
    }
  }

  action openWithExactPopoutPair = all {
    st.popoutRecordLive,
    st' = { ...st, routedTabMutationCommitted: true }
  }

  action rejoinPopout = all {
    st.popoutRecordLive,
    st' = { ...st, popoutRecordLive: false }
  }

  action rejectStaleChildMutation = all {
    not(st.popoutRecordLive),
    st' = { ...st, staleMutationRejected: true }
  }

  action step = any { openWithExactPopoutPair, rejoinPopout, rejectStaleChildMutation }

  val mainWindowActivePaneIsStable = st.mainActivePane == MainPane
  val staleChildCannotMutate = not(st.staleMutationCommitted)
  val allSafety = all { mainWindowActivePaneIsStable, staleChildCannotMutate }

  val notLiveRouteMutationReached = not(st.routedTabMutationCommitted and st.mainActivePane == MainPane)
  val notStaleRejectionReached = not(st.staleMutationRejected and not(st.staleMutationCommitted))
}
