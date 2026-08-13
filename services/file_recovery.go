package services

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/kazuph/obails/models"
)

const recoveryMetadataFile = "metadata.json"

type recoveryStorage struct {
	vaultPath string
	snapshots string
	recent    string
}

type recentlyDeletedStage struct {
	item        models.RecentlyDeletedItem
	staging     string
	destination string
}

// SaveRecoverySnapshot stores a complete vault copy when the configured
// interval has elapsed. The copy lives under Obails' data directory, not the
// vault being captured.
func (s *FileService) SaveRecoverySnapshot() (models.RecoverySnapshotResult, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	storage, err := s.recoveryStorage()
	if err != nil {
		return models.RecoverySnapshotResult{}, err
	}
	if err := s.pruneRecoveryStorage(storage); err != nil {
		return models.RecoverySnapshotResult{}, err
	}

	snapshots, err := s.listRecoverySnapshots(storage)
	if err != nil {
		return models.RecoverySnapshotResult{}, err
	}
	if len(snapshots) > 0 && s.recoveryTime().Sub(snapshots[0].CreatedAt) < s.configService.GetRecoverySnapshotInterval() {
		return models.RecoverySnapshotResult{Snapshot: snapshots[0]}, nil
	}

	snapshot, err := s.createRecoverySnapshot(storage)
	if err != nil {
		return models.RecoverySnapshotResult{}, err
	}
	return models.RecoverySnapshotResult{Snapshot: snapshot, Created: true}, nil
}

// ListRecoverySnapshots lists unexpired complete vault copies, newest first.
func (s *FileService) ListRecoverySnapshots() ([]models.RecoverySnapshot, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	storage, err := s.recoveryStorage()
	if err != nil {
		return nil, err
	}
	if err := s.pruneRecoveryStorage(storage); err != nil {
		return nil, err
	}
	return s.listRecoverySnapshots(storage)
}

// ReadRecoverySnapshotFile returns a stored file revision for a diff viewer.
func (s *FileService) ReadRecoverySnapshotFile(snapshotID string, relativePath string) (string, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	storage, err := s.recoveryStorage()
	if err != nil {
		return "", err
	}
	if err := s.pruneRecoveryStorage(storage); err != nil {
		return "", err
	}
	if err := validateRecoveryID(snapshotID); err != nil {
		return "", err
	}
	cleanPath, err := s.cleanRelativePath(relativePath, false)
	if err != nil {
		return "", err
	}
	contentsRoot := filepath.Join(storage.snapshots, snapshotID, "contents")
	fullPath, err := resolveContainedPath(contentsRoot, cleanPath)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(fullPath)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", fmt.Errorf("recovery snapshot path is a directory")
	}
	content, err := os.ReadFile(fullPath)
	if err != nil {
		return "", err
	}
	return string(content), nil
}

// RestoreRecoverySnapshotFile restores one stored file revision using a
// same-directory temporary file and atomic rename. Missing files are restored;
// existing regular files are replaced only after the snapshot is copied safely.
func (s *FileService) RestoreRecoverySnapshotFile(snapshotID string, relativePath string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	storage, err := s.recoveryStorage()
	if err != nil {
		return err
	}
	if err := s.pruneRecoveryStorage(storage); err != nil {
		return err
	}
	if err := validateRecoveryID(snapshotID); err != nil {
		return err
	}
	cleanPath, err := s.cleanRelativePath(relativePath, false)
	if err != nil {
		return err
	}
	snapshotPath, err := resolveContainedPath(filepath.Join(storage.snapshots, snapshotID, "contents"), cleanPath)
	if err != nil {
		return err
	}
	snapshotInfo, err := os.Lstat(snapshotPath)
	if err != nil {
		return err
	}
	if !snapshotInfo.Mode().IsRegular() {
		return ErrInvalidPath
	}
	targetPath, err := s.resolveFullPath(cleanPath, false)
	if err != nil {
		return err
	}
	if err := rejectSymlinkPath(storage.vaultPath, targetPath); err != nil {
		return err
	}
	if info, err := os.Lstat(targetPath); err == nil && !info.Mode().IsRegular() {
		return ErrInvalidPath
	} else if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return err
	}
	if err := rejectSymlinkPath(storage.vaultPath, targetPath); err != nil {
		return err
	}
	return restoreRecoveryFile(snapshotPath, targetPath, snapshotInfo.Mode().Perm())
}

