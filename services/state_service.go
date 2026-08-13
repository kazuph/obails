package services

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/kazuph/obails/models"
)

// StateService handles application session state stored in vault
type StateService struct {
	mu            sync.RWMutex
	configService *ConfigService
	state         *models.State
}

// NewStateService creates a new StateService
func NewStateService(configService *ConfigService) *StateService {
	return &StateService{
		configService: configService,
		state:         models.DefaultState(),
	}
}

// getStatePath returns the path to the state file
func (s *StateService) getStatePath() string {
	vaultPath := s.configService.GetVaultPath()
	if vaultPath == "" {
		return ""
	}
	return filepath.Join(vaultPath, ".obails", "state.json")
}

// Load reads state from file
func (s *StateService) Load() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	statePath := s.getStatePath()
	if statePath == "" {
		s.state = models.DefaultState()
		return nil
	}

	if err := checkExistingStatePath(statePath); err != nil {
		return err
	}

	if _, err := os.Lstat(statePath); os.IsNotExist(err) {
		s.state = models.DefaultState()
		return nil
	} else if err != nil {
		return err
	}

	data, err := os.ReadFile(statePath)
	if err != nil {
		return err
	}

	state := models.DefaultState()
	if err := json.Unmarshal(data, state); err != nil {
		return fmt.Errorf("decode state: %w", err)
	}
	if err := state.Validate(); err != nil {
		return fmt.Errorf("validate state: %w", err)
	}
	s.state = state
	return nil
}

// Save writes state to file
func (s *StateService) Save() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveStateLocked(s.state.Clone())
}

func (s *StateService) saveStateLocked(state *models.State) error {
	statePath := s.getStatePath()
	if statePath == "" {
		return nil
	}

	stateDir := filepath.Dir(statePath)
	if err := os.MkdirAll(stateDir, 0755); err != nil {
		return err
	}
	if err := checkExistingStatePath(statePath); err != nil {
		return err
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}

	return writeStateFile(statePath, data)
}

// SetLastOpenedFile sets the last opened file and saves
func (s *StateService) SetLastOpenedFile(path string, fileType string) error {
	return s.updateState(func(candidate *models.State) error {
		candidate.LastOpenedFile = &models.LastOpenedFile{
			Path:     path,
			FileType: fileType,
		}
		return nil
	})
}

// GetLastOpenedFile returns the last opened file information
func (s *StateService) GetLastOpenedFile() *models.LastOpenedFile {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state.Clone().LastOpenedFile
}

// ClearLastOpenedFile clears the last opened file and saves
func (s *StateService) ClearLastOpenedFile() error {
	return s.updateState(func(candidate *models.State) error {
		candidate.LastOpenedFile = nil
		return nil
	})
}

// SetWorkspaceState validates and persists tabs, pane layout, complete saved workspaces, and popouts.
func (s *StateService) SetWorkspaceState(workspace models.WorkspaceState) error {
	if err := workspace.Validate(); err != nil {
		return err
	}
	workspace = (&models.State{Workspace: workspace}).Clone().Workspace
	return s.updateState(func(candidate *models.State) error {
		candidate.Workspace = workspace
		return nil
	})
}

func (s *StateService) GetWorkspaceState() models.WorkspaceState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state.Clone().Workspace
}

// EnsureWorkspace creates the first pane only when the active workspace is empty.
func (s *StateService) EnsureWorkspace(paneID string) (models.WorkspaceState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !exactWorkspaceID(paneID) {
		return models.WorkspaceState{}, fmt.Errorf("pane ID is required")
	}

	current := s.state.Clone()
	if !workspaceIsEmpty(current.Workspace) {
		if current.Workspace.PaneTree == nil {
			return models.WorkspaceState{}, fmt.Errorf("workspace is incomplete")
		}
		if err := current.Validate(); err != nil {
			return models.WorkspaceState{}, fmt.Errorf("workspace is not valid: %w", err)
		}
		if _, err := workspacePane(&current.Workspace, current.Workspace.ActivePaneID); err != nil {
			return models.WorkspaceState{}, fmt.Errorf("workspace active pane is invalid: %w", err)
		}
		return current.Clone().Workspace, nil
	}

	candidate := current
	candidate.Workspace.PaneTree = &models.PaneTree{PaneID: paneID}
	candidate.Workspace.PaneTabs = []models.PaneTabs{{PaneID: paneID}}
	candidate.Workspace.ActivePaneID = paneID
	if err := candidate.Validate(); err != nil {
		return models.WorkspaceState{}, err
	}
	if err := s.saveStateLocked(candidate); err != nil {
		return models.WorkspaceState{}, err
	}
	s.state = candidate
	return candidate.Clone().Workspace, nil
}

