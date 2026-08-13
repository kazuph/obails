//go:build !cli

package services

import (
	"fmt"
	"net/url"
	"strings"
	"sync"

	"github.com/kazuph/obails/models"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
)

// WindowService handles window operations
type WindowService struct {
	app          *application.App
	stateService *StateService
	window       *application.WebviewWindow
	mu           sync.Mutex
	popouts      map[string]trackedPopout
	shuttingDown bool
	visuals      WindowVisuals
}

type workspaceMenuApplier struct {
	mu    sync.Mutex
	theme string
	apply func(theme string, names []string, activeName string)
}

var applicationWorkspaceMenu workspaceMenuApplier

// SetApplicationMenuApplier stores the current theme and the callback that
// rebuilds the native application menu from saved workspace names.
func SetApplicationMenuApplier(theme string, apply func(theme string, names []string, activeName string)) {
	applicationWorkspaceMenu.mu.Lock()
	defer applicationWorkspaceMenu.mu.Unlock()
	applicationWorkspaceMenu.theme = theme
	applicationWorkspaceMenu.apply = apply
}

type trackedPopout struct {
	paneID string
	window *application.WebviewWindow
}

// WindowVisuals keeps native child windows consistent with the selected app theme.
type WindowVisuals struct {
	Title            string
	Mac              application.MacWindow
	BackgroundColour application.RGBA
}

// NewWindowService creates a WindowService with explicit application and state dependencies.
func NewWindowService(app *application.App, stateService *StateService, visuals WindowVisuals) *WindowService {
	return &WindowService{
		app:          app,
		stateService: stateService,
		popouts:      make(map[string]trackedPopout),
		visuals:      visuals,
	}
}

// SetWindow sets the window reference (called after window creation)
func (s *WindowService) SetWindow(window *application.WebviewWindow) {
	s.window = window
}

// SetMenuTheme keeps the next workspace menu rebuild on the selected theme.
func (s *WindowService) SetMenuTheme(theme string) {
	applicationWorkspaceMenu.mu.Lock()
	defer applicationWorkspaceMenu.mu.Unlock()
	applicationWorkspaceMenu.theme = theme
}

// RefreshWorkspaceMenu rebuilds the Workspace application menu from the
// authoritative saved-workspace list without changing session layout.
func (s *WindowService) RefreshWorkspaceMenu() {
	applicationWorkspaceMenu.mu.Lock()
	apply := applicationWorkspaceMenu.apply
	theme := applicationWorkspaceMenu.theme
	applicationWorkspaceMenu.mu.Unlock()
	if apply == nil || s.stateService == nil {
		return
	}
	workspace := s.stateService.GetWorkspaceState()
	names := make([]string, 0, len(workspace.SavedWorkspaces))
	for _, saved := range workspace.SavedWorkspaces {
		names = append(names, saved.Name)
	}
	apply(theme, names, workspace.ActiveNamedWorkspace)
}

// BeginShutdown preserves persisted popout records while Wails closes native windows.
func (s *WindowService) BeginShutdown() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.shuttingDown = true
}

