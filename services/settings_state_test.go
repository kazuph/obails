package services

import (
	"math"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"

	"github.com/kazuph/obails/models"
)

func TestConfigService_CommandDescriptorsAndHotkeysPersist(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.toml")
	service := &ConfigService{configPath: configPath, useCustomConfig: true, config: models.DefaultConfig()}

	commands := service.GetCommandDescriptors()
	if len(commands) == 0 {
		t.Fatal("expected descriptors for existing commands")
	}
	var commandPalette models.CommandDescriptor
	var saveCurrentFile models.CommandDescriptor
	workspaceCommands := make(map[string]models.CommandDescriptor)
	for _, command := range commands {
		if command.ID == models.CommandPalette {
			commandPalette = command
		}
		if command.ID == models.CommandSaveCurrentFile {
			saveCurrentFile = command
		}
		if command.Category == "Workspace" {
			workspaceCommands[command.ID] = command
		}
	}
	if saveCurrentFile.Title != "Save Current File" || saveCurrentFile.DefaultHotkey != "Cmd+S" || saveCurrentFile.Hotkey != "Cmd+S" {
		t.Fatalf("save current file descriptor = %#v", saveCurrentFile)
	}
	if commandPalette.ID == "" || commandPalette.DefaultHotkey != "Cmd+P" || commandPalette.Scope != models.CommandScopeGlobal {
		t.Fatalf("command palette descriptor = %#v", commandPalette)
	}
	for _, commandID := range []string{
		models.CommandSplitPaneRight,
		models.CommandSplitPaneDown,
		models.CommandCloseActivePane,
		models.CommandWorkspaceSaveAs,
		models.CommandWorkspaceSaveCurrent,
		models.CommandWorkspaceManage,
	} {
		command, ok := workspaceCommands[commandID]
		if !ok || command.DefaultHotkey != "" || command.Hotkey != "" {
			t.Fatalf("workspace command %q descriptor = %#v", commandID, command)
		}
	}
	if workspaceCommands[models.CommandWorkspaceSaveAs].Title != "Save Current Workspace As…" {
		t.Fatalf("save-as title = %#v", workspaceCommands[models.CommandWorkspaceSaveAs])
	}
	if workspaceCommands[models.CommandWorkspaceSaveCurrent].Title != "Save Current Workspace" {
		t.Fatalf("save-current title = %#v", workspaceCommands[models.CommandWorkspaceSaveCurrent])
	}
	if workspaceCommands[models.CommandWorkspaceManage].Title != "Manage Workspaces…" {
		t.Fatalf("manage title = %#v", workspaceCommands[models.CommandWorkspaceManage])
	}

	if err := service.SetHotkey(models.CommandNewNote, "shift + cmd + n"); err != nil {
		t.Fatalf("SetHotkey failed: %v", err)
	}
	if got := service.GetHotkeyMappings()[models.CommandNewNote]; got != "Cmd+Shift+N" {
		t.Fatalf("stored chord = %q, want Cmd+Shift+N", got)
	}
	if err := service.SetHotkey(models.CommandPalette, "cmd + shift + n"); err == nil {
		t.Fatal("expected same-scope hotkey conflict")
	}
	if err := service.ClearHotkey(models.CommandNewNote); err != nil {
		t.Fatalf("ClearHotkey failed: %v", err)
	}
	if _, ok := service.GetHotkeyMappings()[models.CommandNewNote]; ok {
		t.Fatal("cleared hotkey override was still returned")
	}
	for _, command := range service.GetCommandDescriptors() {
		if command.ID == models.CommandNewNote && command.Hotkey != command.DefaultHotkey {
			t.Fatalf("cleared descriptor hotkey = %q, want default %q", command.Hotkey, command.DefaultHotkey)
		}
	}
	if err := service.SetHotkey(models.CommandPalette, "cmd + shift + n"); err != nil {
		t.Fatalf("conflict should be released after ClearHotkey: %v", err)
	}
	if err := service.ClearHotkey("not-a-command"); err == nil {
		t.Fatal("expected unknown command error when clearing a hotkey")
	}
	if err := service.SetHotkey(models.CommandNewNote, "Cmd+Shift"); err == nil {
		t.Fatal("expected invalid chord error")
	}
	if err := service.SetHotkey("not-a-command", "Cmd+K"); err == nil {
		t.Fatal("expected unknown command error")
	}

	reloaded := &ConfigService{configPath: configPath, useCustomConfig: true, config: models.DefaultConfig()}
	if err := reloaded.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if got := reloaded.GetHotkeyMappings()[models.CommandPalette]; got != "Cmd+Shift+N" {
		t.Fatalf("persisted chord = %q, want Cmd+Shift+N", got)
	}
}

func TestConfigService_EditHistoryHotkeysParticipateInConflictDetection(t *testing.T) {
	service, _ := newTestConfigService(t)
	if err := service.SetHotkey(models.CommandNewNote, "Cmd+Z"); err == nil {
		t.Fatal("SetHotkey allowed a collision with Undo Edit")
	}
	if err := service.SetHotkey(models.CommandNewNote, "Cmd+Shift+Z"); err == nil {
		t.Fatal("SetHotkey allowed a collision with Redo Edit")
	}
}

func TestConfigService_ClearHotkeyRejectsDefaultCollisionWithoutChangingState(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.toml")
	service := &ConfigService{configPath: configPath, useCustomConfig: true, config: models.DefaultConfig()}

	if err := service.SetHotkey(models.CommandNewNote, "Cmd+K"); err != nil {
		t.Fatalf("override new note: %v", err)
	}
	if err := service.SetHotkey(models.CommandPalette, "Cmd+N"); err != nil {
		t.Fatalf("override command palette: %v", err)
	}
	before := service.GetHotkeyMappings()
	if err := service.ClearHotkey(models.CommandNewNote); err == nil {
		t.Fatal("ClearHotkey accepted a collision with the new-note default")
	}
	if got := service.GetHotkeyMappings(); got[models.CommandNewNote] != before[models.CommandNewNote] || got[models.CommandPalette] != before[models.CommandPalette] {
		t.Fatalf("runtime hotkeys changed after rejected clear: %#v", got)
	}
	if got := readTestConfigFile(t, configPath).Hotkeys; got[models.CommandNewNote] != "Cmd+K" || got[models.CommandPalette] != "Cmd+N" {
		t.Fatalf("persisted hotkeys changed after rejected clear: %#v", got)
	}
}

func TestConfigService_SettingsValidateAndPersist(t *testing.T) {
	tmpDir := t.TempDir()
	configPath := filepath.Join(tmpDir, "config.toml")
	service := &ConfigService{configPath: configPath, useCustomConfig: true, config: models.DefaultConfig()}

	if err := service.SetEditorFontFamily("  Iosevka  "); err != nil {
		t.Fatalf("SetEditorFontFamily failed: %v", err)
	}
	if err := service.SetEditorFontSize(17); err != nil {
		t.Fatalf("SetEditorFontSize failed: %v", err)
	}
	if err := service.SetEditorLineNumbers(false); err != nil {
		t.Fatalf("SetEditorLineNumbers failed: %v", err)
	}
	if err := service.SetEditorWordWrap(false); err != nil {
		t.Fatalf("SetEditorWordWrap failed: %v", err)
	}
	if err := service.SetSidebarWidth(320); err != nil {
		t.Fatalf("SetSidebarWidth failed: %v", err)
	}
	if err := service.SetTheme("tokyonight"); err != nil {
		t.Fatalf("SetTheme failed: %v", err)
	}
	if err := service.SetEditorFontFamily(" \t"); err == nil {
		t.Fatal("expected empty font family error")
	}
	if err := service.SetEditorFontSize(0); err == nil {
		t.Fatal("expected non-positive font size error")
	}
	for _, width := range []int{models.MinSidebarWidth - 1, models.MaxSidebarWidth + 1} {
		if err := service.SetSidebarWidth(width); err == nil {
			t.Fatalf("accepted sidebar width outside the UI range: %d", width)
		}
	}
	if err := service.SetTheme("not-a-theme"); err == nil {
		t.Fatal("expected unsupported theme error")
	}

	reloaded := &ConfigService{configPath: configPath, useCustomConfig: true, config: models.DefaultConfig()}
	if err := reloaded.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	editor := reloaded.GetEditorConfig()
	if editor.FontFamily != "Iosevka" || editor.FontSize != 17 || editor.LineNumbers || editor.WordWrap {
		t.Fatalf("persisted editor settings = %#v", editor)
	}
	if got := reloaded.GetSidebarWidth(); got != 320 {
		t.Fatalf("persisted sidebar width = %d, want 320", got)
	}
	if got := reloaded.GetTheme(); got != "tokyonight" {
		t.Fatalf("persisted theme = %q", got)
	}
}