// ActivateWorkspacePane makes an existing pane active without changing its tabs or layout.
func (s *StateService) ActivateWorkspacePane(paneID string) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		if err := workspace.Validate(); err != nil {
			return fmt.Errorf("workspace is not valid: %w", err)
		}
		if workspace.PaneTree == nil {
			return fmt.Errorf("workspace has no pane tree")
		}
		if !paneTreeContainsID(*workspace.PaneTree, paneID) {
			return fmt.Errorf("pane %q is not in the workspace", paneID)
		}
		if _, err := workspacePane(workspace, paneID); err != nil {
			return err
		}
		workspace.ActivePaneID = paneID
		return nil
	})
}

// OpenWorkspaceTab adds or refreshes one tab and makes it active in its pane.
func (s *StateService) OpenWorkspaceTab(paneID string, tab models.WorkspaceTab) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		return openWorkspaceTab(workspace, paneID, tab, true)
	})
}

// RewriteWorkspaceTabsAfterMove replaces matching current-session tab records
// in place after a file or folder move. It does not add tabs, does not change
// the active pane, and does not rewrite saved named workspaces.
func (s *StateService) RewriteWorkspaceTabsAfterMove(previousPath, nextPath string, isDir bool) (models.WorkspaceState, error) {
	if !exactWorkspaceID(previousPath) {
		return models.WorkspaceState{}, fmt.Errorf("previous path is required")
	}
	if !exactWorkspaceID(nextPath) {
		return models.WorkspaceState{}, fmt.Errorf("next path is required")
	}
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		rewriteWorkspaceTabsAfterMove(workspace, previousPath, nextPath, isDir)
		return nil
	})
}

// OpenWorkspaceTabInPopout adds or refreshes a tab only when the exact routed
// native popout is still tracked. It does not change the shared active pane.
func (s *StateService) OpenWorkspaceTabInPopout(paneID, popoutID string, tab models.WorkspaceTab) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		if err := validatePopoutWorkspaceRoute(workspace, paneID, popoutID); err != nil {
			return err
		}
		return openWorkspaceTab(workspace, paneID, tab, false)
	})
}

// ActivateWorkspaceTab makes an existing tab and pane active.
func (s *StateService) ActivateWorkspaceTab(paneID, path string) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		return activateWorkspaceTab(workspace, paneID, path, true)
	})
}

// ActivateWorkspaceTabInPopout changes only the selected tab when the exact
// routed native popout remains tracked. The shared active pane stays unchanged.
func (s *StateService) ActivateWorkspaceTabInPopout(paneID, popoutID, path string) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		if err := validatePopoutWorkspaceRoute(workspace, paneID, popoutID); err != nil {
			return err
		}
		return activateWorkspaceTab(workspace, paneID, path, false)
	})
}

// CloseWorkspaceTab removes exactly one tab. If it was active, the final
// remaining tab becomes active.
func (s *StateService) CloseWorkspaceTab(paneID, path string) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		return closeWorkspaceTab(workspace, paneID, path)
	})
}

// CloseWorkspaceTabInPopout removes one tab only when the exact native route
// remains tracked. It leaves the shared active pane unchanged.
func (s *StateService) CloseWorkspaceTabInPopout(paneID, popoutID, path string) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		if err := validatePopoutWorkspaceRoute(workspace, paneID, popoutID); err != nil {
			return err
		}
		return closeWorkspaceTab(workspace, paneID, path)
	})
}

// SplitWorkspacePane replaces one leaf pane with a two-child split and makes
// the new pane active.
func (s *StateService) SplitWorkspacePane(paneID string, direction models.SplitDirection, newPaneID string) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		if workspace.PaneTree == nil {
			return fmt.Errorf("workspace has no pane tree")
		}
		if direction != models.SplitDirectionHorizontal && direction != models.SplitDirectionVertical {
			return fmt.Errorf("invalid split direction %q", direction)
		}
		if !exactWorkspaceID(newPaneID) {
			return fmt.Errorf("new pane ID is required")
		}
		if _, err := workspacePane(workspace, paneID); err != nil {
			return err
		}
		if paneTreeContainsID(*workspace.PaneTree, newPaneID) {
			return fmt.Errorf("pane %q already exists", newPaneID)
		}
		split, changed := splitWorkspacePaneTree(*workspace.PaneTree, paneID, direction, newPaneID)
		if !changed {
			return fmt.Errorf("pane %q is not a leaf pane", paneID)
		}
		workspace.PaneTree = &split
		workspace.PaneTabs = append(workspace.PaneTabs, models.PaneTabs{PaneID: newPaneID})
		workspace.ActivePaneID = newPaneID
		return nil
	})
}