// ListRecentlyDeleted lists unexpired deletion records, newest first.
func (s *FileService) ListRecentlyDeleted() ([]models.RecentlyDeletedItem, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	storage, err := s.recoveryStorage()
	if err != nil {
		return nil, err
	}
	if err := s.pruneRecoveryStorage(storage); err != nil {
		return nil, err
	}
	return s.listRecentlyDeleted(storage)
}

// RestoreRecentlyDeleted restores one deletion record without overwriting a
// file created at its original path after deletion.
func (s *FileService) RestoreRecentlyDeleted(itemID string) error {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	storage, err := s.recoveryStorage()
	if err != nil {
		return err
	}
	if err := s.pruneRecoveryStorage(storage); err != nil {
		return err
	}
	if err := validateRecoveryID(itemID); err != nil {
		return err
	}
	recordDir := filepath.Join(storage.recent, itemID)
	item, err := readRecentlyDeletedItem(recordDir)
	if err != nil {
		return err
	}
	if item.ID != itemID {
		return fmt.Errorf("recently deleted record ID does not match its storage path")
	}
	targetPath, err := s.resolveFullPath(item.Path, false)
	if err != nil {
		return err
	}
	if _, err := os.Lstat(targetPath); err == nil {
		return os.ErrExist
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}

	stage, err := os.MkdirTemp(storage.vaultPath, ".obails-recovery-item-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(stage)
	stagedPath := filepath.Join(stage, "contents")
	if _, err := copyRecoveryTree(filepath.Join(recordDir, "contents"), stagedPath, filepath.Join(recordDir, "contents")); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return err
	}
	if err := rejectSymlinkPath(storage.vaultPath, targetPath); err != nil {
		return err
	}
	var trashStage *deleteTargetStage
	if item.DeleteMode == models.DeleteModeVaultTrash {
		stagedTrash, err := s.stageVaultTrashResidue(storage.vaultPath, filepath.Join(recordDir, "contents"), item)
		if err != nil {
			return err
		}
		trashStage = stagedTrash
	}
	if _, err := os.Lstat(targetPath); err == nil {
		if trashStage != nil {
			_ = rollbackStagedDelete(*trashStage)
		}
		return os.ErrExist
	} else if !errors.Is(err, os.ErrNotExist) {
		if trashStage != nil {
			_ = rollbackStagedDelete(*trashStage)
		}
		return err
	}
	if err := os.Rename(stagedPath, targetPath); err != nil {
		if trashStage != nil {
			_ = rollbackStagedDelete(*trashStage)
		}
		return err
	}
	if trashStage != nil {
		if err := os.RemoveAll(trashStage.stagedPath); err != nil {
			return fmt.Errorf("restored recently deleted item but could not clear vault trash residue: %w", err)
		}
		if err := os.RemoveAll(trashStage.stagingDir); err != nil {
			return fmt.Errorf("restored recently deleted item but could not clear vault trash staging directory: %w", err)
		}
	}
	if err := os.RemoveAll(recordDir); err != nil {
		return fmt.Errorf("restored recently deleted item but could not clear its record: %w", err)
	}
	return nil
}