func TestStateService_WorkspaceAndExplorerStateRoundTrip(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})

	workspace := models.WorkspaceState{
		PaneTree:      &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "editor-left"}, {PaneID: "editor-right"}}, Weights: []float64{0.35, 0.65}},
		ActivePaneID:  "editor-right",
		PopoutWindows: []models.PopoutWindow{{ID: "popout-1", PaneID: "editor-right", X: -20, Y: 40, Width: 800, Height: 600}},
		PaneTabs: []models.PaneTabs{
			{PaneID: "editor-left", Tabs: []models.WorkspaceTab{{Path: "notes/plan.md", FileType: "markdown"}}, ActiveTabPath: "notes/plan.md"},
			{PaneID: "editor-right", Tabs: []models.WorkspaceTab{{Path: "assets/diagram.pdf", FileType: "pdf"}}, ActiveTabPath: "assets/diagram.pdf"},
		},
		SavedWorkspaces: []models.NamedWorkspace{{
			Name: "Research layout",
			Layout: models.WorkspaceLayout{
				PaneTree:      &models.PaneTree{SplitDirection: models.SplitDirectionVertical, Children: []models.PaneTree{{PaneID: "research-main"}, {PaneID: "research-side"}}, Weights: []float64{1, 2}},
				ActivePaneID:  "research-main",
				PaneTabs:      []models.PaneTabs{{PaneID: "research-main", Tabs: []models.WorkspaceTab{{Path: "notes/research.md", FileType: "markdown"}}, ActiveTabPath: "notes/research.md"}, {PaneID: "research-side"}},
				PopoutWindows: []models.PopoutWindow{{ID: "research-popout", PaneID: "research-side", Width: 800, Height: 600}},
			},
		}},
	}
	if err := service.SetWorkspaceState(workspace); err != nil {
		t.Fatalf("SetWorkspaceState failed: %v", err)
	}
	explorer := models.ExplorerSessionState{ExpandedPaths: []string{"notes", "notes/projects"}, LeftSidebarWidth: 280, RightSidebarWidth: 310}
	if err := service.SetExplorerSessionState(explorer); err != nil {
		t.Fatalf("SetExplorerSessionState failed: %v", err)
	}

	reloaded := NewStateService(&ConfigService{config: config})
	if err := reloaded.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	gotWorkspace := reloaded.GetWorkspaceState()
	if gotWorkspace.ActivePaneID != "editor-right" || len(gotWorkspace.PopoutWindows) != 1 || len(gotWorkspace.PaneTabs) != 2 || gotWorkspace.PaneTabs[1].ActiveTabPath != "assets/diagram.pdf" || len(gotWorkspace.SavedWorkspaces) != 1 || gotWorkspace.SavedWorkspaces[0].Layout.ActivePaneID != "research-main" || gotWorkspace.PaneTree.Weights[0] != 0.35 || gotWorkspace.SavedWorkspaces[0].Layout.PaneTree.Weights[1] != 2 {
		t.Fatalf("persisted workspace = %#v", gotWorkspace)
	}
	gotExplorer := reloaded.GetExplorerSessionState()
	if gotExplorer.LeftSidebarWidth != 280 || gotExplorer.RightSidebarWidth != 310 || len(gotExplorer.ExpandedPaths) != 2 {
		t.Fatalf("persisted explorer = %#v", gotExplorer)
	}

	if _, err := os.Stat(filepath.Join(vaultPath, ".obails", "state.json")); err != nil {
		t.Fatalf("state file missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(vaultPath, "notes")); !os.IsNotExist(err) {
		t.Fatalf("saving unknown workspace paths must not create vault files: %v", err)
	}
}

func TestStateService_RejectsInvalidSplitWeightsAndDuplicatePopoutPanes(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})

	valid := models.WorkspaceState{
		PaneTree:     &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "left"}, {PaneID: "right"}}, Weights: []float64{1, 3}},
		ActivePaneID: "left",
		PaneTabs:     []models.PaneTabs{{PaneID: "left"}, {PaneID: "right"}},
	}
	if err := service.SetWorkspaceState(valid); err != nil {
		t.Fatalf("SetWorkspaceState valid: %v", err)
	}

	for _, invalid := range []models.WorkspaceState{
		{PaneTree: &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "left"}, {PaneID: "right"}}, Weights: []float64{1}}, ActivePaneID: "left", PaneTabs: valid.PaneTabs},
		{PaneTree: &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "left"}, {PaneID: "right"}}, Weights: []float64{1, 0}}, ActivePaneID: "left", PaneTabs: valid.PaneTabs},
		{PaneTree: &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "left"}, {PaneID: "right"}}, Weights: []float64{1, math.NaN()}}, ActivePaneID: "left", PaneTabs: valid.PaneTabs},
		{PaneTree: &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "left"}, {PaneID: "right"}}, Weights: []float64{1, math.Inf(1)}}, ActivePaneID: "left", PaneTabs: valid.PaneTabs},
		{PaneTree: &models.PaneTree{PaneID: "left", Weights: []float64{1}}, ActivePaneID: "left", PaneTabs: []models.PaneTabs{{PaneID: "left"}}},
		{PaneTree: &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "left"}, {PaneID: "right"}}}, ActivePaneID: "left", PaneTabs: valid.PaneTabs, PopoutWindows: []models.PopoutWindow{{ID: "one", PaneID: "right", Width: 1, Height: 1}, {ID: "two", PaneID: "right", Width: 1, Height: 1}}},
	} {
		if err := service.SetWorkspaceState(invalid); err == nil {
			t.Fatalf("expected invalid workspace rejection: %#v", invalid)
		}
	}
	if got := service.GetWorkspaceState().PaneTree.Weights; len(got) != 2 || got[0] != 1 || got[1] != 3 {
		t.Fatalf("runtime state changed after invalid workspace: %#v", got)
	}
}

func TestStateValidationRejectsUnrestorableIdentifiers(t *testing.T) {
	tests := []models.State{
		{LastOpenedFile: &models.LastOpenedFile{}},
		{Workspace: models.WorkspaceState{PaneTree: &models.PaneTree{PaneID: " pane"}, ActivePaneID: " pane", PaneTabs: []models.PaneTabs{{PaneID: " pane"}}}},
		{Workspace: models.WorkspaceState{PaneTree: &models.PaneTree{PaneID: "pane"}, ActivePaneID: "pane", PaneTabs: []models.PaneTabs{{PaneID: "pane"}}, PopoutWindows: []models.PopoutWindow{{ID: " popout", PaneID: "pane", Width: 1, Height: 1}}}},
	}
	for index, state := range tests {
		if err := state.Validate(); err == nil {
			t.Fatalf("case %d accepted an unrestorable identifier", index)
		}
	}
}

func TestStateCloneKeepsIndependentSplitWeights(t *testing.T) {
	state := &models.State{Workspace: models.WorkspaceState{
		PaneTree:     &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "left"}, {PaneID: "right"}}, Weights: []float64{0.25, 0.75}},
		ActivePaneID: "left",
		PaneTabs:     []models.PaneTabs{{PaneID: "left"}, {PaneID: "right"}},
	}}
	clone := state.Clone()
	clone.Workspace.PaneTree.Weights[0] = 0.5
	if got := state.Workspace.PaneTree.Weights[0]; got != 0.25 {
		t.Fatalf("source split weight changed through clone: %v", got)
	}
}