// CloseWorkspacePane removes one non-final pane, its tabs, and any popout for it.
func (s *StateService) CloseWorkspacePane(paneID string) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		if workspace.PaneTree == nil {
			return fmt.Errorf("workspace has no pane tree")
		}
		if !paneTreeContainsID(*workspace.PaneTree, paneID) {
			return fmt.Errorf("pane %q is not in the workspace", paneID)
		}
		if paneTreeLeafCount(*workspace.PaneTree) <= 1 {
			return fmt.Errorf("cannot close the final workspace pane")
		}
		nextTree, removed := removeWorkspacePaneTree(*workspace.PaneTree, paneID)
		if !removed || nextTree == nil {
			return fmt.Errorf("pane %q could not be closed", paneID)
		}
		workspace.PaneTree = nextTree
		workspace.PaneTabs = removeWorkspacePaneTabs(workspace.PaneTabs, paneID)
		workspace.PopoutWindows = removeWorkspacePanePopouts(workspace.PopoutWindows, paneID)
		if workspace.ActivePaneID == paneID {
			workspace.ActivePaneID = workspace.PaneTabs[0].PaneID
		}
		return nil
	})
}

// UpdateWorkspaceSplitWeights replaces the weights for the split located by a
// zero-based child-index path from the workspace root.
func (s *StateService) UpdateWorkspaceSplitWeights(path []int, weights []float64) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		if workspace.PaneTree == nil {
			return fmt.Errorf("workspace has no pane tree")
		}
		node := workspace.PaneTree
		for _, index := range path {
			if index < 0 || index >= len(node.Children) {
				return fmt.Errorf("workspace split path is invalid")
			}
			node = &node.Children[index]
		}
		if len(node.Children) == 0 {
			return fmt.Errorf("workspace split path identifies a pane")
		}
		if len(weights) != len(node.Children) {
			return fmt.Errorf("workspace split weights must match child panes")
		}
		node.Weights = append([]float64(nil), weights...)
		return nil
	})
}

// SaveNamedWorkspace stores the current complete layout under name, replacing
// an existing snapshot with the same name.
func (s *StateService) SaveNamedWorkspace(name string) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		if !exactWorkspaceID(name) {
			return fmt.Errorf("saved workspace name is required")
		}
		if err := validateOperationalWorkspace(workspace); err != nil {
			return fmt.Errorf("current workspace is not operational: %w", err)
		}
		snapshot := models.NamedWorkspace{Name: name, Layout: workspaceLayout(*workspace)}
		for index := range workspace.SavedWorkspaces {
			if workspace.SavedWorkspaces[index].Name == name {
				workspace.SavedWorkspaces[index] = snapshot
				workspace.ActiveNamedWorkspace = name
				return nil
			}
		}
		workspace.SavedWorkspaces = append(workspace.SavedWorkspaces, snapshot)
		workspace.ActiveNamedWorkspace = name
		return nil
	})
}

// RestoreNamedWorkspace atomically restores a saved layout while retaining all
// named workspace snapshots.
func (s *StateService) RestoreNamedWorkspace(name string) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		for _, snapshot := range workspace.SavedWorkspaces {
			if snapshot.Name != name {
				continue
			}
			layout := cloneWorkspaceLayout(snapshot.Layout)
			if err := validateOperationalWorkspaceLayout(layout); err != nil {
				return fmt.Errorf("saved workspace %q is not operational: %w", name, err)
			}
			workspace.PaneTree = layout.PaneTree
			workspace.PaneTabs = layout.PaneTabs
			workspace.ActivePaneID = layout.ActivePaneID
			workspace.PopoutWindows = layout.PopoutWindows
			workspace.ActiveNamedWorkspace = name
			return nil
		}
		return fmt.Errorf("saved workspace %q does not exist", name)
	})
}

