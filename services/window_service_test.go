//go:build !cli

package services

import (
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"testing"

	"github.com/kazuph/obails/models"
	"github.com/wailsapp/wails/v3/pkg/application"
)

func TestNewPopoutWindowOptionsUseAnEncodedNativeRoute(t *testing.T) {
	popout := models.PopoutWindow{ID: "window&other=1", PaneID: "pane?other=1", X: -20, Y: 40, Width: 800, Height: 600}
	visuals := WindowVisuals{
		Title:            "Obails Dev",
		Mac:              application.MacWindow{Appearance: application.NSAppearanceNameAqua},
		BackgroundColour: application.NewRGB(255, 255, 255),
	}
	options := newPopoutWindowOptions(popout, visuals)
	parsed, err := url.Parse(options.URL)
	if err != nil {
		t.Fatalf("parse popout URL: %v", err)
	}
	if parsed.Path != "/" || parsed.Query().Get("popout") != popout.PaneID || parsed.Query().Get("id") != popout.ID || len(parsed.Query()) != 2 {
		t.Fatalf("encoded popout route = %q, parsed = %#v", options.URL, parsed.Query())
	}
	if options.Name != "popout:"+popout.ID || options.Width != popout.Width || options.Height != popout.Height || options.X != popout.X || options.Y != popout.Y {
		t.Fatalf("native popout options = %#v", options)
	}
	if options.Title != visuals.Title {
		t.Fatalf("native popout title = %q, want %q", options.Title, visuals.Title)
	}
	if options.Mac.Appearance != application.NSAppearanceNameAqua || options.BackgroundColour != visuals.BackgroundColour {
		t.Fatalf("native popout visuals = %#v / %#v", options.Mac, options.BackgroundColour)
	}
}

func TestValidatePopoutInputFailsClosed(t *testing.T) {
	for _, popout := range []models.PopoutWindow{
		{},
		{ID: " popout", PaneID: "pane", Width: 1, Height: 1},
		{ID: "popout", PaneID: "pane ", Width: 1, Height: 1},
		{ID: "popout", PaneID: "pane", Width: 0, Height: 1},
		{ID: "popout", PaneID: "pane", Width: 1, Height: 0},
	} {
		if err := validatePopoutInput(popout); err == nil {
			t.Fatalf("expected invalid popout input rejection: %#v", popout)
		}
	}
}

func TestRestorePopoutRecordUsesOnlyTheExactPersistedRecord(t *testing.T) {
	workspace := models.WorkspaceState{
		PaneTree:      &models.PaneTree{PaneID: "pane"},
		ActivePaneID:  "pane",
		PaneTabs:      []models.PaneTabs{{PaneID: "pane"}},
		PopoutWindows: []models.PopoutWindow{{ID: "persisted", PaneID: "pane", X: 7, Y: 8, Width: 640, Height: 480}},
	}
	popout, err := restorePopoutRecord(workspace, "persisted")
	if err != nil {
		t.Fatalf("restorePopoutRecord failed: %v", err)
	}
	if popout.ID != "persisted" || popout.X != 7 || popout.Height != 480 {
		t.Fatalf("restored popout = %#v", popout)
	}
	if _, err := restorePopoutRecord(workspace, "unknown"); err == nil {
		t.Fatal("expected unknown persisted popout rejection")
	}
}

func TestPopoutRouteRequiresThePersistedPanePair(t *testing.T) {
	workspace := models.WorkspaceState{
		PaneTree:      &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "main"}, {PaneID: "side"}}},
		ActivePaneID:  "main",
		PaneTabs:      []models.PaneTabs{{PaneID: "main"}, {PaneID: "side"}},
		PopoutWindows: []models.PopoutWindow{{ID: "persisted", PaneID: "side", Width: 640, Height: 480}},
	}
	popout, err := popoutRecordForPane(workspace, "side", "persisted")
	if err != nil || popout.PaneID != "side" {
		t.Fatalf("matching route = %#v, %v", popout, err)
	}
	if _, err := popoutRecordForPane(workspace, "main", "persisted"); err == nil {
		t.Fatal("accepted a popout ID for another pane")
	}
	configService, _ := newTestConfigService(t)
	stateService := NewStateService(configService)
	if err := stateService.SetWorkspaceState(workspace); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}
	service := NewWindowService(nil, stateService, WindowVisuals{})
	if err := service.ValidatePopoutRoute("side", "persisted"); err != nil {
		t.Fatalf("ValidatePopoutRoute matching pair: %v", err)
	}
	if err := service.ValidatePopoutRoute("main", "persisted"); err == nil {
		t.Fatal("ValidatePopoutRoute accepted a mismatched pair")
	}
}