func TestStateService_PopoutTransitionsPersistToRealFilesystem(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	workspace := models.WorkspaceState{
		PaneTree:     &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "main"}, {PaneID: "side"}}, Weights: []float64{1, 1}},
		ActivePaneID: "main",
		PaneTabs:     []models.PaneTabs{{PaneID: "main"}, {PaneID: "side"}},
	}
	if err := service.SetWorkspaceState(workspace); err != nil {
		t.Fatalf("SetWorkspaceState failed: %v", err)
	}
	popout := models.PopoutWindow{ID: "popout-1", PaneID: "main", X: 4, Y: 5, Width: 640, Height: 480}
	added, err := service.AddPopoutWindow(popout)
	if err != nil {
		t.Fatalf("AddPopoutWindow failed: %v", err)
	}
	if len(added.PopoutWindows) != 1 || added.PopoutWindows[0] != popout || added.ActivePaneID != "side" || !reflect.DeepEqual(added, service.GetWorkspaceState()) {
		t.Fatalf("AddPopoutWindow snapshot = %#v", added)
	}
	if err := service.UpdatePopoutWindowGeometryForPane(popout.ID, popout.PaneID, 8, 9, 800, 600); err != nil {
		t.Fatalf("UpdatePopoutWindowGeometryForPane failed: %v", err)
	}
	reloaded := NewStateService(&ConfigService{config: config})
	if err := reloaded.Load(); err != nil {
		t.Fatalf("Load failed: %v", err)
	}
	if got := reloaded.GetWorkspaceState().PopoutWindows; len(got) != 1 || got[0].X != 8 || got[0].Height != 600 {
		t.Fatalf("persisted popout geometry = %#v", got)
	}
	if restored, err := restorePopoutRecord(reloaded.GetWorkspaceState(), popout.ID); err != nil || restored != (models.PopoutWindow{ID: popout.ID, PaneID: popout.PaneID, X: 8, Y: 9, Width: 800, Height: 600}) {
		t.Fatalf("persisted popout record was not restorable: %#v, %v", restored, err)
	}
	removedSnapshot, removed, err := service.RemovePopoutWindowIfMatches(popout.ID, popout.PaneID)
	if err != nil || !removed {
		t.Fatalf("RemovePopoutWindowIfMatches failed: removed=%v err=%v", removed, err)
	}
	if len(removedSnapshot.PopoutWindows) != 0 {
		t.Fatalf("remove snapshot retained popouts: %#v", removedSnapshot)
	}
	statePath := filepath.Join(vaultPath, ".obails", "state.json")
	beforeNoMatch, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile before no-match removal: %v", err)
	}
	noMatchSnapshot, removed, err := service.RemovePopoutWindowIfMatches(popout.ID, popout.PaneID)
	if err != nil || removed {
		t.Fatalf("expected unknown popout removal to be an idempotent no-op: removed=%v err=%v", removed, err)
	}
	if len(noMatchSnapshot.PopoutWindows) != 0 || !reflect.DeepEqual(noMatchSnapshot, service.GetWorkspaceState()) {
		t.Fatalf("no-match snapshot = %#v, runtime = %#v", noMatchSnapshot, service.GetWorkspaceState())
	}
	afterNoMatch, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile after no-match removal: %v", err)
	}
	if !reflect.DeepEqual(afterNoMatch, beforeNoMatch) {
		t.Fatal("no-match removal rewrote state.json")
	}
	if err := reloaded.Load(); err != nil {
		t.Fatalf("Load after explicit rejoin failed: %v", err)
	}
	if got := reloaded.GetWorkspaceState().PopoutWindows; len(got) != 0 {
		t.Fatalf("explicit rejoin left persisted popout records: %#v", got)
	}
}

func TestStateService_PopoutRejectsFinalVisiblePaneWithoutChangingState(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	workspace := models.WorkspaceState{PaneTree: &models.PaneTree{PaneID: "main"}, ActivePaneID: "main", PaneTabs: []models.PaneTabs{{PaneID: "main"}}}
	if err := service.SetWorkspaceState(workspace); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}
	statePath := service.getStatePath()
	beforeRuntime := service.GetWorkspaceState()
	beforeDisk, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile before AddPopoutWindow: %v", err)
	}
	if _, err := service.AddPopoutWindow(models.PopoutWindow{ID: "only", PaneID: "main", Width: 1, Height: 1}); err == nil {
		t.Fatal("AddPopoutWindow accepted the final visible pane")
	}
	if got := service.GetWorkspaceState(); !reflect.DeepEqual(got, beforeRuntime) {
		t.Fatalf("final pane rejection changed runtime: %#v", got)
	}
	afterDisk, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile after AddPopoutWindow: %v", err)
	}
	if !reflect.DeepEqual(afterDisk, beforeDisk) {
		t.Fatal("final pane rejection changed state.json")
	}
}

func TestStateService_RejectsInvalidPaneReferencesWithoutChangingRuntime(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	valid := models.WorkspaceState{
		PaneTree:     &models.PaneTree{PaneID: "main"},
		ActivePaneID: "main",
		PaneTabs:     []models.PaneTabs{{PaneID: "main", Tabs: []models.WorkspaceTab{{Path: "notes/one.md", FileType: "markdown"}}, ActiveTabPath: "notes/one.md"}},
	}
	if err := service.SetWorkspaceState(valid); err != nil {
		t.Fatalf("SetWorkspaceState valid: %v", err)
	}
	invalid := valid
	invalid.PaneTabs = []models.PaneTabs{{PaneID: "missing", Tabs: []models.WorkspaceTab{{Path: "notes/two.md", FileType: "markdown"}}, ActiveTabPath: "notes/two.md"}}
	if err := service.SetWorkspaceState(invalid); err == nil {
		t.Fatal("expected unknown pane validation error")
	}
	if got := service.GetWorkspaceState().PaneTabs[0].PaneID; got != "main" {
		t.Fatalf("runtime state changed after invalid layout: %q", got)
	}
}

func TestStateService_SetterFailureLeavesRuntimeUnchanged(t *testing.T) {
	vaultPath := t.TempDir()
	outsidePath := t.TempDir()
	if err := os.Symlink(outsidePath, filepath.Join(vaultPath, ".obails")); err != nil {
		t.Fatalf("Symlink failed: %v", err)
	}
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	if err := service.SetExplorerSessionState(models.ExplorerSessionState{ExpandedPaths: []string{"notes"}, LeftSidebarWidth: 280, RightSidebarWidth: 310}); err == nil {
		t.Fatal("expected state persistence failure")
	}
	if got := service.GetExplorerSessionState(); len(got.ExpandedPaths) != 0 || got.LeftSidebarWidth != 0 || got.RightSidebarWidth != 0 {
		t.Fatalf("runtime explorer changed after failed save: %#v", got)
	}
}

func TestStateService_ConcurrentSettersPreserveBothChanges(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	workspace := models.WorkspaceState{PaneTree: &models.PaneTree{PaneID: "main"}, ActivePaneID: "main", PaneTabs: []models.PaneTabs{{PaneID: "main", Tabs: []models.WorkspaceTab{{Path: "notes/one.md", FileType: "markdown"}}, ActiveTabPath: "notes/one.md"}}}
	explorer := models.ExplorerSessionState{ExpandedPaths: []string{"notes"}, LeftSidebarWidth: 280, RightSidebarWidth: 310}
	var start sync.WaitGroup
	start.Add(1)
	errs := make(chan error, 2)
	go func() { start.Wait(); errs <- service.SetWorkspaceState(workspace) }()
	go func() { start.Wait(); errs <- service.SetExplorerSessionState(explorer) }()
	start.Done()
	for range 2 {
		if err := <-errs; err != nil {
			t.Fatalf("concurrent setter failed: %v", err)
		}
	}
	if got := service.GetWorkspaceState(); got.ActivePaneID != "main" || got.PaneTabs[0].ActiveTabPath != "notes/one.md" {
		t.Fatalf("workspace update was lost: %#v", got)
	}
	if got := service.GetExplorerSessionState(); got.LeftSidebarWidth != 280 || len(got.ExpandedPaths) != 1 {
		t.Fatalf("explorer update was lost: %#v", got)
	}
}

