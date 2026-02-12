//go:build cli

package main

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

// HeadingInfo represents a single heading extracted from markdown.
type HeadingInfo struct {
	Level int    `json:"level"`
	Text  string `json:"text"`
}

var outlineCmd = &cobra.Command{
	Use:   "outline [file=<name>|path=<path>]",
	Short: "Extract headings from a note",
	Long: `Extract all headings (# through ######) from a note.

Outline styles:
  style=tree (default): Indented tree view
  style=md: Markdown list

Use the total flag to output only the heading count.`,
	Args: cobra.ArbitraryArgs,
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := initServices(); err != nil {
			outputError(err)
			return nil
		}

		file, _ := cmd.Flags().GetString("file")
		path, _ := cmd.Flags().GetString("path")

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

		headings := extractHeadings(content)

		totalFlag, _ := cmd.Flags().GetBool("total")
		if totalFlag {
			result := map[string]any{
				"path":  relativePath,
				"total": len(headings),
			}
			outputResult(result, fmt.Sprintf("%d", len(headings)))
			return nil
		}

		styleFlag, _ := cmd.Flags().GetString("style")

		switch styleFlag {
		case "md":
			text := formatHeadingsMD(headings)
			result := map[string]any{
				"path":     relativePath,
				"headings": headings,
			}
			outputResult(result, text)

		default: // "tree"
			text := formatHeadingsTree(headings)
			result := map[string]any{
				"path":     relativePath,
				"headings": headings,
			}
			outputResult(result, text)
		}

		return nil
	},
}

func init() {
	outlineCmd.Flags().String("file", "", "Note name (wiki-link style resolution)")
	outlineCmd.Flags().String("path", "", "Vault-relative file path")
	outlineCmd.Flags().String("style", "tree", "Outline style: tree or md")
	outlineCmd.Flags().Bool("total", false, "Output only the heading count")

	rootCmd.AddCommand(outlineCmd)
}

// extractHeadings parses markdown content and returns all headings.
func extractHeadings(content string) []HeadingInfo {
	var headings []HeadingInfo
	lines := strings.Split(content, "\n")

	inCodeBlock := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// Track code blocks
		if strings.HasPrefix(trimmed, "```") {
			inCodeBlock = !inCodeBlock
			continue
		}
		if inCodeBlock {
			continue
		}

		if !strings.HasPrefix(trimmed, "#") {
			continue
		}

		level := 0
		for _, ch := range trimmed {
			if ch == '#' {
				level++
			} else {
				break
			}
		}

		// Must have a space after the #s
		if level > 0 && level <= 6 && level < len(trimmed) && trimmed[level] == ' ' {
			text := strings.TrimSpace(trimmed[level+1:])
			headings = append(headings, HeadingInfo{
				Level: level,
				Text:  text,
			})
		}
	}

	return headings
}

// formatHeadingsTree formats headings as an indented tree.
func formatHeadingsTree(headings []HeadingInfo) string {
	if len(headings) == 0 {
		return "(no headings)"
	}

	var lines []string
	for _, h := range headings {
		indent := strings.Repeat("  ", h.Level-1)
		lines = append(lines, fmt.Sprintf("%s%s", indent, h.Text))
	}
	return strings.Join(lines, "\n")
}

// formatHeadingsMD formats headings as a markdown list.
func formatHeadingsMD(headings []HeadingInfo) string {
	if len(headings) == 0 {
		return "(no headings)"
	}

	var lines []string
	for _, h := range headings {
		indent := strings.Repeat("  ", h.Level-1)
		lines = append(lines, fmt.Sprintf("%s- %s", indent, h.Text))
	}
	return strings.Join(lines, "\n")
}