// RenameNamedWorkspace changes one saved snapshot's name without touching the
// current session tabs, splits, layout, or popouts.
func (s *StateService) RenameNamedWorkspace(name, newName string) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		if !exactWorkspaceID(name) || !exactWorkspaceID(newName) {
			return fmt.Errorf("saved workspace name is required")
		}
		if name == newName {
			return nil
		}
		index := namedWorkspaceIndex(workspace.SavedWorkspaces, name)
		if index < 0 {
			return fmt.Errorf("saved workspace %q does not exist", name)
		}
		if namedWorkspaceIndex(workspace.SavedWorkspaces, newName) >= 0 {
			return fmt.Errorf("saved workspace %q already exists", newName)
		}
		workspace.SavedWorkspaces[index].Name = newName
		if workspace.ActiveNamedWorkspace == name {
			workspace.ActiveNamedWorkspace = newName
		}
		return nil
	})
}

// DeleteNamedWorkspace removes one saved snapshot and leaves the current
// session tabs, splits, layout, and popouts unchanged.
func (s *StateService) DeleteNamedWorkspace(name string) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		if !exactWorkspaceID(name) {
			return fmt.Errorf("saved workspace name is required")
		}
		index := namedWorkspaceIndex(workspace.SavedWorkspaces, name)
		if index < 0 {
			return fmt.Errorf("saved workspace %q does not exist", name)
		}
		workspace.SavedWorkspaces = append(workspace.SavedWorkspaces[:index], workspace.SavedWorkspaces[index+1:]...)
		if workspace.ActiveNamedWorkspace == name {
			workspace.ActiveNamedWorkspace = ""
		}
		return nil
	})
}

// AddPopoutWindow validates and persists one newly detached pane, returning
// the authoritative workspace snapshot after the write succeeds.
func (s *StateService) AddPopoutWindow(popout models.PopoutWindow) (models.WorkspaceState, error) {
	return s.updateWorkspace(func(workspace *models.WorkspaceState) error {
		if workspace.PaneTree == nil {
			return fmt.Errorf("workspace has no pane tree")
		}
		visiblePaneID := firstVisibleWorkspacePane(*workspace.PaneTree, workspace.PopoutWindows, popout.PaneID)
		if visiblePaneID == "" {
			return fmt.Errorf("cannot pop out the final visible workspace pane")
		}
		workspace.PopoutWindows = append(workspace.PopoutWindows, popout)
		if workspace.ActivePaneID == popout.PaneID {
			workspace.ActivePaneID = visiblePaneID
		}
		return nil
	})
}

// UpdatePopoutWindowGeometryForPane refuses geometry from a window whose route
// no longer identifies the persisted pane.
func (s *StateService) UpdatePopoutWindowGeometryForPane(id, paneID string, x, y, width, height int) error {
	return s.updateState(func(candidate *models.State) error {
		for index := range candidate.Workspace.PopoutWindows {
			popout := &candidate.Workspace.PopoutWindows[index]
			if popout.ID == id && popout.PaneID == paneID {
				popout.X = x
				popout.Y = y
				popout.Width = width
				popout.Height = height
				return nil
			}
		}
		return fmt.Errorf("popout window %q is not tracked for pane %q", id, paneID)
	})
}

// RemovePopoutWindowIfMatches removes a record only when both URL identifiers
// still match the persisted popout record. A no-match is a save-free snapshot.
func (s *StateService) RemovePopoutWindowIfMatches(id, paneID string) (models.WorkspaceState, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	candidate := s.state.Clone()
	for index := range candidate.Workspace.PopoutWindows {
		popout := candidate.Workspace.PopoutWindows[index]
		if popout.ID != id || popout.PaneID != paneID {
			continue
		}
		candidate.Workspace.PopoutWindows = append(candidate.Workspace.PopoutWindows[:index], candidate.Workspace.PopoutWindows[index+1:]...)
		if err := candidate.Validate(); err != nil {
			return models.WorkspaceState{}, false, err
		}
		if err := s.saveStateLocked(candidate); err != nil {
			return models.WorkspaceState{}, false, err
		}
		s.state = candidate
		return candidate.Clone().Workspace, true, nil
	}
	return candidate.Clone().Workspace, false, nil
}