func TestStateService_AtomicWorkspaceMutationsPersistAndPreserveConcurrentTabs(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	if err := service.SetWorkspaceState(models.WorkspaceState{
		PaneTree:     &models.PaneTree{PaneID: "main"},
		ActivePaneID: "main",
		PaneTabs:     []models.PaneTabs{{PaneID: "main"}},
	}); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}

	var start sync.WaitGroup
	start.Add(1)
	errs := make(chan error, 2)
	for _, tab := range []models.WorkspaceTab{{Path: "notes/one.md", FileType: "markdown"}, {Path: "notes/two.md", FileType: "markdown"}} {
		tab := tab
		go func() {
			start.Wait()
			_, err := service.OpenWorkspaceTab("main", tab)
			errs <- err
		}()
	}
	start.Done()
	for range 2 {
		if err := <-errs; err != nil {
			t.Fatalf("OpenWorkspaceTab: %v", err)
		}
	}
	workspace := service.GetWorkspaceState()
	var err error
	if len(workspace.PaneTabs[0].Tabs) != 2 {
		t.Fatalf("concurrent tabs lost: %#v", workspace.PaneTabs)
	}
	if workspace, err = service.SplitWorkspacePane("main", models.SplitDirectionVertical, "side"); err != nil {
		t.Fatalf("SplitWorkspacePane: %v", err)
	}
	if workspace.ActivePaneID != "side" || len(workspace.PaneTabs) != 2 {
		t.Fatalf("split result = %#v", workspace)
	}
	if workspace, err = service.UpdateWorkspaceSplitWeights(nil, []float64{2, 3}); err != nil {
		t.Fatalf("UpdateWorkspaceSplitWeights: %v", err)
	}
	if workspace.PaneTree.Weights[0] != 2 || workspace.PaneTree.Weights[1] != 3 {
		t.Fatalf("updated weights = %#v", workspace.PaneTree.Weights)
	}
	if _, err := service.ActivateWorkspaceTab("main", "notes/one.md"); err != nil {
		t.Fatalf("ActivateWorkspaceTab: %v", err)
	}
	if workspace, err = service.CloseWorkspaceTab("main", "notes/one.md"); err != nil {
		t.Fatalf("CloseWorkspaceTab: %v", err)
	}
	if len(workspace.PaneTabs[0].Tabs) != 1 || workspace.PaneTabs[0].ActiveTabPath != "notes/two.md" {
		t.Fatalf("closed tab state = %#v", workspace.PaneTabs[0])
	}
	if workspace, err = service.CloseWorkspacePane("side"); err != nil {
		t.Fatalf("CloseWorkspacePane: %v", err)
	}
	if workspace.PaneTree.PaneID != "main" || len(workspace.PaneTabs) != 1 {
		t.Fatalf("closed pane state = %#v", workspace)
	}

	reloaded := NewStateService(&ConfigService{config: config})
	if err := reloaded.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	if got := reloaded.GetWorkspaceState(); got.PaneTree.PaneID != "main" || len(got.PaneTabs[0].Tabs) != 1 {
		t.Fatalf("persisted atomic workspace = %#v", got)
	}
}

func TestStateService_WorkspaceTabInPopoutKeepsSharedActivePaneAtomic(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	initial := models.WorkspaceState{
		PaneTree: &models.PaneTree{
			SplitDirection: models.SplitDirectionHorizontal,
			Children:       []models.PaneTree{{PaneID: "main"}, {PaneID: "popout"}},
			Weights:        []float64{1, 1},
		},
		ActivePaneID: "main",
		PaneTabs: []models.PaneTabs{
			{PaneID: "main", Tabs: []models.WorkspaceTab{{Path: "notes/main.md", FileType: "markdown"}}, ActiveTabPath: "notes/main.md"},
			{PaneID: "popout", Tabs: []models.WorkspaceTab{{Path: "notes/first.md", FileType: "markdown"}}, ActiveTabPath: "notes/first.md"},
		},
		PopoutWindows: []models.PopoutWindow{{ID: "child", PaneID: "popout", Width: 1, Height: 1}},
	}
	if err := service.SetWorkspaceState(initial); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}

	returned, err := service.OpenWorkspaceTabInPopout("popout", "child", models.WorkspaceTab{Path: "notes/second.md", FileType: "markdown"})
	if err != nil {
		t.Fatalf("OpenWorkspaceTabInPopout: %v", err)
	}
	if got := service.GetWorkspaceState(); !reflect.DeepEqual(returned, got) {
		t.Fatalf("returned snapshot is not authoritative: returned=%#v runtime=%#v", returned, got)
	}
	if returned.ActivePaneID != "main" || returned.PaneTabs[1].ActiveTabPath != "notes/second.md" || len(returned.PaneTabs[1].Tabs) != 2 {
		t.Fatalf("routed pane tab result = %#v", returned)
	}

	statePath := service.getStatePath()
	assertUnchanged := func(label string, operation func() error) {
		t.Helper()
		beforeRuntime := service.GetWorkspaceState()
		beforeDisk, readErr := os.ReadFile(statePath)
		if readErr != nil {
			t.Fatalf("%s ReadFile before: %v", label, readErr)
		}
		if err := operation(); err == nil {
			t.Fatalf("%s succeeded", label)
		}
		if got := service.GetWorkspaceState(); !reflect.DeepEqual(got, beforeRuntime) {
			t.Fatalf("%s changed runtime: got=%#v want=%#v", label, got, beforeRuntime)
		}
		afterDisk, readErr := os.ReadFile(statePath)
		if readErr != nil {
			t.Fatalf("%s ReadFile after: %v", label, readErr)
		}
		if !reflect.DeepEqual(afterDisk, beforeDisk) {
			t.Fatalf("%s changed state.json", label)
		}
	}
	assertUnchanged("unknown pane", func() error {
		_, err := service.OpenWorkspaceTabInPopout("missing", "child", models.WorkspaceTab{Path: "notes/missing.md", FileType: "markdown"})
		return err
	})
	assertUnchanged("stale popout route", func() error {
		_, err := service.OpenWorkspaceTabInPopout("popout", "rejoined", models.WorkspaceTab{Path: "notes/stale.md", FileType: "markdown"})
		return err
	})
	assertUnchanged("stale popout activation", func() error {
		_, err := service.ActivateWorkspaceTabInPopout("popout", "rejoined", "notes/first.md")
		return err
	})
	assertUnchanged("stale popout close", func() error {
		_, err := service.CloseWorkspaceTabInPopout("popout", "rejoined", "notes/first.md")
		return err
	})
	assertUnchanged("invalid tab", func() error {
		_, err := service.OpenWorkspaceTabInPopout("popout", "child", models.WorkspaceTab{Path: "notes/invalid.md", FileType: " markdown "})
		return err
	})
	if activated, activateErr := service.ActivateWorkspaceTabInPopout("popout", "child", "notes/first.md"); activateErr != nil || activated.ActivePaneID != "main" || activated.PaneTabs[1].ActiveTabPath != "notes/first.md" {
		t.Fatalf("ActivateWorkspaceTabInPopout = %#v, %v", activated, activateErr)
	}
	if closed, closeErr := service.CloseWorkspaceTabInPopout("popout", "child", "notes/second.md"); closeErr != nil || closed.ActivePaneID != "main" || len(closed.PaneTabs[1].Tabs) != 1 {
		t.Fatalf("CloseWorkspaceTabInPopout = %#v, %v", closed, closeErr)
	}
	mainWindowReturned, err := service.OpenWorkspaceTab("popout", models.WorkspaceTab{Path: "notes/main-window.md", FileType: "markdown"})
	if err != nil {
		t.Fatalf("OpenWorkspaceTab: %v", err)
	}
	if mainWindowReturned.ActivePaneID != "popout" || !reflect.DeepEqual(mainWindowReturned, service.GetWorkspaceState()) {
		t.Fatalf("normal tab open did not make its pane shared-active: %#v", mainWindowReturned)
	}

	outsideState := filepath.Join(t.TempDir(), "state.json")
	if err := os.WriteFile(outsideState, []byte("unchanged"), 0644); err != nil {
		t.Fatalf("WriteFile outside state: %v", err)
	}
	if err := os.Remove(statePath); err != nil {
		t.Fatalf("Remove state: %v", err)
	}
	if err := os.Symlink(outsideState, statePath); err != nil {
		t.Fatalf("Symlink state: %v", err)
	}
	assertUnchanged("save failure", func() error {
		_, err := service.OpenWorkspaceTabInPopout("popout", "child", models.WorkspaceTab{Path: "notes/save-failure.md", FileType: "markdown"})
		return err
	})
}

func TestStateService_NamedWorkspaceSnapshotsAreIndependent(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	if err := service.SetWorkspaceState(models.WorkspaceState{
		PaneTree:     &models.PaneTree{PaneID: "main"},
		ActivePaneID: "main",
		PaneTabs:     []models.PaneTabs{{PaneID: "main", Tabs: []models.WorkspaceTab{{Path: "notes/original.md", FileType: "markdown"}}, ActiveTabPath: "notes/original.md"}},
	}); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}
	if _, err := service.SaveNamedWorkspace("baseline"); err != nil {
		t.Fatalf("SaveNamedWorkspace: %v", err)
	}
	if _, err := service.RestoreNamedWorkspace("baseline"); err != nil {
		t.Fatalf("RestoreNamedWorkspace: %v", err)
	}
	if _, err := service.OpenWorkspaceTab("main", models.WorkspaceTab{Path: "notes/current.md", FileType: "markdown"}); err != nil {
		t.Fatalf("OpenWorkspaceTab after restore: %v", err)
	}
	workspace := service.GetWorkspaceState()
	if got := workspace.SavedWorkspaces[0].Layout.PaneTabs[0].Tabs; len(got) != 1 || got[0].Path != "notes/original.md" {
		t.Fatalf("saved layout was mutated through active workspace: %#v", got)
	}
	if _, err := service.RestoreNamedWorkspace("baseline"); err != nil {
		t.Fatalf("second RestoreNamedWorkspace: %v", err)
	}
	workspace = service.GetWorkspaceState()
	if got := workspace.PaneTabs[0].Tabs; len(got) != 1 || got[0].Path != "notes/original.md" {
		t.Fatalf("restore used a mutated snapshot: %#v", got)
	}
}

