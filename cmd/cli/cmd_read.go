//go:build cli

package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/kazuph/obails/services"
	"github.com/spf13/cobra"
)

var readCmd = &cobra.Command{
	Use:   "read [file=<name>|path=<path>]",
	Short: "Read a note from the vault",
	Long: `Read a note and output its content.

Use file= for wiki-link style resolution (searches by name),
or path= for a direct vault-relative path.

Optionally use --section to extract a specific section.`,
	Args: cobra.ArbitraryArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := initServices(); err != nil {
			outputError(err)
			return nil
		}

		file, _ := cmd.Flags().GetString("file")
		path, _ := cmd.Flags().GetString("path")
		sectionFlag, _ := cmd.Flags().GetString("section")

		relativePath, err := resolveFilePath(file, path)
		if err != nil {
			outputError(err)
			return nil
		}

		content, err := fileService.ReadFile(relativePath)
		if err != nil {
			outputError(fmt.Errorf("failed to read file: %w", err))
			return nil
		}

		// Extract section if specified
		if sectionFlag != "" {
			ss := services.NewSectionService()
			sectionContent, err := ss.ExtractSection(content, sectionFlag)
			if err != nil {
				outputError(fmt.Errorf("failed to extract section: %w", err))
				return nil
			}
			content = sectionContent
		}

		title := extractTitleFromContent(content, relativePath)

		result := map[string]any{
			"path":    relativePath,
			"title":   title,
			"content": content,
		}

		outputResult(result, content)
		return nil
	},
}

func init() {
	readCmd.Flags().String("file", "", "Note name (wiki-link style resolution)")
	readCmd.Flags().String("path", "", "Vault-relative file path")
	readCmd.Flags().String("section", "", "Extract a specific section (e.g. \"## Heading\")")

	rootCmd.AddCommand(readCmd)
}

// extractTitleFromContent extracts the title from markdown content.
// It looks for the first # heading; falls back to filename.
func extractTitleFromContent(content string, path string) string {
	lines := strings.Split(content, "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "# ") {
			return strings.TrimPrefix(trimmed, "# ")
		}
	}
	return strings.TrimSuffix(filepath.Base(path), ".md")
}
