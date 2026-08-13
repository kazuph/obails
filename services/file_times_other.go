//go:build !darwin

package services

import (
	"os"
	"time"
)

// Filesystems without a portable creation timestamp use their metadata time.
func creationTime(info os.FileInfo) time.Time {
	return info.ModTime()
}