func TestStateService_RestoreNamedWorkspaceRejectsPartialLayoutWithoutChangingState(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	valid := models.WorkspaceState{
		PaneTree:     &models.PaneTree{PaneID: "main"},
		ActivePaneID: "main",
		PaneTabs:     []models.PaneTabs{{PaneID: "main"}},
		SavedWorkspaces: []models.NamedWorkspace{{
			Name: "partial",
			Layout: models.WorkspaceLayout{
				PaneTree:     &models.PaneTree{PaneID: "missing-tabs"},
				ActivePaneID: "missing-tabs",
			},
		}},
	}
	if err := service.SetWorkspaceState(valid); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}
	before := service.GetWorkspaceState()
	statePath := service.getStatePath()
	beforeDisk, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile before restore: %v", err)
	}

	if _, err := service.RestoreNamedWorkspace("partial"); err == nil {
		t.Fatal("RestoreNamedWorkspace accepted a layout without pane tabs")
	}
	if got := service.GetWorkspaceState(); !reflect.DeepEqual(got, before) {
		t.Fatalf("runtime state changed after rejected restore: %#v", got)
	}
	afterDisk, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile after restore: %v", err)
	}
	if string(afterDisk) != string(beforeDisk) {
		t.Fatal("state.json changed after rejected restore")
	}

	partialCurrent := models.WorkspaceState{
		PaneTree:     &models.PaneTree{PaneID: "missing-tabs"},
		ActivePaneID: "missing-tabs",
	}
	if err := service.SetWorkspaceState(partialCurrent); err != nil {
		t.Fatalf("SetWorkspaceState partial current: %v", err)
	}
	before = service.GetWorkspaceState()
	beforeDisk, err = os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile before save: %v", err)
	}
	if _, err := service.SaveNamedWorkspace("must-not-save"); err == nil {
		t.Fatal("SaveNamedWorkspace captured a workspace without pane tabs")
	}
	if got := service.GetWorkspaceState(); !reflect.DeepEqual(got, before) {
		t.Fatalf("runtime state changed after rejected save: %#v", got)
	}
	afterDisk, err = os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile after save: %v", err)
	}
	if string(afterDisk) != string(beforeDisk) {
		t.Fatal("state.json changed after rejected save")
	}

	t.Run("rejects a popout-only saved layout before replacing the current layout", func(t *testing.T) {
		service := NewStateService(&ConfigService{config: config})
		valid := models.WorkspaceState{
			PaneTree:     &models.PaneTree{PaneID: "main"},
			ActivePaneID: "main",
			PaneTabs:     []models.PaneTabs{{PaneID: "main"}},
			SavedWorkspaces: []models.NamedWorkspace{{
				Name:   "popout-only",
				Layout: models.WorkspaceLayout{PopoutWindows: []models.PopoutWindow{{ID: "popout", PaneID: "main", Width: 1, Height: 1}}},
			}},
		}
		if err := service.SetWorkspaceState(valid); err != nil {
			t.Fatalf("SetWorkspaceState: %v", err)
		}
		before := service.GetWorkspaceState()
		beforeDisk, err := os.ReadFile(service.getStatePath())
		if err != nil {
			t.Fatalf("ReadFile before popout-only restore: %v", err)
		}
		if _, err := service.RestoreNamedWorkspace("popout-only"); err == nil {
			t.Fatal("RestoreNamedWorkspace accepted a popout-only layout")
		}
		if got := service.GetWorkspaceState(); !reflect.DeepEqual(got, before) {
			t.Fatalf("runtime state changed after rejected popout-only restore: %#v", got)
		}
		afterDisk, err := os.ReadFile(service.getStatePath())
		if err != nil {
			t.Fatalf("ReadFile after popout-only restore: %v", err)
		}
		if string(afterDisk) != string(beforeDisk) {
			t.Fatal("state.json changed after rejected popout-only restore")
		}
	})

	t.Run("restores a complete layout whose split weights are omitted", func(t *testing.T) {
		service := NewStateService(&ConfigService{config: config})
		valid := models.WorkspaceState{
			PaneTree:     &models.PaneTree{PaneID: "main"},
			ActivePaneID: "main",
			PaneTabs:     []models.PaneTabs{{PaneID: "main"}},
			SavedWorkspaces: []models.NamedWorkspace{{
				Name: "unweighted",
				Layout: models.WorkspaceLayout{
					PaneTree:     &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "left"}, {PaneID: "right"}}},
					ActivePaneID: "right",
					PaneTabs:     []models.PaneTabs{{PaneID: "left"}, {PaneID: "right"}},
				},
			}},
		}
		if err := service.SetWorkspaceState(valid); err != nil {
			t.Fatalf("SetWorkspaceState: %v", err)
		}
		if _, err := service.RestoreNamedWorkspace("unweighted"); err != nil {
			t.Fatalf("RestoreNamedWorkspace: %v", err)
		}
		if got := service.GetWorkspaceState(); got.PaneTree == nil || len(got.PaneTree.Weights) != 0 || got.ActivePaneID != "right" {
			t.Fatalf("unweighted saved layout did not restore: %#v", got)
		}
		reloaded := NewStateService(&ConfigService{config: config})
		if err := reloaded.Load(); err != nil {
			t.Fatalf("Load restored unweighted layout: %v", err)
		}
		if got := reloaded.GetWorkspaceState(); got.PaneTree == nil || len(got.PaneTree.Weights) != 0 || got.ActivePaneID != "right" || len(got.PaneTabs) != 2 {
			t.Fatalf("unweighted layout did not persist exactly: %#v", got)
		}
	})
}

func TestStateService_CloseWorkspacePanePreservesSurvivingWeights(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	if err := service.SetWorkspaceState(models.WorkspaceState{
		PaneTree:     &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "left"}, {PaneID: "middle"}, {PaneID: "right"}}, Weights: []float64{2, 3, 5}},
		ActivePaneID: "left",
		PaneTabs:     []models.PaneTabs{{PaneID: "left"}, {PaneID: "middle"}, {PaneID: "right"}},
	}); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}
	workspace, err := service.CloseWorkspacePane("middle")
	if err != nil {
		t.Fatalf("CloseWorkspacePane: %v", err)
	}
	if got := workspace.PaneTree.Weights; len(got) != 2 || got[0] != 2 || got[1] != 5 {
		t.Fatalf("surviving weights = %#v", got)
	}
}

func TestStateService_PopoutPairOperationsRequireMatchingPane(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	if err := service.SetWorkspaceState(models.WorkspaceState{
		PaneTree:      &models.PaneTree{PaneID: "main"},
		ActivePaneID:  "main",
		PaneTabs:      []models.PaneTabs{{PaneID: "main"}},
		PopoutWindows: []models.PopoutWindow{{ID: "popout", PaneID: "main", Width: 640, Height: 480}},
	}); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}
	if err := service.UpdatePopoutWindowGeometryForPane("popout", "other", 1, 2, 800, 600); err == nil {
		t.Fatal("accepted geometry for another pane")
	}
	statePath := filepath.Join(vaultPath, ".obails", "state.json")
	beforeDisk, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile before mismatched removal: %v", err)
	}
	beforeRuntime := service.GetWorkspaceState()
	noMatch, removed, err := service.RemovePopoutWindowIfMatches("popout", "other")
	if err != nil || removed {
		t.Fatalf("removed mismatched popout: removed=%v err=%v", removed, err)
	}
	if !reflect.DeepEqual(noMatch, beforeRuntime) || !reflect.DeepEqual(service.GetWorkspaceState(), beforeRuntime) {
		t.Fatalf("mismatched removal changed runtime: snapshot=%#v runtime=%#v before=%#v", noMatch, service.GetWorkspaceState(), beforeRuntime)
	}
	afterDisk, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile after mismatched removal: %v", err)
	}
	if !reflect.DeepEqual(afterDisk, beforeDisk) {
		t.Fatal("mismatched removal rewrote state.json")
	}
	if got := service.GetWorkspaceState().PopoutWindows[0]; got.Width != 640 || got.Height != 480 {
		t.Fatalf("mismatched operation changed persisted popout: %#v", got)
	}
}

