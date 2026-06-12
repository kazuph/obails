//go:build cli

package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var moveCmd = &cobra.Command{
	Use:   "move [file=<name>|path=<path>] to=<folder/newname>",
	Short: "Move or rename a note",
	Long: `Move or rename a note within the vault.

Examples:
  ob move file=MyNote to=Archive/MyNote
  ob move path=folder/old.md to=folder/new.md
  ob move file=MyNote to=RenamedNote`,
	Args: cobra.ArbitraryArgs,
	RunE: runMove,
}

func init() {
	moveCmd.Flags().String("file", "", "Note name (resolved via wiki-link)")
	moveCmd.Flags().String("path", "", "Relative path to the note")
	moveCmd.Flags().String("to", "", "Destination path within the vault")
	moveCmd.Flags().String("silent", "false", "Suppress output (true/false)")

	rootCmd.AddCommand(moveCmd)
}

func runMove(cmd *cobra.Command, args []string) error {
	if err := initServices(); err != nil {
		outputError(err)
		return nil
	}

	file, _ := cmd.Flags().GetString("file")
	path, _ := cmd.Flags().GetString("path")
	to, _ := cmd.Flags().GetString("to")
	silentStr, _ := cmd.Flags().GetString("silent")
	silent := silentStr == "true"

	sourcePath, err := resolveFilePath(file, path)
	if err != nil {
		outputError(err)
		return nil
	}

	destPath, err := normalizeMoveDestination(sourcePath, to)
	if err != nil {
		outputError(err)
		return nil
	}

	if err := fileService.MoveFile(sourcePath, destPath); err != nil {
		outputError(fmt.Errorf("failed to move file: %w", err))
		return nil
	}

	updateLastOpenedFile(destPath)

	if !silent {
		result := map[string]any{
			"from":  sourcePath,
			"to":    destPath,
			"moved": true,
		}
		outputResult(result, fmt.Sprintf("Moved: %s -> %s", sourcePath, destPath))
	}

	return nil
}

func normalizeMoveDestination(sourcePath, destPath string) (string, error) {
	destPath = strings.TrimSpace(destPath)
	if destPath == "" {
		return "", fmt.Errorf("to is required: use to=<folder/newname>")
	}

	cleanDest := filepath.ToSlash(filepath.Clean(filepath.FromSlash(destPath)))
	if cleanDest == "." {
		return "", fmt.Errorf("to is required: use to=<folder/newname>")
	}

	if strings.HasSuffix(sourcePath, ".md") && filepath.Ext(cleanDest) == "" {
		cleanDest += ".md"
	}

	return cleanDest, nil
}
