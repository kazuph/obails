//go:build cli

package main

import (
	"fmt"
	"os/exec"

	"github.com/spf13/cobra"
)

var openCmd = &cobra.Command{
	Use:   "open [file=<name>|path=<path>]",
	Short: "Open a note in the Obails app",
	Long: `Open the Obails desktop app and navigate to a specific note.
Updates the vault state so the app opens the specified file on launch.

Examples:
  ob open file="MyNote"
  ob open path="02_dailynotes/2026-01-15.md"
  ob open                    # Just launch the app`,
	Args: cobra.ArbitraryArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := initServices(); err != nil {
			outputError(err)
			return nil
		}

		file, _ := cmd.Flags().GetString("file")
		path, _ := cmd.Flags().GetString("path")

		// If file or path specified, update state
		if file != "" || path != "" {
			relativePath, err := resolveFilePath(file, path)
			if err != nil {
				outputError(err)
				return nil
			}
			updateLastOpenedFile(relativePath)
		}

		// Launch the app
		if err := exec.Command("open", "-a", "Obails").Start(); err != nil {
			outputError(fmt.Errorf("failed to launch obails app: %w", err))
			return nil
		}

		if file != "" || path != "" {
			relativePath, _ := resolveFilePath(file, path)
			result := map[string]any{
				"opened": true,
				"path":   relativePath,
			}
			outputResult(result, fmt.Sprintf("Opening: %s", relativePath))
		} else {
			result := map[string]any{
				"opened": true,
			}
			outputResult(result, "Obails app launched")
		}

		return nil
	},
}

func init() {
	openCmd.Flags().String("file", "", "Note name (wiki-link style resolution)")
	openCmd.Flags().String("path", "", "Vault-relative file path")

	rootCmd.AddCommand(openCmd)
}