func TestStateService_CorruptOrInvalidStateFallsBackToDefault(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	statePath := filepath.Join(vaultPath, ".obails", "state.json")
	if err := os.MkdirAll(filepath.Dir(statePath), 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	if err := os.WriteFile(statePath, []byte(`{"workspace":`), 0644); err != nil {
		t.Fatalf("WriteFile failed: %v", err)
	}

	service := NewStateService(&ConfigService{config: config})
	if err := service.Load(); err == nil {
		t.Fatal("expected invalid state error")
	}
	if got := service.GetWorkspaceState(); len(got.PaneTabs) != 0 || got.ActivePaneID != "" {
		t.Fatalf("workspace after corrupt load = %#v", got)
	}
	if err := service.SetExplorerSessionState(models.ExplorerSessionState{LeftSidebarWidth: 0}); err == nil {
		t.Fatal("expected invalid explorer width error")
	}
}

func TestStateService_RejectsSymlinkedStateDirectoryAndFile(t *testing.T) {
	t.Run("directory", func(t *testing.T) {
		vaultPath := t.TempDir()
		outsidePath := t.TempDir()
		if err := os.Symlink(outsidePath, filepath.Join(vaultPath, ".obails")); err != nil {
			t.Fatalf("Symlink failed: %v", err)
		}
		config := models.DefaultConfig()
		config.Vault.Path = vaultPath
		service := NewStateService(&ConfigService{config: config})
		if err := service.Save(); err == nil {
			t.Fatal("expected symlinked state directory rejection")
		}
	})

	t.Run("file", func(t *testing.T) {
		vaultPath := t.TempDir()
		stateDir := filepath.Join(vaultPath, ".obails")
		if err := os.MkdirAll(stateDir, 0755); err != nil {
			t.Fatalf("MkdirAll failed: %v", err)
		}
		outsideFile := filepath.Join(t.TempDir(), "state.json")
		if err := os.WriteFile(outsideFile, []byte("unchanged"), 0644); err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}
		if err := os.Symlink(outsideFile, filepath.Join(stateDir, "state.json")); err != nil {
			t.Fatalf("Symlink failed: %v", err)
		}
		config := models.DefaultConfig()
		config.Vault.Path = vaultPath
		service := NewStateService(&ConfigService{config: config})
		if err := service.Save(); err == nil {
			t.Fatal("expected symlinked state file rejection")
		}
		data, err := os.ReadFile(outsideFile)
		if err != nil {
			t.Fatalf("ReadFile failed: %v", err)
		}
		if string(data) != "unchanged" {
			t.Fatalf("symlink target was changed: %q", data)
		}
	})
}

func TestStateService_EnsureWorkspaceBootstrapsAtomically(t *testing.T) {
	t.Run("creates the first pane while preserving saved workspaces", func(t *testing.T) {
		vaultPath := t.TempDir()
		config := models.DefaultConfig()
		config.Vault.Path = vaultPath
		service := NewStateService(&ConfigService{config: config})
		saved := models.NamedWorkspace{Name: "saved", Layout: models.WorkspaceLayout{
			PaneTree:     &models.PaneTree{PaneID: "saved-pane"},
			ActivePaneID: "saved-pane",
			PaneTabs:     []models.PaneTabs{{PaneID: "saved-pane"}},
		}}
		if err := service.SetWorkspaceState(models.WorkspaceState{SavedWorkspaces: []models.NamedWorkspace{saved}}); err != nil {
			t.Fatalf("SetWorkspaceState empty workspace: %v", err)
		}

		workspace, err := service.EnsureWorkspace("first-pane")
		if err != nil {
			t.Fatalf("EnsureWorkspace: %v", err)
		}
		if workspace.PaneTree == nil || workspace.PaneTree.PaneID != "first-pane" || workspace.ActivePaneID != "first-pane" || len(workspace.PaneTabs) != 1 || workspace.PaneTabs[0].PaneID != "first-pane" || len(workspace.PaneTabs[0].Tabs) != 0 || len(workspace.SavedWorkspaces) != 1 || workspace.SavedWorkspaces[0].Name != "saved" {
			t.Fatalf("bootstrapped workspace = %#v", workspace)
		}

		reloaded := NewStateService(&ConfigService{config: config})
		if err := reloaded.Load(); err != nil {
			t.Fatalf("Load: %v", err)
		}
		if got := reloaded.GetWorkspaceState(); got.PaneTree == nil || got.PaneTree.PaneID != "first-pane" || got.ActivePaneID != "first-pane" || len(got.SavedWorkspaces) != 1 || got.SavedWorkspaces[0].Name != "saved" {
			t.Fatalf("persisted bootstrap = %#v", got)
		}
	})

	t.Run("is idempotent and preserves an existing workspace", func(t *testing.T) {
		vaultPath := t.TempDir()
		config := models.DefaultConfig()
		config.Vault.Path = vaultPath
		service := NewStateService(&ConfigService{config: config})
		existing := models.WorkspaceState{PaneTree: &models.PaneTree{PaneID: "existing"}, ActivePaneID: "existing", PaneTabs: []models.PaneTabs{{PaneID: "existing"}}}
		if err := service.SetWorkspaceState(existing); err != nil {
			t.Fatalf("SetWorkspaceState existing: %v", err)
		}

		for _, paneID := range []string{"existing", "different"} {
			workspace, err := service.EnsureWorkspace(paneID)
			if err != nil {
				t.Fatalf("EnsureWorkspace(%q): %v", paneID, err)
			}
			if workspace.PaneTree == nil || workspace.PaneTree.PaneID != "existing" || workspace.ActivePaneID != "existing" || len(workspace.PaneTabs) != 1 || workspace.PaneTabs[0].PaneID != "existing" {
				t.Fatalf("EnsureWorkspace(%q) overwrote workspace: %#v", paneID, workspace)
			}
		}
	})

	t.Run("rejects partial state without repairing it", func(t *testing.T) {
		for name, partial := range map[string]models.WorkspaceState{
			"pane tree and active pane without tabs": {PaneTree: &models.PaneTree{PaneID: "partial"}, ActivePaneID: "partial"},
			"popout without a pane tree":             {PopoutWindows: []models.PopoutWindow{{ID: "popout", PaneID: "partial", Width: 1, Height: 1}}},
		} {
			t.Run(name, func(t *testing.T) {
				service := NewStateService(&ConfigService{config: models.DefaultConfig()})
				service.state = &models.State{Workspace: partial}
				if _, err := service.EnsureWorkspace("first-pane"); err == nil {
					t.Fatal("EnsureWorkspace accepted a partial workspace")
				}
				if got := service.GetWorkspaceState(); !reflect.DeepEqual(got, partial) {
					t.Fatalf("partial workspace was repaired: %#v", got)
				}
			})
		}
	})

	t.Run("returns an existing snapshot without writing a protected state path", func(t *testing.T) {
		vaultPath := t.TempDir()
		config := models.DefaultConfig()
		config.Vault.Path = vaultPath
		service := NewStateService(&ConfigService{config: config})
		existing := models.WorkspaceState{PaneTree: &models.PaneTree{PaneID: "existing"}, ActivePaneID: "existing", PaneTabs: []models.PaneTabs{{PaneID: "existing"}}}
		if err := service.SetWorkspaceState(existing); err != nil {
			t.Fatalf("SetWorkspaceState existing: %v", err)
		}
		statePath := filepath.Join(vaultPath, ".obails", "state.json")
		stateDir := filepath.Dir(statePath)
		beforeDisk, err := os.ReadFile(statePath)
		if err != nil {
			t.Fatalf("ReadFile state: %v", err)
		}
		beforeRuntime := service.GetWorkspaceState()
		if err := os.Chmod(statePath, 0444); err != nil {
			t.Fatalf("Chmod state file: %v", err)
		}
		if err := os.Chmod(stateDir, 0555); err != nil {
			t.Fatalf("Chmod state directory: %v", err)
		}
		defer func() {
			_ = os.Chmod(statePath, 0644)
			_ = os.Chmod(stateDir, 0755)
		}()

		returned, err := service.EnsureWorkspace("different")
		if err != nil {
			t.Fatalf("EnsureWorkspace existing workspace: %v", err)
		}
		if !reflect.DeepEqual(returned, beforeRuntime) || !reflect.DeepEqual(service.GetWorkspaceState(), beforeRuntime) {
			t.Fatalf("existing snapshot changed: returned=%#v runtime=%#v before=%#v", returned, service.GetWorkspaceState(), beforeRuntime)
		}
		afterDisk, err := os.ReadFile(statePath)
		if err != nil {
			t.Fatalf("ReadFile state after EnsureWorkspace: %v", err)
		}
		if !reflect.DeepEqual(afterDisk, beforeDisk) {
			t.Fatal("existing state file changed while its path was write-protected")
		}
	})

	t.Run("keeps runtime and disk unchanged when persistence fails", func(t *testing.T) {
		vaultPath := t.TempDir()
		stateDir := filepath.Join(vaultPath, ".obails")
		if err := os.MkdirAll(stateDir, 0755); err != nil {
			t.Fatalf("MkdirAll: %v", err)
		}
		outsideFile := filepath.Join(t.TempDir(), "state.json")
		if err := os.WriteFile(outsideFile, []byte("unchanged"), 0644); err != nil {
			t.Fatalf("WriteFile outside state: %v", err)
		}
		if err := os.Symlink(outsideFile, filepath.Join(stateDir, "state.json")); err != nil {
			t.Fatalf("Symlink state: %v", err)
		}
		config := models.DefaultConfig()
		config.Vault.Path = vaultPath
		service := NewStateService(&ConfigService{config: config})
		if _, err := service.EnsureWorkspace("first-pane"); err == nil {
			t.Fatal("EnsureWorkspace succeeded through a symlinked state file")
		}
		if got := service.GetWorkspaceState(); got.PaneTree != nil || got.ActivePaneID != "" || len(got.PaneTabs) != 0 {
			t.Fatalf("runtime state changed after persistence failure: %#v", got)
		}
		data, err := os.ReadFile(outsideFile)
		if err != nil {
			t.Fatalf("ReadFile outside state: %v", err)
		}
		if string(data) != "unchanged" {
			t.Fatalf("persisted state changed after failure: %q", data)
		}
	})

	t.Run("concurrent callers choose one canonical pane", func(t *testing.T) {
		vaultPath := t.TempDir()
		config := models.DefaultConfig()
		config.Vault.Path = vaultPath
		service := NewStateService(&ConfigService{config: config})
		paneIDs := []string{"left", "right"}
		var start sync.WaitGroup
		start.Add(1)
		type ensureResult struct {
			workspace models.WorkspaceState
			err       error
		}
		results := make(chan ensureResult, len(paneIDs))
		for _, paneID := range paneIDs {
			go func(paneID string) {
				start.Wait()
				workspace, err := service.EnsureWorkspace(paneID)
				results <- ensureResult{workspace: workspace, err: err}
			}(paneID)
		}
		start.Done()
		returned := make([]ensureResult, 0, len(paneIDs))
		for range paneIDs {
			returned = append(returned, <-results)
		}
		workspace := service.GetWorkspaceState()
		if workspace.PaneTree == nil || len(workspace.PaneTabs) != 1 || workspace.ActivePaneID != workspace.PaneTree.PaneID || workspace.PaneTabs[0].PaneID != workspace.PaneTree.PaneID || (workspace.PaneTree.PaneID != "left" && workspace.PaneTree.PaneID != "right") {
			t.Fatalf("concurrent bootstrap state = %#v", workspace)
		}
		reloaded := NewStateService(&ConfigService{config: config})
		if err := reloaded.Load(); err != nil {
			t.Fatalf("Load concurrent state: %v", err)
		}
		diskWorkspace := reloaded.GetWorkspaceState()
		if !reflect.DeepEqual(diskWorkspace, workspace) {
			t.Fatalf("persisted concurrent state = %#v, want %#v", diskWorkspace, workspace)
		}
		for _, result := range returned {
			if result.err != nil {
				t.Fatalf("concurrent EnsureWorkspace: %v", result.err)
			}
			if !reflect.DeepEqual(result.workspace, workspace) || !reflect.DeepEqual(result.workspace, diskWorkspace) {
				t.Fatalf("concurrent result = %#v, want runtime=%#v disk=%#v", result.workspace, workspace, diskWorkspace)
			}
		}
	})
}

