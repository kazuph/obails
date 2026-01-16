package services

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

// WindowService handles window operations
type WindowService struct {
	window *application.WebviewWindow
}

// NewWindowService creates a new WindowService
func NewWindowService() *WindowService {
	return &WindowService{}
}

// SetWindow sets the window reference (called after window creation)
func (s *WindowService) SetWindow(window *application.WebviewWindow) {
	s.window = window
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
