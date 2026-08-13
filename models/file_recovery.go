package models

import "time"

const (
	DefaultRecoverySnapshotIntervalMinutes = 5
	DefaultRecoveryRetentionDays           = 7
	MinimumRecoveryRetentionDays           = 1
)

// FileRecoveryConfig controls vault snapshots and the recently deleted list.
type FileRecoveryConfig struct {
	SnapshotIntervalMinutes int `toml:"snapshot_interval_minutes"`
	RetentionDays           int `toml:"retention_days"`
}

// RecoverySnapshot describes one complete vault copy stored outside the vault.
type RecoverySnapshot struct {
	ID        string    `json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	FileCount int       `json:"fileCount"`
}

// RecoverySnapshotResult reports whether a periodic snapshot was due.
type RecoverySnapshotResult struct {
	Snapshot RecoverySnapshot `json:"snapshot"`
	Created  bool             `json:"created"`
}

// RecentlyDeletedItem is a restorable copy made before a configured deletion.
type RecentlyDeletedItem struct {
	ID         string     `json:"id"`
	Path       string     `json:"path"`
	IsDir      bool       `json:"isDir"`
	DeletedAt  time.Time  `json:"deletedAt"`
	DeleteMode DeleteMode `json:"deleteMode"`
}
