// Historical unsafe candidate: a child window can steal the main active pane,
// and a stale child can mutate its old pane after the popout record is removed.
module workspace_popout_current {
  type PaneId = MainPane | RoutedPane

  type State = {
    mainActivePane: PaneId,
    routedPane: PaneId,
    popoutRecordLive: bool,
    routedTabMutationCommitted: bool,
    staleMutationCommitted: bool,
  }

  var st: State

  action init = {
    st' = {
      mainActivePane: MainPane,
      routedPane: RoutedPane,
      popoutRecordLive: true,
      routedTabMutationCommitted: false,
      staleMutationCommitted: false,
    }
  }

  // The old shared-active tab API routes the document but also steals focus.
  action openWithSharedActiveApi = all {
    st.popoutRecordLive,
    st' = { ...st, mainActivePane: RoutedPane, routedTabMutationCommitted: true }
  }

  action rejoinPopout = all {
    st.popoutRecordLive,
    st' = { ...st, popoutRecordLive: false }
  }

  // A pane-only API does not prove that the exact native popout record is live.
  action staleChildMutatesPane = all {
    not(st.popoutRecordLive),
    st' = { ...st, routedTabMutationCommitted: true, staleMutationCommitted: true }
  }

  action step = any { openWithSharedActiveApi, rejoinPopout, staleChildMutatesPane }

  val mainWindowActivePaneIsStable = st.mainActivePane == MainPane
  val staleChildCannotMutate = not(st.staleMutationCommitted)
}
