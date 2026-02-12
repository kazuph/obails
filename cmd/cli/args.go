//go:build cli

package main

import (
	"strings"

	"github.com/spf13/cobra"
)

// parseKeyValueArgs parses key=value arguments and maps them to cobra flags.
// This provides Obsidian CLI compatible syntax: obails-cli read file=MyNote
// in addition to standard flag syntax: obails-cli read --file MyNote
//
// It also supports bare words as boolean flags: obails-cli search query=test matches
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
