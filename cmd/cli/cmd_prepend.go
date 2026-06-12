//go:build cli

package main

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

var prependCmd = &cobra.Command{
	Use:   "prepend",
	Short: "Prepend content to a note",
	Long: `Prepend content to the beginning of a note. If the note has frontmatter
(YAML between --- delimiters), the content is inserted after the frontmatter.
Otherwise it is inserted at the very beginning.

Examples:
  ob prepend file=MyNote content="Important notice"
  ob prepend path=folder/note.md content="Top of file"
  ob prepend file=MyNote content="inline" inline=true`,
	RunE: runPrepend,
}

func init() {
	prependCmd.Flags().String("file", "", "Note name (resolved via wiki-link)")
	prependCmd.Flags().String("path", "", "Relative path to the note")
	addContentFlags(prependCmd)
	prependCmd.Flags().String("inline", "false", "Prepend without newline (true/false)")
	prependCmd.Flags().String("silent", "false", "Suppress output (true/false)")

	rootCmd.AddCommand(prependCmd)
}

func runPrepend(cmd *cobra.Command, args []string) error {
	if err := initServices(); err != nil {
		outputError(err)
		return nil
	}

	file, _ := cmd.Flags().GetString("file")
	path, _ := cmd.Flags().GetString("path")
	content, contentErr := resolveContent(cmd)
	if contentErr != nil {
		outputError(contentErr)
		return nil
	}
	inlineStr, _ := cmd.Flags().GetString("inline")
	silentStr, _ := cmd.Flags().GetString("silent")

	inline := inlineStr == "true"
	silent := silentStr == "true"

	if content == "" {
		outputError(fmt.Errorf("content is required: use content=<text> or content-file=<path|->"))
		return nil
	}

	// Resolve file path
	relativePath, err := resolveFilePath(file, path)
	if err != nil {
		outputError(err)
		return nil
	}

	// Read existing content
	existing, err := fileService.ReadFile(relativePath)
	if err != nil {
		outputError(fmt.Errorf("failed to read file: %w", err))
		return nil
	}

	// Prepend content, respecting frontmatter
	newContent := prependToContent(existing, content, inline)

	// Write back
	if err := fileService.WriteFile(relativePath, newContent); err != nil {
		outputError(fmt.Errorf("failed to write file: %w", err))
		return nil
	}

	updateLastOpenedFile(relativePath)

	if !silent {
		result := map[string]any{
			"path":      relativePath,
			"prepended": true,
		}
		outputResult(result, fmt.Sprintf("Prepended to: %s", relativePath))
	}

	return nil
}

// prependToContent inserts content at the beginning of the file, respecting frontmatter.
// If the file starts with "---\n", we find the closing "---" and insert after it.
func prependToContent(existing, content string, inline bool) string {
	lines := strings.Split(existing, "\n")

	// Check for frontmatter
	fmEnd := findFrontmatterEnd(lines)

	if fmEnd >= 0 {
		// Insert after frontmatter
		var result []string
		result = append(result, lines[:fmEnd+1]...)
		if inline {
			if fmEnd+1 < len(lines) {
				// Prepend inline to the line after frontmatter
				result = append(result, content+lines[fmEnd+1])
				result = append(result, lines[fmEnd+2:]...)
			} else {
				result = append(result, content)
			}
		} else {
			result = append(result, content)
			result = append(result, lines[fmEnd+1:]...)
		}
		return strings.Join(result, "\n")
	}

	// No frontmatter - insert at beginning
	if inline {
		return content + existing
	}
	if existing == "" {
		return content + "\n"
	}
	return content + "\n" + existing
}

// findFrontmatterEnd returns the line index of the closing "---" of frontmatter,
// or -1 if there is no frontmatter.
// Frontmatter must start at line 0 with "---" and end with another "---".
func findFrontmatterEnd(lines []string) int {
	if len(lines) < 2 {
		return -1
	}

	// First line must be "---"
	if strings.TrimSpace(lines[0]) != "---" {
		return -1
	}

	// Find the closing "---"
	for i := 1; i < len(lines); i++ {
		if strings.TrimSpace(lines[i]) == "---" {
			return i
		}
	}

	return -1
}
