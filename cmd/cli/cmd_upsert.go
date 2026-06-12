//go:build cli

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var upsertCmd = &cobra.Command{
	Use:   "upsert",
	Short: "Create or append to a note",
	Long: `Create a new note if it doesn't exist, or append to it if it does.

If the file exists, behaves like append (with optional section= support).
If the file doesn't exist, behaves like create (with optional template= support),
then appends content if provided.

Examples:
  ob upsert file=MyNote content="New entry"
  ob upsert file=MyNote --content-file entry.md
  cat entry.md | ob upsert file=MyNote --content-file -
  ob upsert file=MyNote template=meeting content="## Agenda"
  ob upsert file=MyNote content="Section item" section="## Notes"`,
	RunE: runUpsert,
}

func init() {
	upsertCmd.Flags().String("file", "", "Note name (required)")
	upsertCmd.Flags().String("template", "", "Template to use for creation (filename without .md)")
	addContentFlags(upsertCmd)
	upsertCmd.Flags().String("section", "", "Section heading to append to")
	upsertCmd.Flags().String("silent", "false", "Suppress output (true/false)")

	rootCmd.AddCommand(upsertCmd)
}

func runUpsert(cmd *cobra.Command, args []string) error {
	if err := initServices(); err != nil {
		outputError(err)
		return nil
	}

	file, _ := cmd.Flags().GetString("file")
	templateName, _ := cmd.Flags().GetString("template")
	content, contentErr := resolveContent(cmd)
	if contentErr != nil {
		outputError(contentErr)
		return nil
	}
	section, _ := cmd.Flags().GetString("section")
	silentStr, _ := cmd.Flags().GetString("silent")

	silent := silentStr == "true"

	if file == "" {
		outputError(fmt.Errorf("file is required: use file=<name>"))
		return nil
	}

	// Try to resolve the file
	resolvedPath, found := linkService.ResolveLink(file)

	created := false
	appended := false

	if !found {
		// File doesn't exist - create it
		name := file
		if !strings.HasSuffix(name, ".md") {
			name = name + ".md"
		}
		resolvedPath = name

		// Build initial content from template
		var initialContent string
		if templateName != "" {
			templatesFolder := configService.GetTemplatesFolder()
			templatePath := filepath.Join(templatesFolder, templateName+".md")
			tmplContent, err := fileService.ReadFile(templatePath)
			if err != nil {
				outputError(fmt.Errorf("failed to read template %q: %w", templateName, err))
				return nil
			}
			initialContent = tmplContent
		}

		if err := fileService.CreateFile(resolvedPath, initialContent); err != nil {
			if os.IsExist(err) {
				// Race condition: file was created between ResolveLink and CreateFile
				found = true
			} else {
				outputError(fmt.Errorf("failed to create file: %w", err))
				return nil
			}
		} else {
			updateLastOpenedFile(resolvedPath)
			created = true
		}
	}

	// If content is provided, append it
	if content != "" {
		existing, err := fileService.ReadFile(resolvedPath)
		if err != nil {
			outputError(fmt.Errorf("failed to read file: %w", err))
			return nil
		}

		var newContent string
		if section != "" {
			newContent = appendToSection(existing, section, content)
		} else {
			if existing != "" && !strings.HasSuffix(existing, "\n") {
				newContent = existing + "\n" + content + "\n"
			} else {
				newContent = existing + content + "\n"
			}
		}

		if err := fileService.WriteFile(resolvedPath, newContent); err != nil {
			outputError(fmt.Errorf("failed to write file: %w", err))
			return nil
		}

		updateLastOpenedFile(resolvedPath)
		appended = true
	}

	if !silent {
		result := map[string]any{
			"path":     resolvedPath,
			"created":  created,
			"appended": appended,
		}
		var textRepr string
		if created && appended {
			textRepr = fmt.Sprintf("Created and appended to: %s", resolvedPath)
		} else if created {
			textRepr = fmt.Sprintf("Created: %s", resolvedPath)
		} else if appended {
			textRepr = fmt.Sprintf("Appended to: %s", resolvedPath)
		} else {
			textRepr = fmt.Sprintf("No changes: %s", resolvedPath)
		}
		outputResult(result, textRepr)
	}

	return nil
}