func TestNativeCloseAllowsAnAlreadyRemovedPersistedRecord(t *testing.T) {
	configService, _ := newTestConfigService(t)
	stateService := NewStateService(configService)
	service := NewWindowService(nil, stateService, WindowVisuals{})
	service.popouts["detached"] = trackedPopout{paneID: "main"}

	if err := service.removeClosedPopout("detached", "main"); err != nil {
		t.Fatalf("removeClosedPopout: %v", err)
	}
	if _, exists := service.popouts["detached"]; exists {
		t.Fatal("native popout remained tracked after idempotent close")
	}
}

func TestWindowServicePopoutMutationsReturnSnapshotsAndProtectPairs(t *testing.T) {
	app := application.Get()
	if app == nil {
		app = application.New(application.Options{DisableDefaultSignalHandler: true})
	}

	newService := func(t *testing.T) (*WindowService, *StateService, string) {
		t.Helper()
		configService, vaultPath := newTestConfigService(t)
		stateService := NewStateService(configService)
		workspace := models.WorkspaceState{
			PaneTree:     &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "main"}, {PaneID: "side"}}, Weights: []float64{1, 1}},
			ActivePaneID: "main",
			PaneTabs:     []models.PaneTabs{{PaneID: "main"}, {PaneID: "side"}},
		}
		if err := stateService.SetWorkspaceState(workspace); err != nil {
			t.Fatalf("SetWorkspaceState: %v", err)
		}
		return NewWindowService(app, stateService, WindowVisuals{}), stateService, vaultPath
	}

	t.Run("create close and rejoin return authoritative snapshots", func(t *testing.T) {
		service, stateService, _ := newService(t)
		created, err := service.CreatePopout("main", "popout", 10, 20, 640, 480)
		if err != nil {
			t.Fatalf("CreatePopout: %v", err)
		}
		if len(created.PopoutWindows) != 1 || created.PopoutWindows[0].ID != "popout" || created.ActivePaneID != "side" || !reflect.DeepEqual(created, stateService.GetWorkspaceState()) {
			t.Fatalf("create snapshot = %#v, runtime = %#v", created, stateService.GetWorkspaceState())
		}
		trackedWindow := service.popouts["popout"].window
		if trackedWindow == nil {
			t.Fatal("CreatePopout did not track the native Wails window")
		}
		if _, err := service.CreatePopout("main", "popout", 10, 20, 640, 480); err == nil {
			t.Fatal("CreatePopout accepted a duplicate map ID")
		}

		closed, err := service.ClosePopout("main", "popout")
		if err != nil {
			t.Fatalf("ClosePopout: %v", err)
		}
		if len(closed.PopoutWindows) != 0 || !reflect.DeepEqual(closed, stateService.GetWorkspaceState()) {
			t.Fatalf("close snapshot = %#v, runtime = %#v", closed, stateService.GetWorkspaceState())
		}
		if _, exists := service.popouts["popout"]; exists {
			t.Fatal("ClosePopout left the native window tracked")
		}

		if _, err := service.CreatePopout("main", "rejoin", 10, 20, 640, 480); err != nil {
			t.Fatalf("CreatePopout for rejoin: %v", err)
		}
		rejoined, err := service.RejoinPopout("main", "rejoin")
		if err != nil {
			t.Fatalf("RejoinPopout: %v", err)
		}
		if len(rejoined.PopoutWindows) != 0 || !reflect.DeepEqual(rejoined, stateService.GetWorkspaceState()) {
			t.Fatalf("rejoin snapshot = %#v, runtime = %#v", rejoined, stateService.GetWorkspaceState())
		}
	})

	t.Run("pair mismatch keeps map native window and state", func(t *testing.T) {
		service, stateService, _ := newService(t)
		if _, err := service.CreatePopout("main", "popout", 10, 20, 640, 480); err != nil {
			t.Fatalf("CreatePopout: %v", err)
		}
		trackedWindow := service.popouts["popout"].window
		mismatched := models.WorkspaceState{
			PaneTree:      &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "main"}, {PaneID: "side"}}},
			ActivePaneID:  "main",
			PaneTabs:      []models.PaneTabs{{PaneID: "main"}, {PaneID: "side"}},
			PopoutWindows: []models.PopoutWindow{{ID: "popout", PaneID: "side", Width: 640, Height: 480}},
		}
		if err := stateService.SetWorkspaceState(mismatched); err != nil {
			t.Fatalf("SetWorkspaceState mismatch: %v", err)
		}
		if _, err := service.ClosePopout("side", "popout"); err == nil {
			t.Fatal("ClosePopout accepted a stale route for the tracked popout ID")
		}
		if _, err := service.ClosePopout("main", "popout"); err == nil {
			t.Fatal("ClosePopout accepted a mismatched pane pair")
		}
		tracked, exists := service.popouts["popout"]
		if !exists || tracked.paneID != "main" || tracked.window != trackedWindow {
			t.Fatal("pair mismatch changed native tracking")
		}
		if got := stateService.GetWorkspaceState(); len(got.PopoutWindows) != 1 || got.PopoutWindows[0].PaneID != "side" {
			t.Fatalf("pair mismatch changed state: %#v", got)
		}
	})

	t.Run("save failure keeps map native window and state", func(t *testing.T) {
		service, stateService, vaultPath := newService(t)
		if _, err := service.CreatePopout("main", "popout", 10, 20, 640, 480); err != nil {
			t.Fatalf("CreatePopout: %v", err)
		}
		before := stateService.GetWorkspaceState()
		statePath := filepath.Join(vaultPath, ".obails", "state.json")
		beforeDisk, err := os.ReadFile(statePath)
		if err != nil {
			t.Fatalf("ReadFile before save failure: %v", err)
		}
		stateDir := filepath.Dir(statePath)
		if err := os.Chmod(statePath, 0444); err != nil {
			t.Fatalf("Chmod state: %v", err)
		}
		if err := os.Chmod(stateDir, 0555); err != nil {
			t.Fatalf("Chmod state directory: %v", err)
		}
		defer func() {
			_ = os.Chmod(statePath, 0644)
			_ = os.Chmod(stateDir, 0755)
		}()

		if _, err := service.ClosePopout("main", "popout"); err == nil {
			t.Fatal("ClosePopout succeeded after state persistence was blocked")
		}
		tracked, exists := service.popouts["popout"]
		if !exists || tracked.window == nil {
			t.Fatal("save failure removed native tracking")
		}
		if got := stateService.GetWorkspaceState(); !reflect.DeepEqual(got, before) {
			t.Fatalf("save failure changed state: %#v, want %#v", got, before)
		}
		afterDisk, err := os.ReadFile(statePath)
		if err != nil {
			t.Fatalf("ReadFile after save failure: %v", err)
		}
		if !reflect.DeepEqual(afterDisk, beforeDisk) {
			t.Fatal("save failure changed state.json")
		}
	})

	t.Run("restore returns snapshot after native reconcile", func(t *testing.T) {
		service, stateService, _ := newService(t)
		popout := models.PopoutWindow{ID: "saved-popout", PaneID: "main", Width: 640, Height: 480}
		if _, err := stateService.AddPopoutWindow(popout); err != nil {
			t.Fatalf("AddPopoutWindow: %v", err)
		}
		if _, err := stateService.SaveNamedWorkspace("with-popout"); err != nil {
			t.Fatalf("SaveNamedWorkspace: %v", err)
		}
		withoutPopout := stateService.GetWorkspaceState()
		withoutPopout.PopoutWindows = nil
		if err := stateService.SetWorkspaceState(withoutPopout); err != nil {
			t.Fatalf("SetWorkspaceState without popout: %v", err)
		}

		restored, err := service.RestoreNamedWorkspace("with-popout")
		if err != nil {
			t.Fatalf("RestoreNamedWorkspace: %v", err)
		}
		if len(restored.PopoutWindows) != 1 || restored.PopoutWindows[0] != popout || !reflect.DeepEqual(restored, stateService.GetWorkspaceState()) {
			t.Fatalf("restore snapshot = %#v, runtime = %#v", restored, stateService.GetWorkspaceState())
		}
		tracked, exists := service.popouts[popout.ID]
		if !exists || tracked.paneID != popout.PaneID || tracked.window == nil {
			t.Fatal("RestoreNamedWorkspace did not reconcile the persisted native popout")
		}
	})

	t.Run("startup reconcile recreates every persisted native popout without changing state", func(t *testing.T) {
		configService, vaultPath := newTestConfigService(t)
		persistedState := NewStateService(configService)
		workspace := models.WorkspaceState{
			PaneTree:     &models.PaneTree{SplitDirection: models.SplitDirectionHorizontal, Children: []models.PaneTree{{PaneID: "main"}, {PaneID: "side"}}, Weights: []float64{1, 1}},
			ActivePaneID: "main",
			PaneTabs:     []models.PaneTabs{{PaneID: "main"}, {PaneID: "side"}},
		}
		if err := persistedState.SetWorkspaceState(workspace); err != nil {
			t.Fatalf("SetWorkspaceState: %v", err)
		}
		popout := models.PopoutWindow{ID: "startup-popout", PaneID: "main", Width: 640, Height: 480}
		if _, err := persistedState.AddPopoutWindow(popout); err != nil {
			t.Fatalf("AddPopoutWindow: %v", err)
		}
		statePath := filepath.Join(vaultPath, ".obails", "state.json")
		beforeDisk, err := os.ReadFile(statePath)
		if err != nil {
			t.Fatalf("ReadFile before startup: %v", err)
		}

		reloadedState := NewStateService(configService)
		if err := reloadedState.Load(); err != nil {
			t.Fatalf("Load persisted workspace: %v", err)
		}
		startupService := NewWindowService(app, reloadedState, WindowVisuals{})
		if err := startupService.ReconcilePopouts(); err != nil {
			t.Fatalf("ReconcilePopouts at startup: %v", err)
		}
		tracked, exists := startupService.popouts[popout.ID]
		if !exists || tracked.paneID != popout.PaneID || tracked.window == nil {
			t.Fatal("startup reconcile did not create the persisted native popout")
		}
		if got := reloadedState.GetWorkspaceState(); len(got.PopoutWindows) != 1 || got.PopoutWindows[0] != popout {
			t.Fatalf("startup reconcile changed persisted workspace: %#v", got)
		}
		afterDisk, err := os.ReadFile(statePath)
		if err != nil {
			t.Fatalf("ReadFile after startup: %v", err)
		}
		if !reflect.DeepEqual(afterDisk, beforeDisk) {
			t.Fatal("startup reconcile rewrote state.json")
		}
	})
}

