//go:build cli

package main

import (
	"fmt"

	"github.com/kazuph/obails/services"
	"github.com/spf13/cobra"
)

var propertiesCmd = &cobra.Command{
	Use:   "properties [file=<name>|path=<path>]",
	Short: "Read frontmatter properties from a note",
	Long: `Read YAML frontmatter properties from a note.

If name= is specified, returns only that single property value.
Otherwise, returns all properties.`,
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

		fms := services.NewFrontmatterService()
		props, _, err := fms.ParseFrontmatter(content)
		if err != nil {
			outputError(fmt.Errorf("failed to parse frontmatter: %w", err))
			return nil
		}

		nameFlag, _ := cmd.Flags().GetString("name")
		if nameFlag != "" {
			value, exists := props[nameFlag]
			if !exists {
				outputError(fmt.Errorf("property not found: %q", nameFlag))
				return nil
			}

			result := map[string]any{
				"path":  relativePath,
				"name":  nameFlag,
				"value": value,
			}
			outputResult(result, fmt.Sprintf("%v", value))
			return nil
		}

		// Return all properties
		result := map[string]any{
			"path":       relativePath,
			"properties": props,
		}

		text := ""
		for k, v := range props {
			text += fmt.Sprintf("%s: %v\n", k, v)
		}
		outputResult(result, text)
		return nil
	},
}

func init() {
	propertiesCmd.Flags().String("file", "", "Note name (wiki-link style resolution)")
	propertiesCmd.Flags().String("path", "", "Vault-relative file path")
	propertiesCmd.Flags().String("name", "", "Specific property name to retrieve")

	rootCmd.AddCommand(propertiesCmd)
}