// SetExplorerSessionState persists presentation-only explorer state without touching referenced paths.
func (s *StateService) SetExplorerSessionState(explorer models.ExplorerSessionState) error {
	if explorer.LeftSidebarWidth <= 0 || explorer.RightSidebarWidth <= 0 {
		return fmt.Errorf("explorer sidebar widths must be positive")
	}
	if err := explorer.Validate(); err != nil {
		return err
	}
	explorer = (&models.State{Explorer: explorer}).Clone().Explorer
	return s.updateState(func(candidate *models.State) error {
		candidate.Explorer = explorer
		return nil
	})
}

func (s *StateService) GetExplorerSessionState() models.ExplorerSessionState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state.Clone().Explorer
}

// updateState serializes a candidate write and swaps the running state only
// after the real filesystem write succeeds.
func (s *StateService) updateState(mutate func(*models.State) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	candidate := s.state.Clone()
	if err := mutate(candidate); err != nil {
		return err
	}
	if err := candidate.Validate(); err != nil {
		return err
	}
	if err := s.saveStateLocked(candidate); err != nil {
		return err
	}
	s.state = candidate
	return nil
}

// updateWorkspace applies one workspace operation while holding the state
// mutex, validates the complete state, persists it, then returns its snapshot.
func (s *StateService) updateWorkspace(mutate func(*models.WorkspaceState) error) (models.WorkspaceState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	candidate := s.state.Clone()
	if err := mutate(&candidate.Workspace); err != nil {
		return models.WorkspaceState{}, err
	}
	if err := candidate.Validate(); err != nil {
		return models.WorkspaceState{}, err
	}
	if err := s.saveStateLocked(candidate); err != nil {
		return models.WorkspaceState{}, err
	}
	s.state = candidate
	return candidate.Clone().Workspace, nil
}

func workspacePane(workspace *models.WorkspaceState, paneID string) (*models.PaneTabs, error) {
	if !exactWorkspaceID(paneID) {
		return nil, fmt.Errorf("pane ID is required")
	}
	for index := range workspace.PaneTabs {
		if workspace.PaneTabs[index].PaneID == paneID {
			return &workspace.PaneTabs[index], nil
		}
	}
	return nil, fmt.Errorf("pane %q is not in the workspace", paneID)
}

func openWorkspaceTab(workspace *models.WorkspaceState, paneID string, tab models.WorkspaceTab, activatePane bool) error {
	pane, err := workspacePane(workspace, paneID)
	if err != nil {
		return err
	}
	if err := validateWorkspaceTabInput(tab); err != nil {
		return err
	}
	for index := range pane.Tabs {
		if pane.Tabs[index].Path != tab.Path {
			continue
		}
		pane.Tabs[index] = tab
		pane.ActiveTabPath = tab.Path
		if activatePane {
			workspace.ActivePaneID = paneID
		}
		return nil
	}
	pane.Tabs = append(pane.Tabs, tab)
	pane.ActiveTabPath = tab.Path
	if activatePane {
		workspace.ActivePaneID = paneID
	}
	return nil
}

func activateWorkspaceTab(workspace *models.WorkspaceState, paneID, path string, activatePane bool) error {
	pane, err := workspacePane(workspace, paneID)
	if err != nil {
		return err
	}
	for _, tab := range pane.Tabs {
		if tab.Path != path {
			continue
		}
		pane.ActiveTabPath = path
		if activatePane {
			workspace.ActivePaneID = paneID
		}
		return nil
	}
	return fmt.Errorf("tab %q is not open in pane %q", path, paneID)
}

func closeWorkspaceTab(workspace *models.WorkspaceState, paneID, path string) error {
	pane, err := workspacePane(workspace, paneID)
	if err != nil {
		return err
	}
	for index, tab := range pane.Tabs {
		if tab.Path != path {
			continue
		}
		pane.Tabs = append(pane.Tabs[:index], pane.Tabs[index+1:]...)
		if pane.ActiveTabPath == path {
			pane.ActiveTabPath = ""
			if len(pane.Tabs) > 0 {
				pane.ActiveTabPath = pane.Tabs[len(pane.Tabs)-1].Path
			}
		}
		return nil
	}
	return fmt.Errorf("tab %q is not open in pane %q", path, paneID)
}

func rewritePathAfterMove(path, previousPath, nextPath string, isDir bool) string {
	if path == "" {
		return path
	}
	if path == previousPath {
		return nextPath
	}
	if isDir && strings.HasPrefix(path, previousPath+"/") {
		return nextPath + path[len(previousPath):]
	}
	return path
}

