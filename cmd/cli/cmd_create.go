//go:build cli

package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var createCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new note",
	Long: `Create a new note in the vault.

Examples:
  ob create name=MyNote
  ob create name=MyNote content="Hello world"
  ob create name=MyNote --content-file note.md
  cat note.md | ob create name=MyNote --content-file -
  # content= and --content-file cannot be used together.
  ob create name=MyNote template=daily_note
  ob create name=MyNote folder=subfolder
  ob create name=MyNote overwrite=true`,
	RunE: runCreate,
}

func init() {
	createCmd.Flags().String("name", "", "Name of the note to create (required)")
	createCmd.Flags().String("template", "", "Template to use (filename without .md)")
	addContentFlags(createCmd)
	createCmd.Flags().String("folder", "", "Folder path within vault")
	createCmd.Flags().String("overwrite", "false", "Overwrite existing file (true/false)")
	createCmd.Flags().String("silent", "false", "Suppress output (true/false)")

	rootCmd.AddCommand(createCmd)
}

func runCreate(cmd *cobra.Command, args []string) error {
	if err := initServices(); err != nil {
		outputError(err)
		return nil
	}

	name, _ := cmd.Flags().GetString("name")
	templateName, _ := cmd.Flags().GetString("template")
	content, err := resolveContent(cmd)
	if err != nil {
		outputError(err)
		return nil
	}
	folder, _ := cmd.Flags().GetString("folder")
	overwriteStr, _ := cmd.Flags().GetString("overwrite")
	silentStr, _ := cmd.Flags().GetString("silent")

	overwrite := overwriteStr == "true"
	silent := silentStr == "true"

	if name == "" {
		outputError(fmt.Errorf("name is required: use name=<name>"))
		return nil
	}

	// Ensure .md extension
	if !strings.HasSuffix(name, ".md") {
		name = name + ".md"
	}

	// Build the relative path
	var relativePath string
	if folder != "" {
		relativePath = filepath.Join(folder, name)
	} else {
		relativePath = name
	}

	// Build initial content
	var initialContent string

	// Load template if specified
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

	// If content is provided, append it (or use as initial if no template)
	if content != "" {
		if initialContent != "" {
			initialContent = initialContent + "\n" + content
		} else {
			initialContent = content
		}
	}

	// If no content and no template, create empty file
	if initialContent == "" {
		initialContent = ""
	}

	// Create or overwrite the file
	if overwrite {
		err = fileService.WriteFile(relativePath, initialContent)
	} else {
		err = fileService.CreateFile(relativePath, initialContent)
		if err != nil && os.IsExist(err) {
			outputError(fmt.Errorf("file already exists: %s (use overwrite=true to overwrite)", relativePath))
			return nil
		}
	}

	if err != nil {
		outputError(fmt.Errorf("failed to create file: %w", err))
		return nil
	}

	updateLastOpenedFile(relativePath)

	if !silent {
		result := map[string]any{
			"path":    relativePath,
			"created": true,
		}
		outputResult(result, fmt.Sprintf("Created: %s", relativePath))
	}

	return nil
}
