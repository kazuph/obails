//go:build cli

package main

import (
	"fmt"

	"github.com/spf13/cobra"
)

var deleteCmd = &cobra.Command{
	Use:   "delete [file=<name>|path=<path>]",
	Short: "Delete a note",
	Long: `Delete a note from the vault.

By default, the file is moved to the macOS Trash. Use --force to permanently
delete it.

Examples:
  ob delete file=MyNote
  ob delete path=folder/note.md
  ob delete file=MyNote --force`,
	Args: cobra.ArbitraryArgs,
	RunE: runDelete,
}

func init() {
	deleteCmd.Flags().String("file", "", "Note name (resolved via wiki-link)")
	deleteCmd.Flags().String("path", "", "Relative path to the note")
	deleteCmd.Flags().Bool("force", false, "Permanently delete instead of moving to Trash")
	deleteCmd.Flags().String("silent", "false", "Suppress output (true/false)")

	rootCmd.AddCommand(deleteCmd)
}

func runDelete(cmd *cobra.Command, args []string) error {
	if err := initServices(); err != nil {
		outputError(err)
		return nil
	}

	file, _ := cmd.Flags().GetString("file")
	path, _ := cmd.Flags().GetString("path")
	force, _ := cmd.Flags().GetBool("force")
	silentStr, _ := cmd.Flags().GetString("silent")
	silent := silentStr == "true"

	relativePath, err := resolveFilePath(file, path)
	if err != nil {
		outputError(err)
		return nil
	}

	if force {
		err = fileService.DeletePath(relativePath)
	} else {
		err = fileService.TrashPath(relativePath)
	}
	if err != nil {
		outputError(fmt.Errorf("failed to delete file: %w", err))
		return nil
	}

	if !silent {
		result := map[string]any{
			"path":      relativePath,
			"deleted":   true,
			"permanent": force,
			"trashed":   !force,
		}
		if force {
			outputResult(result, fmt.Sprintf("Deleted permanently: %s", relativePath))
		} else {
			outputResult(result, fmt.Sprintf("Moved to Trash: %s", relativePath))
		}
	}

	return nil
}