func rewriteWorkspaceTabsAfterMove(workspace *models.WorkspaceState, previousPath, nextPath string, isDir bool) {
	for index := range workspace.PaneTabs {
		pane := &workspace.PaneTabs[index]
		seen := make(map[string]struct{}, len(pane.Tabs))
		nextTabs := make([]models.WorkspaceTab, 0, len(pane.Tabs))
		for _, tab := range pane.Tabs {
			tab.Path = rewritePathAfterMove(tab.Path, previousPath, nextPath, isDir)
			if _, exists := seen[tab.Path]; exists {
				continue
			}
			seen[tab.Path] = struct{}{}
			nextTabs = append(nextTabs, tab)
		}
		pane.Tabs = nextTabs
		active := rewritePathAfterMove(pane.ActiveTabPath, previousPath, nextPath, isDir)
		if _, exists := seen[active]; exists {
			pane.ActiveTabPath = active
			continue
		}
		if len(nextTabs) > 0 {
			pane.ActiveTabPath = nextTabs[len(nextTabs)-1].Path
			continue
		}
		pane.ActiveTabPath = ""
	}
}

func validatePopoutWorkspaceRoute(workspace *models.WorkspaceState, paneID, popoutID string) error {
	if !exactWorkspaceID(popoutID) {
		return fmt.Errorf("popout ID is required")
	}
	for _, popout := range workspace.PopoutWindows {
		if popout.ID == popoutID && popout.PaneID == paneID {
			return nil
		}
	}
	return fmt.Errorf("popout %q is not tracked for pane %q", popoutID, paneID)
}

func validateOperationalWorkspace(workspace *models.WorkspaceState) error {
	if workspace.PaneTree == nil {
		return fmt.Errorf("workspace has no pane tree")
	}
	if err := workspace.Validate(); err != nil {
		return err
	}
	_, err := workspacePane(workspace, workspace.ActivePaneID)
	return err
}

func validateOperationalWorkspaceLayout(layout models.WorkspaceLayout) error {
	return validateOperationalWorkspace(&models.WorkspaceState{
		PaneTree:      layout.PaneTree,
		PaneTabs:      layout.PaneTabs,
		ActivePaneID:  layout.ActivePaneID,
		PopoutWindows: layout.PopoutWindows,
	})
}

func validateWorkspaceTabInput(tab models.WorkspaceTab) error {
	if tab.Path == "" || strings.TrimSpace(tab.FileType) == "" || tab.FileType != strings.TrimSpace(tab.FileType) {
		return fmt.Errorf("workspace tabs require path and exact file type")
	}
	return nil
}

func exactWorkspaceID(value string) bool {
	return strings.TrimSpace(value) != "" && value == strings.TrimSpace(value)
}

func namedWorkspaceIndex(saved []models.NamedWorkspace, name string) int {
	for index, workspace := range saved {
		if workspace.Name == name {
			return index
		}
	}
	return -1
}

func workspaceIsEmpty(workspace models.WorkspaceState) bool {
	return workspace.PaneTree == nil && len(workspace.PaneTabs) == 0 && workspace.ActivePaneID == "" && len(workspace.PopoutWindows) == 0
}

func paneTreeContainsID(node models.PaneTree, paneID string) bool {
	if len(node.Children) == 0 {
		return node.PaneID == paneID
	}
	for _, child := range node.Children {
		if paneTreeContainsID(child, paneID) {
			return true
		}
	}
	return false
}

func paneTreeLeafCount(node models.PaneTree) int {
	if len(node.Children) == 0 {
		return 1
	}
	count := 0
	for _, child := range node.Children {
		count += paneTreeLeafCount(child)
	}
	return count
}

func firstVisibleWorkspacePane(tree models.PaneTree, popouts []models.PopoutWindow, excludingPaneID string) string {
	detached := make(map[string]struct{}, len(popouts)+1)
	detached[excludingPaneID] = struct{}{}
	for _, popout := range popouts {
		detached[popout.PaneID] = struct{}{}
	}
	var first func(models.PaneTree) string
	first = func(node models.PaneTree) string {
		if len(node.Children) == 0 {
			if _, hidden := detached[node.PaneID]; !hidden {
				return node.PaneID
			}
			return ""
		}
		for _, child := range node.Children {
			if paneID := first(child); paneID != "" {
				return paneID
			}
		}
		return ""
	}
	return first(tree)
}

