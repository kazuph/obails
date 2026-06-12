//go:build cli

package main

import (
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"
)

// parseKeyValueArgs parses key=value arguments and maps them to cobra flags.
// This provides Obsidian CLI compatible syntax: ob read file=MyNote
// in addition to standard flag syntax: ob read --file MyNote
//
// It also supports bare words as boolean flags: ob search query=test matches
// A bare word (no "=") that matches a boolean flag name will set that flag to true.
func parseKeyValueArgs(cmd *cobra.Command, args []string) error {
	for _, arg := range args {
		parts := strings.SplitN(arg, "=", 2)
		if len(parts) != 2 {
			// Handle bare words as boolean flags
			flag := cmd.Flags().Lookup(arg)
			if flag == nil {
				flag = cmd.PersistentFlags().Lookup(arg)
			}
			if flag == nil {
				flag = cmd.InheritedFlags().Lookup(arg)
			}
			if flag != nil && flag.Value.Type() == "bool" {
				flag.Value.Set("true")
				flag.Changed = true
			}
			continue
		}

		key := parts[0]
		value := parts[1]

		// Check if this flag exists on the command (local or persistent)
		flag := cmd.Flags().Lookup(key)
		if flag == nil {
			flag = cmd.PersistentFlags().Lookup(key)
		}
		if flag == nil {
			// Try parent persistent flags (like --format, --vault)
			flag = cmd.InheritedFlags().Lookup(key)
		}

		if flag != nil {
			if err := flag.Value.Set(value); err != nil {
				return err
			}
			flag.Changed = true
		}
	}
	return nil
}

// unescapeContent converts literal \n sequences to actual newlines.
// This allows multiline content to be passed via CLI arguments.
func unescapeContent(s string) string {
	return strings.ReplaceAll(s, `\n`, "\n")
}

// resolveContent returns the note content for create/append/prepend.
//
// content-file=<path> (or "-" for stdin) reads the content verbatim with NO
// escape processing — required for LaTeX like \nabla where the legacy
// content= flag's \n conversion would corrupt the text.
// content= keeps the historical literal-\n-to-newline behavior.
func resolveContent(cmd *cobra.Command) (string, error) {
	contentFile, _ := cmd.Flags().GetString("content-file")
	if contentFile != "" {
		content, _ := cmd.Flags().GetString("content")
		if content != "" {
			return "", fmt.Errorf("content and content-file cannot be used together")
		}

		var data []byte
		var err error
		if contentFile == "-" {
			data, err = io.ReadAll(os.Stdin)
		} else {
			data, err = os.ReadFile(contentFile)
		}
		if err != nil {
			return "", fmt.Errorf("failed to read content-file %q: %w", contentFile, err)
		}
		return string(data), nil
	}

	content, _ := cmd.Flags().GetString("content")
	if content == "" {
		return "", nil
	}
	return unescapeContent(content), nil
}

func addContentFlags(cmd *cobra.Command) {
	cmd.Flags().String("content", "", "Content text (literal \\n becomes a newline)")
	cmd.Flags().String("content-file", "", "Read content verbatim from a file, or '-' for stdin (no escape processing)")
}
