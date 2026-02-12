//go:build cli

package main

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"
)

var searchCmd = &cobra.Command{
	Use:   "search",
	Short: "Search for files or content in the vault",
	Long: `Search for files by name or content within the vault.

By default, searches file names. Use the 'matches' flag to search file contents.

Examples:
  obails-cli search query=meeting
  obails-cli search query="project plan" matches
  obails-cli search query=TODO matches limit=10 case`,
	RunE: runSearch,
}

func init() {
	searchCmd.Flags().String("query", "", "Search query text")
	searchCmd.Flags().Int("limit", 50, "Maximum number of results")
	searchCmd.Flags().Bool("matches", false, "Search file contents instead of file names")
	searchCmd.Flags().Bool("case", false, "Case-sensitive search (content search only)")

	rootCmd.AddCommand(searchCmd)
}

func runSearch(cmd *cobra.Command, args []string) error {
	if err := initServices(); err != nil {
		return err
	}

	query, _ := cmd.Flags().GetString("query")
	limit, _ := cmd.Flags().GetInt("limit")
	contentSearch, _ := cmd.Flags().GetBool("matches")
	caseSensitive, _ := cmd.Flags().GetBool("case")

	// Also check positional args for query (first non-key=value arg)
	if query == "" {
		for _, arg := range args {
			if !strings.Contains(arg, "=") {
				query = arg
				break
			}
		}
	}

	if query == "" {
		return fmt.Errorf("query is required: search query=<text>")
	}

	if contentSearch {
		return runContentSearch(query, limit, caseSensitive)
	}
	return runFileNameSearch(query, limit)
}

func runFileNameSearch(query string, limit int) error {
	results, err := fileService.SearchFiles(query)
	if err != nil {
		return fmt.Errorf("search failed: %w", err)
	}

	// Apply limit
	if limit > 0 && len(results) > limit {
		results = results[:limit]
	}

	if outputFormat == "json" {
		outputJSON(results)
	} else {
		if len(results) == 0 {
			outputText("No files found.")
			return nil
		}
		var sb strings.Builder
		for _, r := range results {
			sb.WriteString(r.Path)
			sb.WriteString("\n")
		}
		outputText(strings.TrimRight(sb.String(), "\n"))
	}

	return nil
}

func runContentSearch(query string, limit int, caseSensitive bool) error {
	results, err := fileService.SearchFileContents(query, limit, caseSensitive)
	if err != nil {
		return fmt.Errorf("content search failed: %w", err)
	}

	if outputFormat == "json" {
		outputJSON(results)
	} else {
		if len(results) == 0 {
			outputText("No matches found.")
			return nil
		}
		var sb strings.Builder
		for _, r := range results {
			sb.WriteString(fmt.Sprintf("%s:%d: %s\n", r.Path, r.Line, r.Context))
		}
		outputText(strings.TrimRight(sb.String(), "\n"))
	}

	return nil
}