func (s *FileService) stageVaultTrashResidue(vaultPath string, recoveryContents string, item models.RecentlyDeletedItem) (*deleteTargetStage, error) {
	trashPath := filepath.ToSlash(filepath.Join(".trash", filepath.FromSlash(item.Path)))
	fullPath, err := s.resolveFullPath(trashPath, false)
	if err != nil {
		return nil, err
	}
	if err := rejectSymlinkPath(vaultPath, fullPath); err != nil {
		return nil, err
	}
	if _, err := os.Lstat(fullPath); errors.Is(err, os.ErrNotExist) {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	equal, err := recoveryTreesEqual(recoveryContents, fullPath)
	if err != nil {
		return nil, err
	}
	if !equal {
		return nil, fmt.Errorf("vault trash residue no longer matches the recovery record")
	}
	stage, err := stageDeleteTarget(fullPath)
	if err != nil {
		return nil, err
	}
	return &stage, nil
}

func recoveryTreesEqual(expectedPath string, actualPath string) (bool, error) {
	expectedInfo, err := os.Lstat(expectedPath)
	if err != nil {
		return false, err
	}
	actualInfo, err := os.Lstat(actualPath)
	if err != nil {
		return false, err
	}
	if expectedInfo.Mode()&os.ModeSymlink != 0 || actualInfo.Mode()&os.ModeSymlink != 0 {
		return false, ErrInvalidPath
	}
	if expectedInfo.IsDir() != actualInfo.IsDir() {
		return false, nil
	}
	if expectedInfo.IsDir() {
		expectedEntries, err := os.ReadDir(expectedPath)
		if err != nil {
			return false, err
		}
		actualEntries, err := os.ReadDir(actualPath)
		if err != nil {
			return false, err
		}
		if len(expectedEntries) != len(actualEntries) {
			return false, nil
		}
		for index, expectedEntry := range expectedEntries {
			if expectedEntry.Name() != actualEntries[index].Name() {
				return false, nil
			}
			equal, err := recoveryTreesEqual(filepath.Join(expectedPath, expectedEntry.Name()), filepath.Join(actualPath, actualEntries[index].Name()))
			if err != nil || !equal {
				return equal, err
			}
		}
		return true, nil
	}
	if !expectedInfo.Mode().IsRegular() || !actualInfo.Mode().IsRegular() {
		return false, ErrInvalidPath
	}
	expectedContent, err := os.ReadFile(expectedPath)
	if err != nil {
		return false, err
	}
	actualContent, err := os.ReadFile(actualPath)
	if err != nil {
		return false, err
	}
	return bytes.Equal(expectedContent, actualContent), nil
}

func (s *FileService) stageRecentlyDeleted(relativePath string, sourcePath string, mode models.DeleteMode) (recentlyDeletedStage, error) {
	storage, err := s.recoveryStorage()
	if err != nil {
		return recentlyDeletedStage{}, err
	}
	if err := s.pruneRecoveryStorage(storage); err != nil {
		return recentlyDeletedStage{}, err
	}
	cleanPath, err := s.cleanRelativePath(relativePath, false)
	if err != nil {
		return recentlyDeletedStage{}, err
	}
	info, err := os.Lstat(sourcePath)
	if err != nil {
		return recentlyDeletedStage{}, err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return recentlyDeletedStage{}, ErrInvalidPath
	}

	createdAt := s.recoveryTime()
	id, err := newRecoveryID(createdAt)
	if err != nil {
		return recentlyDeletedStage{}, err
	}
	item := models.RecentlyDeletedItem{
		ID:         id,
		Path:       cleanPath,
		IsDir:      info.IsDir(),
		DeletedAt:  createdAt,
		DeleteMode: mode,
	}
	staging := filepath.Join(storage.recent, ".staging-"+item.ID)
	destination := filepath.Join(storage.recent, item.ID)
	if err := os.Mkdir(staging, 0700); err != nil {
		return recentlyDeletedStage{}, err
	}
	success := false
	defer func() {
		if !success {
			_ = os.RemoveAll(staging)
		}
	}()
	if _, err := copyRecoveryTree(sourcePath, filepath.Join(staging, "contents"), storage.vaultPath); err != nil {
		return recentlyDeletedStage{}, err
	}
	if err := writeRecoveryJSON(filepath.Join(staging, recoveryMetadataFile), item); err != nil {
		return recentlyDeletedStage{}, err
	}
	success = true
	return recentlyDeletedStage{item: item, staging: staging, destination: destination}, nil
}

func (s *FileService) finalizeRecentlyDeleted(stage recentlyDeletedStage) error {
	if _, err := os.Lstat(stage.destination); err == nil {
		return os.ErrExist
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return os.Rename(stage.staging, stage.destination)
}

func (s *FileService) recoveryStorage() (recoveryStorage, error) {
	dataDir, err := s.configService.GetRecoveryDataDir()
	if err != nil {
		return recoveryStorage{}, err
	}
	vaultPath, err := filepath.EvalSymlinks(s.configService.GetVaultPath())
	if err != nil {
		return recoveryStorage{}, err
	}
	vaultPath, err = filepath.Abs(vaultPath)
	if err != nil {
		return recoveryStorage{}, err
	}
	hash := sha256.Sum256([]byte(vaultPath))
	root := filepath.Join(dataDir, "file-recovery", hex.EncodeToString(hash[:]))
	storage := recoveryStorage{
		vaultPath: vaultPath,
		snapshots: filepath.Join(root, "snapshots"),
		recent:    filepath.Join(root, "recently-deleted"),
	}
	for _, path := range []string{storage.snapshots, storage.recent} {
		if err := os.MkdirAll(path, 0700); err != nil {
			return recoveryStorage{}, err
		}
	}
	return storage, nil
}

func (s *FileService) createRecoverySnapshot(storage recoveryStorage) (models.RecoverySnapshot, error) {
	createdAt := s.recoveryTime()
	id, err := newRecoveryID(createdAt)
	if err != nil {
		return models.RecoverySnapshot{}, err
	}
	snapshot := models.RecoverySnapshot{ID: id, CreatedAt: createdAt}
	staging := filepath.Join(storage.snapshots, ".staging-"+snapshot.ID)
	destination := filepath.Join(storage.snapshots, snapshot.ID)
	if err := os.Mkdir(staging, 0700); err != nil {
		return models.RecoverySnapshot{}, err
	}
	success := false
	defer func() {
		if !success {
			_ = os.RemoveAll(staging)
		}
	}()
	fileCount, err := copyRecoveryTree(storage.vaultPath, filepath.Join(staging, "contents"), storage.vaultPath)
	if err != nil {
		return models.RecoverySnapshot{}, err
	}
	snapshot.FileCount = fileCount
	if err := writeRecoveryJSON(filepath.Join(staging, recoveryMetadataFile), snapshot); err != nil {
		return models.RecoverySnapshot{}, err
	}
	if _, err := os.Lstat(destination); err == nil {
		return models.RecoverySnapshot{}, os.ErrExist
	} else if !errors.Is(err, os.ErrNotExist) {
		return models.RecoverySnapshot{}, err
	}
	if err := os.Rename(staging, destination); err != nil {
		return models.RecoverySnapshot{}, err
	}
	success = true
	return snapshot, nil
}

func (s *FileService) listRecoverySnapshots(storage recoveryStorage) ([]models.RecoverySnapshot, error) {
	entries, err := os.ReadDir(storage.snapshots)
	if err != nil {
		return nil, err
	}
	snapshots := make([]models.RecoverySnapshot, 0, len(entries))
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		if !entry.IsDir() {
			return nil, fmt.Errorf("invalid recovery snapshot storage entry %q", entry.Name())
		}
		snapshot, err := readRecoverySnapshot(filepath.Join(storage.snapshots, entry.Name()))
		if err != nil {
			return nil, err
		}
		if snapshot.ID != entry.Name() {
			return nil, fmt.Errorf("recovery snapshot ID does not match its storage path")
		}
		snapshots = append(snapshots, snapshot)
	}
	sort.Slice(snapshots, func(i, j int) bool { return snapshots[i].CreatedAt.After(snapshots[j].CreatedAt) })
	return snapshots, nil
}

func (s *FileService) listRecentlyDeleted(storage recoveryStorage) ([]models.RecentlyDeletedItem, error) {
	entries, err := os.ReadDir(storage.recent)
	if err != nil {
		return nil, err
	}
	items := make([]models.RecentlyDeletedItem, 0, len(entries))
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") {
			continue
		}
		if !entry.IsDir() {
			return nil, fmt.Errorf("invalid recently deleted storage entry %q", entry.Name())
		}
		item, err := readRecentlyDeletedItem(filepath.Join(storage.recent, entry.Name()))
		if err != nil {
			return nil, err
		}
		if item.ID != entry.Name() {
			return nil, fmt.Errorf("recently deleted record ID does not match its storage path")
		}
		items = append(items, item)
	}
	sort.Slice(items, func(i, j int) bool { return items[i].DeletedAt.After(items[j].DeletedAt) })
	return items, nil
}

