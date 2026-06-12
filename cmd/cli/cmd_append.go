//go:build cli

package main

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

var appendCmd = &cobra.Command{
	Use:   "append",
	Short: "Append content to a note",
	Long: `Append content to an existing note. By default appends to the end of the file.

With section= specified, appends at the end of that section (before the next
heading of the same or higher level).

Examples:
  ob append file=MyNote content="New paragraph"
  ob append file=MyNote --content-file paragraph.md
  cat paragraph.md | ob append file=MyNote --content-file -
  ob append path=folder/note.md content="Added text"
  ob append file=MyNote content="Section content" section="## Notes"
  ob append file=MyNote content="inline text" inline=true`,
	RunE: runAppend,
}

func init() {
	appendCmd.Flags().String("file", "", "Note name (resolved via wiki-link)")
	appendCmd.Flags().String("path", "", "Relative path to the note")
	addContentFlags(appendCmd)
	appendCmd.Flags().String("section", "", "Section heading to append to")
	appendCmd.Flags().String("inline", "false", "Append without newline (true/false)")
	appendCmd.Flags().String("silent", "false", "Suppress output (true/false)")

	rootCmd.AddCommand(appendCmd)
}

func runAppend(cmd *cobra.Command, args []string) error {
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
	section, _ := cmd.Flags().GetString("section")
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

	// Build new content
	var newContent string
	if section != "" {
		newContent = appendToSection(existing, section, content)
	} else {
		if inline {
			newContent = existing + content
		} else {
			// Ensure file ends with newline before appending
			if existing != "" && !strings.HasSuffix(existing, "\n") {
				newContent = existing + "\n" + content + "\n"
			} else {
				newContent = existing + content + "\n"
			}
		}
	}

	// Write back
	if err := fileService.WriteFile(relativePath, newContent); err != nil {
		outputError(fmt.Errorf("failed to write file: %w", err))
		return nil
	}

	updateLastOpenedFile(relativePath)

	if !silent {
		result := map[string]any{
			"path":     relativePath,
			"appended": true,
		}
		outputResult(result, fmt.Sprintf("Appended to: %s", relativePath))
	}

	return nil
}

// resolveFilePath resolves either a file= (wiki-link name) or path= to a relative path.
// This is a helper for write commands that take file and path as separate string arguments.
func resolveFilePath(file, path string) (string, error) {
	if file == "" && path == "" {
		return "", fmt.Errorf("either file= or path= is required")
	}

	if path != "" {
		// Direct path - ensure .md extension
		if !strings.HasSuffix(path, ".md") {
			path = path + ".md"
		}
		if !fileService.FileExists(path) {
			return "", fmt.Errorf("file not found: %s", path)
		}
		return path, nil
	}

	// Resolve via wiki-link
	resolved, found := linkService.ResolveLink(file)
	if !found {
		return "", fmt.Errorf("note not found: %s", file)
	}
	return resolved, nil
}

// appendToSection appends content at the end of a section (before the next heading
// of the same or higher level). If the section is not found, it creates the section
// at the end of the file and appends the content there.
func appendToSection(fileContent, sectionHeading, entry string) string {
	lines := strings.Split(fileContent, "\n")

	// Determine the heading level of the target section
	sectionLevel := headingLevel(sectionHeading)
	if sectionLevel == 0 {
		// Not a valid heading; just append at end
		if !strings.HasSuffix(fileContent, "\n") {
			return fileContent + "\n" + entry + "\n"
		}
		return fileContent + entry + "\n"
	}

	// Find the section
	sectionStart := -1
	for i, line := range lines {
		if strings.TrimSpace(line) == strings.TrimSpace(sectionHeading) {
			sectionStart = i
			break
		}
	}

	if sectionStart == -1 {
		// Section not found - create it at end
		var result strings.Builder
		result.WriteString(fileContent)
		if !strings.HasSuffix(fileContent, "\n") {
			result.WriteString("\n")
		}
		result.WriteString("\n")
		result.WriteString(sectionHeading)
		result.WriteString("\n")
		result.WriteString(entry)
		result.WriteString("\n")
		return result.String()
	}

	// Find the end of the section (next heading of same or higher level)
	insertAt := len(lines)
	for i := sectionStart + 1; i < len(lines); i++ {
		level := headingLevel(lines[i])
		if level > 0 && level <= sectionLevel {
			insertAt = i
			break
		}
	}

	// Insert the entry before the next heading.
	// Remove trailing empty lines before the next section to keep formatting clean
	actualInsert := insertAt
	for actualInsert > sectionStart+1 && strings.TrimSpace(lines[actualInsert-1]) == "" {
		actualInsert--
	}

	var result []string
	result = append(result, lines[:actualInsert]...)
	result = append(result, entry)
	result = append(result, lines[actualInsert:]...)

	return strings.Join(result, "\n")
}

// headingLevel returns the heading level of a markdown line (1-6), or 0 if not a heading.
func headingLevel(line string) int {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "#") {
		return 0
	}
	level := 0
	for _, ch := range trimmed {
		if ch == '#' {
			level++
		} else {
			break
		}
	}
	// Must be followed by a space (or be just "#")
	if level > 0 && level <= 6 {
		rest := trimmed[level:]
		if rest == "" || strings.HasPrefix(rest, " ") {
			return level
		}
	}
	return 0
}