func TestWindowService_CreatePopoutFinalVisiblePaneClonesActiveNoteInMainPane(t *testing.T) {
	app := application.Get()
	if app == nil {
		app = application.New(application.Options{DisableDefaultSignalHandler: true})
	}
	configService, _ := newTestConfigService(t)
	stateService := NewStateService(configService)
	if err := stateService.SetWorkspaceState(models.WorkspaceState{
		PaneTree:     &models.PaneTree{PaneID: "main"},
		ActivePaneID: "main",
		PaneTabs: []models.PaneTabs{{
			PaneID:        "main",
			Tabs:          []models.WorkspaceTab{{Path: "notes/one.md", FileType: "markdown"}},
			ActiveTabPath: "notes/one.md",
		}},
	}); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}
	service := NewWindowService(app, stateService, WindowVisuals{})
	created, err := service.CreatePopout("main", "only", 10, 20, 640, 480)
	if err != nil {
		t.Fatalf("CreatePopout final visible pane: %v", err)
	}
	if len(created.PopoutWindows) != 1 || created.PopoutWindows[0].PaneID != "main" || created.PopoutWindows[0].ID != "only" {
		t.Fatalf("create snapshot popouts = %#v", created.PopoutWindows)
	}
	replacementID := firstVisibleWorkspacePane(*created.PaneTree, created.PopoutWindows, "")
	if replacementID == "" || replacementID == "main" || created.ActivePaneID != replacementID {
		t.Fatalf("create snapshot left no operable main pane: %#v", created)
	}
	var replacementTabs *models.PaneTabs
	for index := range created.PaneTabs {
		if created.PaneTabs[index].PaneID == replacementID {
			replacementTabs = &created.PaneTabs[index]
		}
		if created.PaneTabs[index].PaneID == "main" && (len(created.PaneTabs[index].Tabs) != 1 || created.PaneTabs[index].ActiveTabPath != "notes/one.md") {
			t.Fatalf("popped pane tabs were rewritten: %#v", created.PaneTabs[index])
		}
	}
	if replacementTabs == nil || len(replacementTabs.Tabs) != 1 || replacementTabs.Tabs[0].Path != "notes/one.md" || replacementTabs.ActiveTabPath != "notes/one.md" {
		t.Fatalf("main remainder did not clone the active note: %#v", replacementTabs)
	}
	tracked, exists := service.popouts["only"]
	if !exists || tracked.paneID != "main" || tracked.window == nil {
		t.Fatal("CreatePopout did not track the native window for the popped pane")
	}
	if got := stateService.GetWorkspaceState(); !reflect.DeepEqual(got, created) {
		t.Fatalf("create snapshot is not authoritative: %#v", got)
	}

	closed, err := service.ClosePopout("main", "only")
	if err != nil {
		t.Fatalf("ClosePopout after final visible popout: %v", err)
	}
	if len(closed.PopoutWindows) != 0 || closed.ActivePaneID != replacementID {
		t.Fatalf("rejoin snapshot = %#v", closed)
	}
	if firstVisibleWorkspacePane(*closed.PaneTree, closed.PopoutWindows, "") == "" {
		t.Fatalf("rejoin left an empty main window: %#v", closed)
	}
	var mainTabs, remainderTabs *models.PaneTabs
	for index := range closed.PaneTabs {
		switch closed.PaneTabs[index].PaneID {
		case "main":
			mainTabs = &closed.PaneTabs[index]
		case replacementID:
			remainderTabs = &closed.PaneTabs[index]
		}
	}
	if mainTabs == nil || remainderTabs == nil {
		t.Fatalf("rejoin dropped a pane: %#v", closed.PaneTabs)
	}
	if len(mainTabs.Tabs) != 1 || mainTabs.Tabs[0].Path != "notes/one.md" || len(remainderTabs.Tabs) != 1 || remainderTabs.Tabs[0].Path != "notes/one.md" {
		t.Fatalf("rejoin lost the cloned note identity: main=%#v remainder=%#v", mainTabs, remainderTabs)
	}
}