func (s *FileService) pruneRecoveryStorage(storage recoveryStorage) error {
	deadline := s.recoveryTime().Add(-s.configService.GetRecoveryRetention())
	for _, root := range []string{storage.snapshots, storage.recent} {
		entries, err := os.ReadDir(root)
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if strings.HasPrefix(entry.Name(), ".") {
				continue
			}
			if !entry.IsDir() {
				return fmt.Errorf("invalid recovery storage entry %q", entry.Name())
			}
			entryPath := filepath.Join(root, entry.Name())
			var createdAt time.Time
			if root == storage.snapshots {
				snapshot, err := readRecoverySnapshot(entryPath)
				if err != nil {
					return err
				}
				createdAt = snapshot.CreatedAt
			} else {
				item, err := readRecentlyDeletedItem(entryPath)
				if err != nil {
					return err
				}
				createdAt = item.DeletedAt
			}
			if createdAt.Before(deadline) {
				if err := os.RemoveAll(entryPath); err != nil {
					return err
				}
			}
		}
	}
	return nil
}

func (s *FileService) recoveryTime() time.Time {
	return time.Now().UTC()
}

func readRecoverySnapshot(path string) (models.RecoverySnapshot, error) {
	var snapshot models.RecoverySnapshot
	if err := readRecoveryJSON(filepath.Join(path, recoveryMetadataFile), &snapshot); err != nil {
		return models.RecoverySnapshot{}, err
	}
	return snapshot, nil
}

