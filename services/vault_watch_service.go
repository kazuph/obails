package services

import (
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/fsnotify/fsnotify"
)

// VaultWatchService tracks external changes inside the configured vault.
type VaultWatchService struct {
	configService *ConfigService
	watcher       *fsnotify.Watcher
	watchedDirs   map[string]struct{}
	currentVault  string
	mu            sync.Mutex
	revision      atomic.Int64
}

// NewVaultWatchService creates a watcher for vault changes.
func NewVaultWatchService(configService *ConfigService) *VaultWatchService {
	return &VaultWatchService{
		configService: configService,
		watchedDirs:   make(map[string]struct{}),
	}
}

// Start begins watching the current vault.
func (s *VaultWatchService) Start() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.watcher != nil {
		return nil
	}

	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		return err
	}

	s.watcher = watcher
	if err := s.refreshWatchesLocked(); err != nil {
		_ = watcher.Close()
		s.watcher = nil
		return err
	}

	go s.watchLoop(watcher)
	return nil
}

// Stop ends watch processing.
func (s *VaultWatchService) Stop() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.watcher == nil {
		return nil
	}

	err := s.watcher.Close()
	s.watcher = nil
	s.watchedDirs = make(map[string]struct{})
	return err
}

// GetRevision returns a monotonically increasing change counter.
func (s *VaultWatchService) GetRevision() int64 {
	_ = s.refreshWatches()
	return s.revision.Load()
}

func (s *VaultWatchService) watchLoop(watcher *fsnotify.Watcher) {
	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			if s.shouldIgnoreEvent(event.Name) {
				continue
			}
			s.revision.Add(1)
			if event.Has(fsnotify.Create) || event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
				if err := s.refreshWatches(); err != nil {
					log.Printf("Warning: Failed to refresh vault watches: %v", err)
				}
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("Warning: Vault watcher error: %v", err)
		}
	}
}

func (s *VaultWatchService) refreshWatches() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.refreshWatchesLocked()
}

func (s *VaultWatchService) refreshWatchesLocked() error {
	if s.watcher == nil {
		return nil
	}

	vaultPath := s.configService.GetVaultPath()
	if strings.TrimSpace(vaultPath) == "" {
		s.currentVault = ""
		for path := range s.watchedDirs {
			_ = s.watcher.Remove(path)
			delete(s.watchedDirs, path)
		}
		return nil
	}

	cleanVaultPath := filepath.Clean(vaultPath)
	if s.currentVault != "" && s.currentVault != cleanVaultPath {
		for path := range s.watchedDirs {
			_ = s.watcher.Remove(path)
			delete(s.watchedDirs, path)
		}
	}
	s.currentVault = cleanVaultPath

	currentDirs := make(map[string]struct{})
	err := filepath.WalkDir(cleanVaultPath, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if !d.IsDir() {
			return nil
		}
		if path != cleanVaultPath && s.shouldIgnoreEvent(path) {
			return filepath.SkipDir
		}
		currentDirs[path] = struct{}{}
		if _, exists := s.watchedDirs[path]; exists {
			return nil
		}
		if err := s.watcher.Add(path); err != nil && !os.IsNotExist(err) {
			return err
		}
		s.watchedDirs[path] = struct{}{}
		return nil
	})
	if err != nil {
		return err
	}

	for path := range s.watchedDirs {
		if _, exists := currentDirs[path]; exists {
			continue
		}
		_ = s.watcher.Remove(path)
		delete(s.watchedDirs, path)
	}

	return nil
}

func (s *VaultWatchService) shouldIgnoreEvent(path string) bool {
	vaultPath := s.configService.GetVaultPath()
	if strings.TrimSpace(vaultPath) == "" {
		return true
	}

	relPath, err := filepath.Rel(vaultPath, path)
	if err != nil {
		return true
	}
	if relPath == "." {
		return false
	}

	for _, part := range strings.Split(filepath.ToSlash(relPath), "/") {
		if strings.HasPrefix(part, ".") {
			return true
		}
	}
	return false
}