func TestStateService_ActivateWorkspacePaneAtomically(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	workspace := models.WorkspaceState{
		PaneTree:     &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "left"}, {PaneID: "right"}}},
		ActivePaneID: "left",
		PaneTabs:     []models.PaneTabs{{PaneID: "left"}, {PaneID: "right"}},
	}
	if err := service.SetWorkspaceState(workspace); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}

	activated, err := service.ActivateWorkspacePane("right")
	if err != nil {
		t.Fatalf("ActivateWorkspacePane: %v", err)
	}
	if activated.ActivePaneID != "right" || activated.PaneTree == nil || len(activated.PaneTabs) != 2 || activated.PaneTabs[0].PaneID != "left" || activated.PaneTabs[1].PaneID != "right" {
		t.Fatalf("activated workspace = %#v", activated)
	}
	reloaded := NewStateService(&ConfigService{config: config})
	if err := reloaded.Load(); err != nil {
		t.Fatalf("Load activated workspace: %v", err)
	}
	if got := reloaded.GetWorkspaceState(); got.ActivePaneID != "right" || got.PaneTree == nil || len(got.PaneTabs) != 2 {
		t.Fatalf("persisted activated workspace = %#v", got)
	}

	before := service.GetWorkspaceState()
	if _, err := service.ActivateWorkspacePane("missing"); err == nil {
		t.Fatal("ActivateWorkspacePane accepted an unknown pane")
	}
	if got := service.GetWorkspaceState(); got.ActivePaneID != before.ActivePaneID || got.PaneTree == nil || got.PaneTree.PaneID != before.PaneTree.PaneID || len(got.PaneTabs) != len(before.PaneTabs) {
		t.Fatalf("unknown pane changed runtime state: %#v", got)
	}

	statePath := filepath.Join(vaultPath, ".obails", "state.json")
	data, err := os.ReadFile(statePath)
	if err != nil {
		t.Fatalf("ReadFile state: %v", err)
	}
	if err := os.Remove(statePath); err != nil {
		t.Fatalf("Remove state: %v", err)
	}
	outsideFile := filepath.Join(t.TempDir(), "state.json")
	if err := os.WriteFile(outsideFile, data, 0644); err != nil {
		t.Fatalf("WriteFile outside state: %v", err)
	}
	if err := os.Symlink(outsideFile, statePath); err != nil {
		t.Fatalf("Symlink state: %v", err)
	}
	if _, err := service.ActivateWorkspacePane("left"); err == nil {
		t.Fatal("ActivateWorkspacePane succeeded through a symlinked state file")
	}
	if got := service.GetWorkspaceState(); got.ActivePaneID != "right" {
		t.Fatalf("persistence failure changed runtime focus: %#v", got)
	}
	persisted, err := os.ReadFile(outsideFile)
	if err != nil {
		t.Fatalf("ReadFile outside state: %v", err)
	}
	if string(persisted) != string(data) {
		t.Fatal("persistence failure changed disk state")
	}

	service.state = &models.State{Workspace: models.WorkspaceState{PaneTree: &models.PaneTree{PaneID: "partial"}, ActivePaneID: "partial"}}
	if _, err := service.ActivateWorkspacePane("partial"); err == nil {
		t.Fatal("ActivateWorkspacePane accepted a workspace without pane tabs")
	}
	if got := service.GetWorkspaceState(); got.PaneTree == nil || got.PaneTree.PaneID != "partial" || got.ActivePaneID != "partial" || len(got.PaneTabs) != 0 {
		t.Fatalf("invalid workspace was changed: %#v", got)
	}
}