func readRecentlyDeletedItem(path string) (models.RecentlyDeletedItem, error) {
	var item models.RecentlyDeletedItem
	if err := readRecoveryJSON(filepath.Join(path, recoveryMetadataFile), &item); err != nil {
		return models.RecentlyDeletedItem{}, err
	}
	return item, nil
}

func writeRecoveryJSON(path string, value any) error {
	content, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return os.WriteFile(path, content, 0600)
}

func readRecoveryJSON(path string, value any) error {
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(content, value); err != nil {
		return fmt.Errorf("invalid recovery metadata: %w", err)
	}
	return nil
}

func copyRecoveryTree(sourcePath string, destinationPath string, containmentRoot string) (int, error) {
	root, err := filepath.EvalSymlinks(containmentRoot)
	if err != nil {
		return 0, err
	}
	count := 0
	err = filepath.WalkDir(sourcePath, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		relativePath, err := filepath.Rel(sourcePath, path)
		if err != nil || relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) {
			return ErrInvalidPath
		}
		destination := destinationPath
		if relativePath != "." {
			destination = filepath.Join(destinationPath, relativePath)
		}
		info, err := os.Lstat(path)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return ErrInvalidPath
		}
		realPath, err := filepath.EvalSymlinks(path)
		if err != nil || !isWithinVault(root, realPath) {
			return ErrInvalidPath
		}
		if info.IsDir() {
			return os.MkdirAll(destination, info.Mode().Perm())
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("unsupported recovery file type %q", path)
		}
		if err := copyRecoveryFile(path, destination, info.Mode().Perm()); err != nil {
			return err
		}
		count++
		return nil
	})
	if err != nil {
		return 0, err
	}
	return count, nil
}

func copyRecoveryFile(sourcePath string, destinationPath string, mode os.FileMode) error {
	source, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer source.Close()
	if err := os.MkdirAll(filepath.Dir(destinationPath), 0700); err != nil {
		return err
	}
	destination, err := os.OpenFile(destinationPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(destination, source)
	closeErr := destination.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func restoreRecoveryFile(sourcePath string, destinationPath string, mode os.FileMode) error {
	source, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer source.Close()

	temporary, err := os.CreateTemp(filepath.Dir(destinationPath), ".obails-recovery-")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	success := false
	defer func() {
		if !success {
			_ = os.Remove(temporaryPath)
		}
	}()
	if err := temporary.Chmod(mode); err != nil {
		temporary.Close()
		return err
	}
	if _, err := io.Copy(temporary, source); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if err := os.Rename(temporaryPath, destinationPath); err != nil {
		return err
	}
	success = true
	return nil
}

func resolveContainedPath(root string, relativePath string) (string, error) {
	realRoot, err := filepath.EvalSymlinks(root)
	if err != nil {
		return "", err
	}
	fullPath := filepath.Join(realRoot, filepath.FromSlash(relativePath))
	if err := ensurePathWithinVault(realRoot, fullPath); err != nil {
		return "", err
	}
	return fullPath, nil
}

func rejectSymlinkPath(root string, path string) error {
	relativePath, err := filepath.Rel(root, path)
	if err != nil || relativePath == ".." || strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) {
		return ErrInvalidPath
	}
	for current := root; ; current = filepath.Join(current, strings.Split(relativePath, string(filepath.Separator))[0]) {
		info, err := os.Lstat(current)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil
			}
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return ErrInvalidPath
		}
		if current == path {
			return nil
		}
		relativePath, err = filepath.Rel(current, path)
		if err != nil {
			return ErrInvalidPath
		}
	}
}

func newRecoveryID(now time.Time) (string, error) {
	randomBytes := make([]byte, 8)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("generate recovery ID: %w", err)
	}
	return now.UTC().Format("20060102T150405.000000000Z") + "-" + hex.EncodeToString(randomBytes), nil
}

func validateRecoveryID(id string) error {
	if id == "" || filepath.Base(id) != id || strings.HasPrefix(id, ".") {
		return ErrInvalidPath
	}
	return nil
}
