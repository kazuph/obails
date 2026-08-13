//go:build cli

package main

import (
	"fmt"

	"github.com/spf13/cobra"
)

var (
	// Version is set at build time
	version = "1.0.0"

	// Global flags
	outputFormat string
	vaultPath    string
)

var rootCmd = &cobra.Command{
	Use:   "ob",
	Short: "Obails CLI - A command-line interface for your Obsidian-compatible vault",
	Long: `Obails CLI provides command-line access to your vault.
It supports both standard flags (--file MyNote) and Obsidian-compatible
key=value syntax (file=MyNote).

JSON output is the default for AI Agent integration.
Use --format text for human-readable output.`,
	Version: version,
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		// Skip key=value parsing for help and version commands
		if cmd.Name() == "help" || cmd.Name() == "version" {
			return nil
		}
		return parseKeyValueArgs(cmd, args)
	},
	// Show help when called without subcommands
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
	SilenceUsage:  true,
	SilenceErrors: true,
}

func init() {
	rootCmd.PersistentFlags().StringVar(&outputFormat, "format", "json", "Output format: json or text")
	rootCmd.PersistentFlags().StringVar(&vaultPath, "vault", "", "Path to the vault (overrides config)")

	rootCmd.SetVersionTemplate(fmt.Sprintf("ob version %s\n", version))
}