func TestStateService_NamedWorkspaceRenameAndDeleteKeepSessionIndependent(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	current := models.WorkspaceState{
		PaneTree:     &models.PaneTree{PaneID: "main"},
		ActivePaneID: "main",
		PaneTabs: []models.PaneTabs{{
			PaneID:        "main",
			Tabs:          []models.WorkspaceTab{{Path: "notes/session.md", FileType: "markdown"}},
			ActiveTabPath: "notes/session.md",
		}},
	}
	if err := service.SetWorkspaceState(current); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}
	if _, err := service.SaveNamedWorkspace("writing"); err != nil {
		t.Fatalf("SaveNamedWorkspace writing: %v", err)
	}
	if _, err := service.OpenWorkspaceTab("main", models.WorkspaceTab{Path: "notes/later.md", FileType: "markdown"}); err != nil {
		t.Fatalf("OpenWorkspaceTab: %v", err)
	}
	if _, err := service.SaveNamedWorkspace("research"); err != nil {
		t.Fatalf("SaveNamedWorkspace research: %v", err)
	}

	beforeDisk, err := os.ReadFile(service.getStatePath())
	if err != nil {
		t.Fatalf("ReadFile before rename failure: %v", err)
	}
	before := service.GetWorkspaceState()
	if _, err := service.RenameNamedWorkspace("missing", "renamed"); err == nil {
		t.Fatal("RenameNamedWorkspace accepted a missing name")
	}
	if _, err := service.RenameNamedWorkspace("writing", "research"); err == nil {
		t.Fatal("RenameNamedWorkspace accepted a duplicate name")
	}
	if _, err := service.RenameNamedWorkspace("writing", " padded "); err == nil {
		t.Fatal("RenameNamedWorkspace accepted surrounding whitespace")
	}
	if got := service.GetWorkspaceState(); !reflect.DeepEqual(got, before) {
		t.Fatalf("runtime state changed after rejected rename: %#v", got)
	}
	afterDisk, err := os.ReadFile(service.getStatePath())
	if err != nil {
		t.Fatalf("ReadFile after rename failure: %v", err)
	}
	if string(afterDisk) != string(beforeDisk) {
		t.Fatal("state.json changed after rejected rename")
	}

	renamed, err := service.RenameNamedWorkspace("writing", "drafts")
	if err != nil {
		t.Fatalf("RenameNamedWorkspace: %v", err)
	}
	if renamed.ActiveNamedWorkspace != "research" {
		t.Fatalf("rename changed the selected named workspace: %#v", renamed)
	}
	if got := renamed.PaneTabs[0].Tabs; len(got) != 2 || got[1].Path != "notes/later.md" {
		t.Fatalf("rename mutated the current session: %#v", got)
	}
	if names := namedWorkspaceNames(renamed); !reflect.DeepEqual(names, []string{"drafts", "research"}) {
		t.Fatalf("renamed saved names = %v", names)
	}

	deleted, err := service.DeleteNamedWorkspace("research")
	if err != nil {
		t.Fatalf("DeleteNamedWorkspace: %v", err)
	}
	if deleted.ActiveNamedWorkspace != "" {
		t.Fatalf("delete left the selected named workspace: %#v", deleted)
	}
	if got := deleted.PaneTabs[0].Tabs; len(got) != 2 || got[1].Path != "notes/later.md" {
		t.Fatalf("delete mutated the current session: %#v", got)
	}
	if names := namedWorkspaceNames(deleted); !reflect.DeepEqual(names, []string{"drafts"}) {
		t.Fatalf("deleted saved names = %v", names)
	}

	if _, err := service.RestoreNamedWorkspace("drafts"); err != nil {
		t.Fatalf("RestoreNamedWorkspace drafts: %v", err)
	}
	if _, err := service.OpenWorkspaceTab("main", models.WorkspaceTab{Path: "notes/keep.md", FileType: "markdown"}); err != nil {
		t.Fatalf("OpenWorkspaceTab keep: %v", err)
	}
	renamedActive, err := service.RenameNamedWorkspace("drafts", "inbox")
	if err != nil {
		t.Fatalf("RenameNamedWorkspace active: %v", err)
	}
	if renamedActive.ActiveNamedWorkspace != "inbox" {
		t.Fatalf("renaming the selected workspace did not keep it selected: %#v", renamedActive)
	}
	if got := renamedActive.PaneTabs[0].Tabs; len(got) != 2 || got[1].Path != "notes/keep.md" {
		t.Fatalf("active rename mutated the current session: %#v", got)
	}

	before = service.GetWorkspaceState()
	beforeDisk, err = os.ReadFile(service.getStatePath())
	if err != nil {
		t.Fatalf("ReadFile before delete failure: %v", err)
	}
	if _, err := service.DeleteNamedWorkspace("research"); err == nil {
		t.Fatal("DeleteNamedWorkspace accepted a missing name")
	}
	if got := service.GetWorkspaceState(); !reflect.DeepEqual(got, before) {
		t.Fatalf("runtime state changed after rejected delete: %#v", got)
	}
	afterDisk, err = os.ReadFile(service.getStatePath())
	if err != nil {
		t.Fatalf("ReadFile after delete failure: %v", err)
	}
	if string(afterDisk) != string(beforeDisk) {
		t.Fatal("state.json changed after rejected delete")
	}
}

func TestStateService_RewriteWorkspaceTabsAfterMoveReplacesSameRecord(t *testing.T) {
	vaultPath := t.TempDir()
	config := models.DefaultConfig()
	config.Vault.Path = vaultPath
	service := NewStateService(&ConfigService{config: config})
	if err := service.SetWorkspaceState(models.WorkspaceState{
		PaneTree: &models.PaneTree{
			SplitDirection: models.SplitDirectionHorizontal,
			Children:       []models.PaneTree{{PaneID: "left"}, {PaneID: "right"}},
			Weights:        []float64{1, 1},
		},
		ActivePaneID: "left",
		PaneTabs: []models.PaneTabs{
			{PaneID: "left", Tabs: []models.WorkspaceTab{{Path: "notes/Old Name.md", FileType: "markdown"}, {Path: "notes/Keep.md", FileType: "markdown"}}, ActiveTabPath: "notes/Old Name.md"},
			{PaneID: "right", Tabs: []models.WorkspaceTab{{Path: "notes/Old Name.md", FileType: "markdown"}}, ActiveTabPath: "notes/Old Name.md"},
		},
		SavedWorkspaces: []models.NamedWorkspace{{
			Name: "Writing",
			Layout: models.WorkspaceLayout{
				PaneTree:     &models.PaneTree{PaneID: "saved"},
				ActivePaneID: "saved",
				PaneTabs:     []models.PaneTabs{{PaneID: "saved", Tabs: []models.WorkspaceTab{{Path: "notes/Old Name.md", FileType: "markdown"}}, ActiveTabPath: "notes/Old Name.md"}},
			},
		}},
	}); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}

	rewritten, err := service.RewriteWorkspaceTabsAfterMove("notes/Old Name.md", "notes/New Name.md", false)
	if err != nil {
		t.Fatalf("RewriteWorkspaceTabsAfterMove: %v", err)
	}
	if rewritten.ActivePaneID != "left" {
		t.Fatalf("active pane changed: %#v", rewritten.ActivePaneID)
	}
	if got := rewritten.PaneTabs[0].Tabs; len(got) != 2 || got[0].Path != "notes/New Name.md" || got[1].Path != "notes/Keep.md" {
		t.Fatalf("left tabs were not rewritten in place: %#v", got)
	}
	if rewritten.PaneTabs[0].ActiveTabPath != "notes/New Name.md" || rewritten.PaneTabs[1].ActiveTabPath != "notes/New Name.md" {
		t.Fatalf("active tab paths were not rewritten: %#v", rewritten.PaneTabs)
	}
	if got := rewritten.SavedWorkspaces[0].Layout.PaneTabs[0].Tabs; len(got) != 1 || got[0].Path != "notes/Old Name.md" {
		t.Fatalf("named workspace tabs were rewritten: %#v", got)
	}

	folder, err := service.RewriteWorkspaceTabsAfterMove("notes", "archive", true)
	if err != nil {
		t.Fatalf("folder RewriteWorkspaceTabsAfterMove: %v", err)
	}
	if got := folder.PaneTabs[0].Tabs; len(got) != 2 || got[0].Path != "archive/New Name.md" || got[1].Path != "archive/Keep.md" {
		t.Fatalf("folder rewrite did not keep tab records: %#v", got)
	}

	reloaded := NewStateService(&ConfigService{config: config})
	if err := reloaded.Load(); err != nil {
		t.Fatalf("Load: %v", err)
	}
	persisted := reloaded.GetWorkspaceState()
	if got := persisted.PaneTabs[0].Tabs; len(got) != 2 || got[0].Path != "archive/New Name.md" {
		t.Fatalf("rewritten tabs were not persisted: %#v", got)
	}
}

func namedWorkspaceNames(workspace models.WorkspaceState) []string {
	names := make([]string, 0, len(workspace.SavedWorkspaces))
	for _, saved := range workspace.SavedWorkspaces {
		names = append(names, saved.Name)
	}
	return names
}