func TestNativeCloseProtectsExactPairAndShutdownPersistence(t *testing.T) {
	configService, _ := newTestConfigService(t)
	stateService := NewStateService(configService)
	service := NewWindowService(nil, stateService, WindowVisuals{})
	service.popouts["detached"] = trackedPopout{paneID: "main"}

	if err := service.removeClosedPopout("detached", "side"); err != nil {
		t.Fatalf("mismatched native close: %v", err)
	}
	if _, exists := service.popouts["detached"]; !exists {
		t.Fatal("mismatched native close removed tracked popout")
	}
	service.BeginShutdown()
	if err := service.removeClosedPopout("detached", "main"); err != nil {
		t.Fatalf("shutdown native close: %v", err)
	}
	if _, exists := service.popouts["detached"]; !exists {
		t.Fatal("shutdown native close removed tracked popout")
	}
}

func TestWindowService_RefreshWorkspaceMenuUsesSavedNamesWithoutChangingSession(t *testing.T) {
	configService, _ := newTestConfigService(t)
	stateService := NewStateService(configService)
	if err := stateService.SetWorkspaceState(models.WorkspaceState{
		PaneTree:     &models.PaneTree{PaneID: "main"},
		ActivePaneID: "main",
		PaneTabs: []models.PaneTabs{{
			PaneID:        "main",
			Tabs:          []models.WorkspaceTab{{Path: "notes/session.md", FileType: "markdown"}},
			ActiveTabPath: "notes/session.md",
		}},
	}); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}
	if _, err := stateService.SaveNamedWorkspace("Writing"); err != nil {
		t.Fatalf("SaveNamedWorkspace: %v", err)
	}
	if _, err := stateService.OpenWorkspaceTab("main", models.WorkspaceTab{Path: "notes/later.md", FileType: "markdown"}); err != nil {
		t.Fatalf("OpenWorkspaceTab: %v", err)
	}
	before := stateService.GetWorkspaceState()
	service := NewWindowService(nil, stateService, WindowVisuals{})
	var gotTheme string
	var gotNames []string
	var gotActive string
	calls := 0
	SetApplicationMenuApplier("github-light", func(theme string, names []string, active string) {
		calls++
		gotTheme = theme
		gotNames = append([]string(nil), names...)
		gotActive = active
	})
	t.Cleanup(func() { SetApplicationMenuApplier("", nil) })
	service.RefreshWorkspaceMenu()
	if calls != 1 || gotTheme != "github-light" || gotActive != "Writing" || len(gotNames) != 1 || gotNames[0] != "Writing" {
		t.Fatalf("menu refresh = theme:%q names:%v active:%q calls:%d", gotTheme, gotNames, gotActive, calls)
	}
	if got := stateService.GetWorkspaceState(); !reflect.DeepEqual(got, before) {
		t.Fatalf("RefreshWorkspaceMenu changed session state: %#v", got)
	}
}

