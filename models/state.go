package models

import (
	"encoding/json"
	"fmt"
	"math"
	"strings"
)

// State represents the application session state stored in vault
type State struct {
	LastOpenedFile *LastOpenedFile      `json:"lastOpenedFile,omitempty"`
	Workspace      WorkspaceState       `json:"workspace,omitempty"`
	Explorer       ExplorerSessionState `json:"explorer,omitempty"`
}

// LastOpenedFile represents the last opened file information
type LastOpenedFile struct {
	Path     string `json:"path"`
	FileType string `json:"fileType"`
}

// WorkspaceTab identifies an already-open document without requiring it to exist on disk.
type WorkspaceTab struct {
	Path     string `json:"path"`
	FileType string `json:"fileType"`
}

// PaneTabs stores one pane's ordered tabs and its active tab.
type PaneTabs struct {
	PaneID        string         `json:"paneId"`
	Tabs          []WorkspaceTab `json:"tabs"`
	ActiveTabPath string         `json:"activeTabPath,omitempty"`
}

// SplitDirection defines the visual orientation of a pane split.
type SplitDirection string

const (
	SplitDirectionHorizontal SplitDirection = "horizontal"
	SplitDirectionVertical   SplitDirection = "vertical"
)

// PaneTree describes split layout. Leaves have a PaneID; split nodes have a direction and children.
type PaneTree struct {
	PaneID         string         `json:"paneId,omitempty"`
	SplitDirection SplitDirection `json:"splitDirection,omitempty"`
	Children       []PaneTree     `json:"children,omitempty"`
	Weights        []float64      `json:"weights,omitempty"`
}