func splitWorkspacePaneTree(node models.PaneTree, paneID string, direction models.SplitDirection, newPaneID string) (models.PaneTree, bool) {
	if len(node.Children) == 0 {
		if node.PaneID != paneID {
			return node, false
		}
		return models.PaneTree{SplitDirection: direction, Children: []models.PaneTree{{PaneID: paneID}, {PaneID: newPaneID}}, Weights: []float64{1, 1}}, true
	}
	for index := range node.Children {
		child, changed := splitWorkspacePaneTree(node.Children[index], paneID, direction, newPaneID)
		if changed {
			node.Children[index] = child
			return node, true
		}
	}
	return node, false
}

func removeWorkspacePaneTree(node models.PaneTree, paneID string) (*models.PaneTree, bool) {
	if len(node.Children) == 0 {
		if node.PaneID == paneID {
			return nil, true
		}
		return &node, false
	}

	children := make([]models.PaneTree, 0, len(node.Children))
	weights := make([]float64, 0, len(node.Children))
	hadWeights := len(node.Weights) == len(node.Children)
	removed := false
	for index, child := range node.Children {
		next, childRemoved := removeWorkspacePaneTree(child, paneID)
		if childRemoved {
			removed = true
		}
		if next == nil {
			continue
		}
		children = append(children, *next)
		if hadWeights {
			weights = append(weights, node.Weights[index])
		}
	}
	if !removed {
		return &node, false
	}
	if len(children) == 1 {
		return &children[0], true
	}
	node.Children = children
	if hadWeights {
		node.Weights = weights
	} else {
		node.Weights = nil
	}
	return &node, true
}

func removeWorkspacePaneTabs(panes []models.PaneTabs, paneID string) []models.PaneTabs {
	for index := range panes {
		if panes[index].PaneID == paneID {
			return append(panes[:index], panes[index+1:]...)
		}
	}
	return panes
}

func removeWorkspacePanePopouts(popouts []models.PopoutWindow, paneID string) []models.PopoutWindow {
	for index := range popouts {
		if popouts[index].PaneID == paneID {
			return append(popouts[:index], popouts[index+1:]...)
		}
	}
	return popouts
}

func workspaceLayout(workspace models.WorkspaceState) models.WorkspaceLayout {
	return cloneWorkspaceLayout(models.WorkspaceLayout{
		PaneTree:      workspace.PaneTree,
		PaneTabs:      workspace.PaneTabs,
		ActivePaneID:  workspace.ActivePaneID,
		PopoutWindows: workspace.PopoutWindows,
	})
}

func cloneWorkspaceLayout(layout models.WorkspaceLayout) models.WorkspaceLayout {
	clone := (&models.State{Workspace: models.WorkspaceState{
		PaneTree:      layout.PaneTree,
		PaneTabs:      layout.PaneTabs,
		ActivePaneID:  layout.ActivePaneID,
		PopoutWindows: layout.PopoutWindows,
	}}).Clone().Workspace
	return models.WorkspaceLayout{
		PaneTree:      clone.PaneTree,
		PaneTabs:      clone.PaneTabs,
		ActivePaneID:  clone.ActivePaneID,
		PopoutWindows: clone.PopoutWindows,
	}
}

func checkExistingStatePath(statePath string) error {
	stateDir := filepath.Dir(statePath)
	if info, err := os.Lstat(stateDir); err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("state directory must not be a symlink")
		}
	} else if !os.IsNotExist(err) {
		return err
	}

	if info, err := os.Lstat(statePath); err == nil {
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("state file must not be a symlink")
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	return nil
}

func writeStateFile(statePath string, data []byte) error {
	stateDir := filepath.Dir(statePath)
	tempFile, err := os.CreateTemp(stateDir, "obails-state-*.json")
	if err != nil {
		return err
	}
	tempPath := tempFile.Name()
	success := false
	defer func() {
		if !success {
			_ = os.Remove(tempPath)
		}
	}()

	if _, err := tempFile.Write(data); err != nil {
		_ = tempFile.Close()
		return err
	}
	if err := tempFile.Sync(); err != nil {
		_ = tempFile.Close()
		return err
	}
	if err := tempFile.Close(); err != nil {
		return err
	}
	if err := os.Rename(tempPath, statePath); err != nil {
		return fmt.Errorf("rename state file: %w", err)
	}
	success = true
	return nil
}