func TestWindowService_RefreshWorkspaceMenuDispatchesOffTheCallingGoroutine(t *testing.T) {
	configService, _ := newTestConfigService(t)
	stateService := NewStateService(configService)
	if err := stateService.SetWorkspaceState(models.WorkspaceState{
		PaneTree:     &models.PaneTree{PaneID: "main"},
		ActivePaneID: "main",
		PaneTabs:     []models.PaneTabs{{PaneID: "main"}},
	}); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}
	if _, err := stateService.SaveNamedWorkspace("Research"); err != nil {
		t.Fatalf("SaveNamedWorkspace: %v", err)
	}
	service := NewWindowService(nil, stateService, WindowVisuals{})
	var (
		mu              sync.Mutex
		dispatchN       int
		applyN          int
		applyTheme      string
		applyNames      []string
		applyActive     string
		applyOnDispatch bool
	)
	SetApplicationMenuDispatcher(func(fn func()) {
		mu.Lock()
		dispatchN++
		mu.Unlock()
		fn()
	})
	t.Cleanup(func() { SetApplicationMenuDispatcher(nil) })
	SetApplicationMenuApplier("nord", func(theme string, names []string, active string) {
		mu.Lock()
		defer mu.Unlock()
		applyN++
		applyTheme = theme
		applyNames = append([]string(nil), names...)
		applyActive = active
		applyOnDispatch = dispatchN == 1
	})
	t.Cleanup(func() { SetApplicationMenuApplier("", nil) })

	done := make(chan struct{})
	go func() {
		defer close(done)
		service.SetMenuTheme("dracula")
		service.RefreshWorkspaceMenu()
	}()
	<-done

	mu.Lock()
	defer mu.Unlock()
	if dispatchN != 1 || applyN != 1 || !applyOnDispatch {
		t.Fatalf("off-main menu refresh dispatch=%d apply=%d applyOnDispatch=%v", dispatchN, applyN, applyOnDispatch)
	}
	if applyTheme != "dracula" || applyActive != "Research" || len(applyNames) != 1 || applyNames[0] != "Research" {
		t.Fatalf("dispatched menu refresh = theme:%q names:%v active:%q", applyTheme, applyNames, applyActive)
	}
}

func TestWindowService_RefreshWorkspaceMenuRunsInlineWhenDispatcherIsNil(t *testing.T) {
	configService, _ := newTestConfigService(t)
	stateService := NewStateService(configService)
	if err := stateService.SetWorkspaceState(models.WorkspaceState{
		PaneTree:     &models.PaneTree{PaneID: "main"},
		ActivePaneID: "main",
		PaneTabs:     []models.PaneTabs{{PaneID: "main"}},
	}); err != nil {
		t.Fatalf("SetWorkspaceState: %v", err)
	}
	service := NewWindowService(nil, stateService, WindowVisuals{})
	SetApplicationMenuDispatcher(nil)
	calls := 0
	SetApplicationMenuApplier("github-light", func(string, []string, string) {
		calls++
	})
	t.Cleanup(func() { SetApplicationMenuApplier("", nil) })
	service.RefreshWorkspaceMenu()
	if calls != 1 {
		t.Fatalf("startup inline menu apply calls = %d, want 1", calls)
	}
}