// CreatePopout creates a native Wails child window for one existing, unpopped pane.
func (s *WindowService) CreatePopout(paneID, popoutID string, x, y, width, height int) (models.WorkspaceState, error) {
	popout := models.PopoutWindow{ID: popoutID, PaneID: paneID, X: x, Y: y, Width: width, Height: height}
	if err := validatePopoutInput(popout); err != nil {
		return models.WorkspaceState{}, err
	}
	if s.app == nil || s.stateService == nil {
		return models.WorkspaceState{}, fmt.Errorf("popout window dependencies are unavailable")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.popouts[popoutID]; exists {
		return models.WorkspaceState{}, fmt.Errorf("popout window %q is already open", popoutID)
	}
	workspace, err := s.stateService.AddPopoutWindow(popout)
	if err != nil {
		return models.WorkspaceState{}, err
	}

	window := s.app.Window.NewWithOptions(newPopoutWindowOptions(popout, s.visuals))
	s.popouts[popoutID] = trackedPopout{paneID: paneID, window: window}
	s.observePopout(popoutID, paneID, window)
	return workspace, nil
}

// RestorePopout recreates the native window only for the exact persisted pane route.
func (s *WindowService) RestorePopout(paneID, popoutID string) error {
	if !exactPopoutID(paneID) || !exactPopoutID(popoutID) {
		return fmt.Errorf("popout route requires exact pane and popout IDs")
	}
	if s.app == nil || s.stateService == nil {
		return fmt.Errorf("popout window dependencies are unavailable")
	}
	popout, err := popoutRecordForPane(s.stateService.GetWorkspaceState(), paneID, popoutID)
	if err != nil {
		return err
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.popouts[popoutID]; exists {
		return fmt.Errorf("popout window %q is already open", popoutID)
	}
	window := s.app.Window.NewWithOptions(newPopoutWindowOptions(popout, s.visuals))
	s.popouts[popoutID] = trackedPopout{paneID: popout.PaneID, window: window}
	s.observePopout(popoutID, popout.PaneID, window)
	return nil
}

// ClosePopout closes only the native window registered for the exact pane and popout route.
func (s *WindowService) ClosePopout(paneID, popoutID string) (models.WorkspaceState, error) {
	if !exactPopoutID(paneID) || !exactPopoutID(popoutID) {
		return models.WorkspaceState{}, fmt.Errorf("popout route requires exact pane and popout IDs")
	}
	s.mu.Lock()
	tracked, exists := s.popouts[popoutID]
	if !exists {
		s.mu.Unlock()
		return models.WorkspaceState{}, fmt.Errorf("popout window %q is not open", popoutID)
	}
	if tracked.paneID != paneID {
		s.mu.Unlock()
		return models.WorkspaceState{}, fmt.Errorf("popout window %q is not open for pane %q", popoutID, paneID)
	}
	if s.stateService == nil {
		s.mu.Unlock()
		return models.WorkspaceState{}, fmt.Errorf("popout state service is unavailable")
	}
	workspace, removed, err := s.stateService.RemovePopoutWindowIfMatches(popoutID, paneID)
	if err != nil {
		s.mu.Unlock()
		return models.WorkspaceState{}, err
	}
	if !removed {
		s.mu.Unlock()
		return models.WorkspaceState{}, fmt.Errorf("popout window %q no longer matches pane %q", popoutID, paneID)
	}
	delete(s.popouts, popoutID)
	s.mu.Unlock()
	if tracked.window != nil {
		tracked.window.Close()
	}
	s.emitWorkspaceRefresh()
	return workspace, nil
}

// RejoinPopout closes the exact detached window after removing its persisted state.
func (s *WindowService) RejoinPopout(paneID, popoutID string) (models.WorkspaceState, error) {
	return s.ClosePopout(paneID, popoutID)
}

// ValidatePopoutRoute rejects a URL whose popout ID is no longer bound to the
// pane ID saved in the authoritative workspace state.
func (s *WindowService) ValidatePopoutRoute(paneID, popoutID string) error {
	if !exactPopoutID(paneID) || !exactPopoutID(popoutID) {
		return fmt.Errorf("popout route requires exact pane and popout IDs")
	}
	if s.stateService == nil {
		return fmt.Errorf("popout state service is unavailable")
	}
	_, err := popoutRecordForPane(s.stateService.GetWorkspaceState(), paneID, popoutID)
	return err
}

// RestoreNamedWorkspace restores the saved workspace first, then makes native
// popout windows match the persisted records exactly.
func (s *WindowService) RestoreNamedWorkspace(name string) (models.WorkspaceState, error) {
	if s.app == nil || s.stateService == nil {
		return models.WorkspaceState{}, fmt.Errorf("popout window dependencies are unavailable")
	}
	workspace, err := s.stateService.RestoreNamedWorkspace(name)
	if err != nil {
		return models.WorkspaceState{}, err
	}
	if err := s.ReconcilePopouts(); err != nil {
		return models.WorkspaceState{}, err
	}
	return workspace, nil
}

// ReconcilePopouts closes stale native windows and creates missing ones from
// the current persisted workspace records.
func (s *WindowService) ReconcilePopouts() error {
	if s.app == nil || s.stateService == nil {
		return fmt.Errorf("popout window dependencies are unavailable")
	}
	workspace := s.stateService.GetWorkspaceState()
	if err := workspace.Validate(); err != nil {
		return err
	}
	persisted := make(map[string]models.PopoutWindow, len(workspace.PopoutWindows))
	for _, popout := range workspace.PopoutWindows {
		persisted[popout.ID] = popout
	}

	s.mu.Lock()
	if s.shuttingDown {
		s.mu.Unlock()
		return nil
	}
	toClose := make([]*application.WebviewWindow, 0)
	for id, tracked := range s.popouts {
		popout, exists := persisted[id]
		if exists && popout.PaneID == tracked.paneID {
			delete(persisted, id)
			continue
		}
		delete(s.popouts, id)
		if tracked.window != nil {
			toClose = append(toClose, tracked.window)
		}
	}
	for id, popout := range persisted {
		window := s.app.Window.NewWithOptions(newPopoutWindowOptions(popout, s.visuals))
		s.popouts[id] = trackedPopout{paneID: popout.PaneID, window: window}
		s.observePopout(id, popout.PaneID, window)
	}
	s.mu.Unlock()
	for _, window := range toClose {
		window.Close()
	}
	return nil
}

func validatePopoutInput(popout models.PopoutWindow) error {
	if strings.TrimSpace(popout.ID) == "" || popout.ID != strings.TrimSpace(popout.ID) || strings.TrimSpace(popout.PaneID) == "" || popout.PaneID != strings.TrimSpace(popout.PaneID) || popout.Width <= 0 || popout.Height <= 0 {
		return fmt.Errorf("popout windows require exact IDs, pane IDs, and positive dimensions")
	}
	return nil
}

func exactPopoutID(value string) bool {
	return strings.TrimSpace(value) != "" && value == strings.TrimSpace(value)
}

func paneTreeContains(node models.PaneTree, paneID string) bool {
	if len(node.Children) == 0 {
		return node.PaneID == paneID
	}
	for _, child := range node.Children {
		if paneTreeContains(child, paneID) {
			return true
		}
	}
	return false
}

func restorePopoutRecord(workspace models.WorkspaceState, popoutID string) (models.PopoutWindow, error) {
	if err := workspace.Validate(); err != nil {
		return models.PopoutWindow{}, err
	}
	for _, popout := range workspace.PopoutWindows {
		if popout.ID == popoutID {
			return popout, nil
		}
	}
	return models.PopoutWindow{}, fmt.Errorf("popout window %q is not persisted", popoutID)
}

func popoutRecordForPane(workspace models.WorkspaceState, paneID, popoutID string) (models.PopoutWindow, error) {
	popout, err := restorePopoutRecord(workspace, popoutID)
	if err != nil {
		return models.PopoutWindow{}, err
	}
	if popout.PaneID != paneID {
		return models.PopoutWindow{}, fmt.Errorf("popout window %q is not persisted for pane %q", popoutID, paneID)
	}
	return popout, nil
}

func newPopoutWindowOptions(popout models.PopoutWindow, visuals WindowVisuals) application.WebviewWindowOptions {
	query := url.Values{}
	query.Set("popout", popout.PaneID)
	query.Set("id", popout.ID)
	return application.WebviewWindowOptions{
		Name:             "popout:" + popout.ID,
		Title:            visuals.Title,
		Width:            popout.Width,
		Height:           popout.Height,
		InitialPosition:  application.WindowXY,
		X:                popout.X,
		Y:                popout.Y,
		URL:              "/?" + query.Encode(),
		Mac:              visuals.Mac,
		BackgroundColour: visuals.BackgroundColour,
	}
}

func (s *WindowService) observePopout(popoutID, paneID string, window *application.WebviewWindow) {
	window.OnWindowEvent(events.Common.WindowDidMove, func(_ *application.WindowEvent) {
		s.persistPopoutGeometry(popoutID, paneID, window)
	})
	window.OnWindowEvent(events.Common.WindowDidResize, func(_ *application.WindowEvent) {
		s.persistPopoutGeometry(popoutID, paneID, window)
	})
	window.RegisterHook(events.Common.WindowClosing, func(event *application.WindowEvent) {
		if err := s.removeClosedPopout(popoutID, paneID); err != nil {
			event.Cancel()
		}
	})
}

func (s *WindowService) persistPopoutGeometry(popoutID, paneID string, window *application.WebviewWindow) {
	s.mu.Lock()
	tracked, exists := s.popouts[popoutID]
	s.mu.Unlock()
	if !exists || tracked.window != window {
		return
	}
	x, y := window.Position()
	width, height := window.Size()
	if width <= 0 || height <= 0 {
		return
	}
	_ = s.stateService.UpdatePopoutWindowGeometryForPane(popoutID, paneID, x, y, width, height)
}

func (s *WindowService) removeClosedPopout(popoutID, paneID string) error {
	s.mu.Lock()
	tracked, exists := s.popouts[popoutID]
	if !exists || tracked.paneID != paneID {
		s.mu.Unlock()
		return nil
	}
	if s.shuttingDown {
		s.mu.Unlock()
		return nil
	}
	_, _, err := s.stateService.RemovePopoutWindowIfMatches(popoutID, paneID)
	if err != nil {
		s.mu.Unlock()
		return err
	}
	delete(s.popouts, popoutID)
	s.mu.Unlock()
	if s.app != nil {
		s.app.Event.Emit("obails:popout-closed", map[string]string{"id": popoutID})
	}
	s.emitWorkspaceRefresh()
	return nil
}

func (s *WindowService) emitWorkspaceRefresh() {
	if s.app != nil {
		s.app.Event.Emit("obails:workspace-refresh")
	}
}

// Maximise maximises the main window
func (s *WindowService) Maximise() {
	if s.window != nil {
		s.window.Maximise()
	}
}

// Unmaximise restores the window from maximised state
func (s *WindowService) Unmaximise() {
	if s.window != nil {
		s.window.UnMaximise()
	}
}

// ToggleMaximise toggles between maximised and normal state
func (s *WindowService) ToggleMaximise() {
	if s.window != nil {
		s.window.ToggleMaximise()
	}
}

// IsMaximised returns whether the window is maximised
func (s *WindowService) IsMaximised() bool {
	if s.window != nil {
		return s.window.IsMaximised()
	}
	return false
}

// Fullscreen enters fullscreen mode
func (s *WindowService) Fullscreen() {
	if s.window != nil {
		s.window.Fullscreen()
	}
}

// UnFullscreen exits fullscreen mode
func (s *WindowService) UnFullscreen() {
	if s.window != nil {
		s.window.UnFullscreen()
	}
}

// ToggleFullscreen toggles fullscreen mode
func (s *WindowService) ToggleFullscreen() {
	if s.window != nil {
		if s.window.IsFullscreen() {
			s.window.UnFullscreen()
		} else {
			s.window.Fullscreen()
		}
	}
}