// PopoutWindow records a detached pane's window geometry for later restoration.
type PopoutWindow struct {
	ID     string `json:"id"`
	PaneID string `json:"paneId"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
	Width  int    `json:"width"`
	Height int    `json:"height"`
}

// WorkspaceState is the minimal session data needed to restore tabs, splits, workspaces, and popouts.
type WorkspaceState struct {
	PaneTree             *PaneTree        `json:"paneTree,omitempty"`
	ActivePaneID         string           `json:"activePaneId,omitempty"`
	PopoutWindows        []PopoutWindow   `json:"popoutWindows,omitempty"`
	PaneTabs             []PaneTabs       `json:"paneTabs,omitempty"`
	SavedWorkspaces      []NamedWorkspace `json:"savedWorkspaces,omitempty"`
	ActiveNamedWorkspace string           `json:"activeNamedWorkspace,omitempty"`
}

// NamedWorkspace is a complete, independently restorable workspace layout.
type NamedWorkspace struct {
	Name   string          `json:"name"`
	Layout WorkspaceLayout `json:"layout"`
}

// WorkspaceLayout captures every layout field needed for restoration.
type WorkspaceLayout struct {
	PaneTree      *PaneTree      `json:"paneTree,omitempty"`
	PaneTabs      []PaneTabs     `json:"paneTabs,omitempty"`
	ActivePaneID  string         `json:"activePaneId,omitempty"`
	PopoutWindows []PopoutWindow `json:"popoutWindows,omitempty"`
}

// ExplorerSessionState records presentation-only explorer session preferences.
// Expanded paths are stored without checking or modifying the vault filesystem.
type ExplorerSessionState struct {
	ExpandedPaths     []string `json:"expandedPaths,omitempty"`
	LeftSidebarWidth  int      `json:"leftSidebarWidth,omitempty"`
	RightSidebarWidth int      `json:"rightSidebarWidth,omitempty"`
}

// Validate checks persistence shape only. It deliberately does not stat tab or explorer paths.
func (s State) Validate() error {
	if s.LastOpenedFile != nil {
		if s.LastOpenedFile.Path == "" || strings.TrimSpace(s.LastOpenedFile.FileType) == "" || s.LastOpenedFile.FileType != strings.TrimSpace(s.LastOpenedFile.FileType) {
			return fmt.Errorf("last opened file requires a path and exact file type")
		}
	}
	if err := s.Workspace.Validate(); err != nil {
		return err
	}
	return s.Explorer.Validate()
}

func (s WorkspaceState) Validate() error {
	if err := (WorkspaceLayout{
		PaneTree:      s.PaneTree,
		PaneTabs:      s.PaneTabs,
		ActivePaneID:  s.ActivePaneID,
		PopoutWindows: s.PopoutWindows,
	}).Validate(); err != nil {
		return err
	}

	snapshotNames := make(map[string]struct{})
	for _, workspace := range s.SavedWorkspaces {
		name := strings.TrimSpace(workspace.Name)
		if name == "" || workspace.Name != name {
			return fmt.Errorf("saved workspace names cannot be empty")
		}
		if _, exists := snapshotNames[name]; exists {
			return fmt.Errorf("saved workspace name %q is duplicated", name)
		}
		snapshotNames[name] = struct{}{}
		if err := workspace.Layout.Validate(); err != nil {
			return fmt.Errorf("saved workspace %q: %w", name, err)
		}
	}
	if s.ActiveNamedWorkspace != "" {
		if s.ActiveNamedWorkspace != strings.TrimSpace(s.ActiveNamedWorkspace) {
			return fmt.Errorf("active named workspace cannot include leading or trailing whitespace")
		}
		if _, exists := snapshotNames[s.ActiveNamedWorkspace]; !exists {
			return fmt.Errorf("active named workspace %q is not saved", s.ActiveNamedWorkspace)
		}
	}
	return nil
}

// Validate checks the internal references of one complete workspace layout.
func (s WorkspaceLayout) Validate() error {

	paneIDs := make(map[string]struct{})
	if s.PaneTree != nil {
		if err := validatePaneTree(*s.PaneTree, paneIDs); err != nil {
			return err
		}
		if s.ActivePaneID == "" || s.ActivePaneID != strings.TrimSpace(s.ActivePaneID) {
			return fmt.Errorf("workspace pane tree requires an active pane")
		}
		if _, ok := paneIDs[s.ActivePaneID]; !ok {
			return fmt.Errorf("active pane %q is not in the pane tree", s.ActivePaneID)
		}
	} else if s.ActivePaneID != "" {
		return fmt.Errorf("active pane requires a pane tree")
	}
	if err := validatePaneTabs(s.PaneTabs, paneIDs, s.PaneTree != nil); err != nil {
		return err
	}

	popoutIDs := make(map[string]struct{})
	popoutPaneIDs := make(map[string]struct{})
	for _, popout := range s.PopoutWindows {
		if strings.TrimSpace(popout.ID) == "" || popout.ID != strings.TrimSpace(popout.ID) || strings.TrimSpace(popout.PaneID) == "" || popout.PaneID != strings.TrimSpace(popout.PaneID) || popout.Width <= 0 || popout.Height <= 0 {
			return fmt.Errorf("popout windows require IDs, pane IDs, and positive dimensions")
		}
		if _, exists := popoutIDs[popout.ID]; exists {
			return fmt.Errorf("popout window ID %q is duplicated", popout.ID)
		}
		popoutIDs[popout.ID] = struct{}{}
		if _, exists := popoutPaneIDs[popout.PaneID]; exists {
			return fmt.Errorf("popout pane %q is duplicated", popout.PaneID)
		}
		popoutPaneIDs[popout.PaneID] = struct{}{}
		if s.PaneTree != nil {
			if _, ok := paneIDs[popout.PaneID]; !ok {
				return fmt.Errorf("popout pane %q is not in the pane tree", popout.PaneID)
			}
		}
	}

	return nil
}

func validateWorkspaceTab(tab WorkspaceTab) error {
	if tab.Path == "" || strings.TrimSpace(tab.FileType) == "" || tab.FileType != strings.TrimSpace(tab.FileType) {
		return fmt.Errorf("workspace tabs require path and file type")
	}
	return nil
}

func validatePaneTabs(paneTabs []PaneTabs, paneIDs map[string]struct{}, hasPaneTree bool) error {
	if len(paneTabs) == 0 {
		return nil
	}
	if !hasPaneTree {
		return fmt.Errorf("pane tabs require a pane tree")
	}
	seenPanes := make(map[string]struct{}, len(paneTabs))
	for _, pane := range paneTabs {
		if strings.TrimSpace(pane.PaneID) == "" || pane.PaneID != strings.TrimSpace(pane.PaneID) {
			return fmt.Errorf("pane tabs require a pane ID")
		}
		if _, ok := paneIDs[pane.PaneID]; !ok {
			return fmt.Errorf("pane tabs reference unknown pane %q", pane.PaneID)
		}
		if _, exists := seenPanes[pane.PaneID]; exists {
			return fmt.Errorf("pane tabs for %q are duplicated", pane.PaneID)
		}
		seenPanes[pane.PaneID] = struct{}{}

		paths := make(map[string]struct{}, len(pane.Tabs))
		activeFound := false
		for _, tab := range pane.Tabs {
			if err := validateWorkspaceTab(tab); err != nil {
				return err
			}
			if _, exists := paths[tab.Path]; exists {
				return fmt.Errorf("pane %q has duplicate tab %q", pane.PaneID, tab.Path)
			}
			paths[tab.Path] = struct{}{}
			activeFound = activeFound || tab.Path == pane.ActiveTabPath
		}
		if len(pane.Tabs) == 0 && pane.ActiveTabPath != "" {
			return fmt.Errorf("empty pane %q cannot have an active tab", pane.PaneID)
		}
		if len(pane.Tabs) > 0 && !activeFound {
			return fmt.Errorf("pane %q active tab %q is not open", pane.PaneID, pane.ActiveTabPath)
		}
	}
	if len(seenPanes) != len(paneIDs) {
		return fmt.Errorf("pane tabs must describe every pane in the pane tree")
	}
	return nil
}

func validatePaneTree(node PaneTree, paneIDs map[string]struct{}) error {
	if len(node.Children) == 0 {
		if strings.TrimSpace(node.PaneID) == "" || node.PaneID != strings.TrimSpace(node.PaneID) || node.SplitDirection != "" || len(node.Weights) != 0 {
			return fmt.Errorf("pane tree leaves require a pane ID with no split direction or weights")
		}
		if _, exists := paneIDs[node.PaneID]; exists {
			return fmt.Errorf("pane ID %q is duplicated", node.PaneID)
		}
		paneIDs[node.PaneID] = struct{}{}
		return nil
	}
	if node.PaneID != "" || (node.SplitDirection != SplitDirectionHorizontal && node.SplitDirection != SplitDirectionVertical) || len(node.Children) < 2 {
		return fmt.Errorf("pane tree splits require a direction and at least two child panes")
	}
	if len(node.Weights) != 0 {
		if len(node.Weights) != len(node.Children) {
			return fmt.Errorf("pane tree split weights must match child panes")
		}
		for _, weight := range node.Weights {
			if weight <= 0 || math.IsNaN(weight) || math.IsInf(weight, 0) {
				return fmt.Errorf("pane tree split weights must be finite and positive")
			}
		}
	}
	for _, child := range node.Children {
		if err := validatePaneTree(child, paneIDs); err != nil {
			return err
		}
	}
	return nil
}

func (s ExplorerSessionState) Validate() error {
	if s.LeftSidebarWidth < 0 || s.RightSidebarWidth < 0 {
		return fmt.Errorf("sidebar widths cannot be negative")
	}
	expanded := make(map[string]struct{})
	for _, path := range s.ExpandedPaths {
		if strings.TrimSpace(path) == "" {
			return fmt.Errorf("expanded explorer paths cannot be empty")
		}
		if _, exists := expanded[path]; exists {
			return fmt.Errorf("expanded explorer path %q is duplicated", path)
		}
		expanded[path] = struct{}{}
	}
	return nil
}

// DefaultState returns the default state
func DefaultState() *State {
	return &State{}
}

// Clone returns an independent state snapshot for atomic persistence updates.
func (s *State) Clone() *State {
	if s == nil {
		return DefaultState()
	}
	data, err := json.Marshal(s)
	if err != nil {
		return DefaultState()
	}
	clone := DefaultState()
	if err := json.Unmarshal(data, clone); err != nil {
		return DefaultState()
	}
	return clone
}
