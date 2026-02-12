//go:build cli

package main

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var backlinksCmd = &cobra.Command{
	Use:   "backlinks",
	Short: "Show files that link to a given file",
	Long: `Show all files that contain wiki-links pointing to the specified file.
Requires link index (automatically built).

Examples:
  obails-cli backlinks file=MyNote
  obails-cli backlinks path=notes/MyNote.md counts
  obails-cli backlinks file=MyNote total`,
	RunE: runBacklinks,
}

var linksCmd = &cobra.Command{
	Use:   "links",
	Short: "Show outgoing links from a file",
	Long: `Show all wiki-links found in a file, with resolution status.

Examples:
  obails-cli links file=MyNote
  obails-cli links path=notes/MyNote.md total`,
	RunE: runLinks,
}

var orphansCmd = &cobra.Command{
	Use:   "orphans",
	Short: "Show files with no incoming links",
	Long: `Show files that are not linked to from any other file (orphan notes).

Examples:
  obails-cli orphans
  obails-cli orphans total`,
	RunE: runOrphans,
}

var deadendsCmd = &cobra.Command{
	Use:   "deadends",
	Short: "Show files with no outgoing links",
	Long: `Show files that don't link to any other file (dead-end notes).

Examples:
  obails-cli deadends
  obails-cli deadends total`,
	RunE: runDeadends,
}

var unresolvedCmd = &cobra.Command{
	Use:   "unresolved",
	Short: "Show broken wiki-links",
	Long: `Show wiki-links that point to non-existent files.

Examples:
  obails-cli unresolved
  obails-cli unresolved total
  obails-cli unresolved verbose`,
	RunE: runUnresolved,
}

func init() {
	// backlinks flags
	backlinksCmd.Flags().String("file", "", "File name (wiki-link resolved)")
	backlinksCmd.Flags().String("path", "", "File path (relative to vault root)")
	backlinksCmd.Flags().Bool("counts", false, "Include link counts")
	backlinksCmd.Flags().Bool("total", false, "Show only the total count")

	// links flags
	linksCmd.Flags().String("file", "", "File name (wiki-link resolved)")
	linksCmd.Flags().String("path", "", "File path (relative to vault root)")
	linksCmd.Flags().Bool("total", false, "Show only the total count")

	// orphans flags
	orphansCmd.Flags().Bool("total", false, "Show only the total count")
	orphansCmd.Flags().Bool("all", false, "Include non-markdown files")

	// deadends flags
	deadendsCmd.Flags().Bool("total", false, "Show only the total count")
	deadendsCmd.Flags().Bool("all", false, "Include non-markdown files")

	// unresolved flags
	unresolvedCmd.Flags().Bool("total", false, "Show only the total count")
	unresolvedCmd.Flags().Bool("counts", false, "Include how many times each link appears")
	unresolvedCmd.Flags().Bool("verbose", false, "Include source file information")

	rootCmd.AddCommand(backlinksCmd)
	rootCmd.AddCommand(linksCmd)
	rootCmd.AddCommand(orphansCmd)
	rootCmd.AddCommand(deadendsCmd)
	rootCmd.AddCommand(unresolvedCmd)
}

// resolveLinksFilePath resolves a file path from --file or --path flags for link commands
func resolveLinksFilePath(cmd *cobra.Command) (string, error) {
	filePath, _ := cmd.Flags().GetString("path")
	fileName, _ := cmd.Flags().GetString("file")

	if filePath != "" {
		return filePath, nil
	}
	if fileName != "" {
		resolved, found := linkService.ResolveLink(fileName)
		if !found {
			return "", fmt.Errorf("file not found: %s", fileName)
		}
		return resolved, nil
	}
	return "", fmt.Errorf("file= or path= is required")
}

func runBacklinks(cmd *cobra.Command, args []string) error {
	if err := initServicesWithIndex(); err != nil {
		return err
	}

	filePath, err := resolveLinksFilePath(cmd)
	if err != nil {
		return err
	}

	totalOnly, _ := cmd.Flags().GetBool("total")
	counts, _ := cmd.Flags().GetBool("counts")

	backlinks := linkService.GetBacklinks(filePath)

	if totalOnly {
		outputResult(map[string]int{"total": len(backlinks)}, fmt.Sprintf("%d", len(backlinks)))
		return nil
	}

	if outputFormat == "json" {
		if counts {
			type backlinkWithCount struct {
				SourcePath  string `json:"sourcePath"`
				SourceTitle string `json:"sourceTitle"`
				Context     string `json:"context"`
				Count       int    `json:"count"`
			}
			var result []backlinkWithCount
			for _, bl := range backlinks {
				result = append(result, backlinkWithCount{
					SourcePath:  bl.SourcePath,
					SourceTitle: bl.SourceTitle,
					Context:     bl.Context,
					Count:       1, // Each backlink entry is one reference
				})
			}
			outputJSON(result)
		} else {
			outputJSON(backlinks)
		}
	} else {
		if len(backlinks) == 0 {
			outputText("No backlinks found.")
			return nil
		}
		var sb strings.Builder
		for _, bl := range backlinks {
			if counts {
				sb.WriteString(fmt.Sprintf("%s\t%s\n", bl.SourcePath, bl.Context))
			} else {
				sb.WriteString(bl.SourcePath)
				sb.WriteString("\n")
			}
		}
		outputText(strings.TrimRight(sb.String(), "\n"))
	}

	return nil
}

func runLinks(cmd *cobra.Command, args []string) error {
	if err := initServicesWithIndex(); err != nil {
		return err
	}

	filePath, err := resolveLinksFilePath(cmd)
	if err != nil {
		return err
	}

	totalOnly, _ := cmd.Flags().GetBool("total")

	links, err := linkService.GetLinkInfo(filePath)
	if err != nil {
		return fmt.Errorf("failed to get links: %w", err)
	}

	if totalOnly {
		outputResult(map[string]int{"total": len(links)}, fmt.Sprintf("%d", len(links)))
		return nil
	}

	if outputFormat == "json" {
		outputJSON(links)
	} else {
		if len(links) == 0 {
			outputText("No links found.")
			return nil
		}
		var sb strings.Builder
		for _, l := range links {
			status := "OK"
			if !l.Exists {
				status = "MISSING"
			}
			sb.WriteString(fmt.Sprintf("[%s] %s -> %s\n", status, l.Text, l.TargetPath))
		}
		outputText(strings.TrimRight(sb.String(), "\n"))
	}

	return nil
}

func runOrphans(cmd *cobra.Command, args []string) error {
	if err := initServicesWithIndex(); err != nil {
		return err
	}

	totalOnly, _ := cmd.Flags().GetBool("total")
	includeAll, _ := cmd.Flags().GetBool("all")

	graph := graphService.GetFullGraph()

	// Build a set of nodes that have incoming edges
	hasIncoming := make(map[string]bool)
	for _, edge := range graph.Edges {
		hasIncoming[edge.Target] = true
	}

	// Find nodes with no incoming edges (orphans)
	type orphanNode struct {
		Path  string `json:"path"`
		Label string `json:"label"`
	}
	var orphans []orphanNode
	for _, node := range graph.Nodes {
		if hasIncoming[node.ID] {
			continue
		}
		// Filter non-markdown if not --all
		if !includeAll && !isMarkdownPath(node.ID) {
			continue
		}
		orphans = append(orphans, orphanNode{
			Path:  node.ID,
			Label: node.Label,
		})
	}

	if totalOnly {
		outputResult(map[string]int{"total": len(orphans)}, fmt.Sprintf("%d", len(orphans)))
		return nil
	}

	if outputFormat == "json" {
		outputJSON(orphans)
	} else {
		if len(orphans) == 0 {
			outputText("No orphan notes found.")
			return nil
		}
		var sb strings.Builder
		for _, o := range orphans {
			sb.WriteString(o.Path)
			sb.WriteString("\n")
		}
		outputText(strings.TrimRight(sb.String(), "\n"))
	}

	return nil
}

func runDeadends(cmd *cobra.Command, args []string) error {
	if err := initServicesWithIndex(); err != nil {
		return err
	}

	totalOnly, _ := cmd.Flags().GetBool("total")
	includeAll, _ := cmd.Flags().GetBool("all")

	graph := graphService.GetFullGraph()

	// Build a set of nodes that have outgoing edges
	hasOutgoing := make(map[string]bool)
	for _, edge := range graph.Edges {
		hasOutgoing[edge.Source] = true
	}

	// Find nodes with no outgoing edges (dead-ends)
	type deadendNode struct {
		Path  string `json:"path"`
		Label string `json:"label"`
	}
	var deadends []deadendNode
	for _, node := range graph.Nodes {
		if hasOutgoing[node.ID] {
			continue
		}
		if !includeAll && !isMarkdownPath(node.ID) {
			continue
		}
		deadends = append(deadends, deadendNode{
			Path:  node.ID,
			Label: node.Label,
		})
	}

	if totalOnly {
		outputResult(map[string]int{"total": len(deadends)}, fmt.Sprintf("%d", len(deadends)))
		return nil
	}

	if outputFormat == "json" {
		outputJSON(deadends)
	} else {
		if len(deadends) == 0 {
			outputText("No dead-end notes found.")
			return nil
		}
		var sb strings.Builder
		for _, d := range deadends {
			sb.WriteString(d.Path)
			sb.WriteString("\n")
		}
		outputText(strings.TrimRight(sb.String(), "\n"))
	}

	return nil
}

func runUnresolved(cmd *cobra.Command, args []string) error {
	if err := initServicesWithIndex(); err != nil {
		return err
	}

	totalOnly, _ := cmd.Flags().GetBool("total")
	showCounts, _ := cmd.Flags().GetBool("counts")
	verbose, _ := cmd.Flags().GetBool("verbose")

	forwardIndex := linkService.ExportForwardIndex()

	type unresolvedLink struct {
		Link    string   `json:"link"`
		Count   int      `json:"count,omitempty"`
		Sources []string `json:"sources,omitempty"`
	}

	// Collect unresolved links
	unresolvedMap := make(map[string][]string) // link -> source files
	for filePath, links := range forwardIndex {
		for _, linkText := range links {
			if _, resolved := linkService.ResolveLink(linkText); !resolved {
				unresolvedMap[linkText] = append(unresolvedMap[linkText], filePath)
			}
		}
	}

	// Convert to sorted slice
	var unresolved []unresolvedLink
	for link, sources := range unresolvedMap {
		entry := unresolvedLink{Link: link}
		if showCounts || verbose {
			entry.Count = len(sources)
		}
		if verbose {
			entry.Sources = sources
		}
		unresolved = append(unresolved, entry)
	}

	if totalOnly {
		outputResult(map[string]int{"total": len(unresolved)}, fmt.Sprintf("%d", len(unresolved)))
		return nil
	}

	if outputFormat == "json" {
		outputJSON(unresolved)
	} else {
		if len(unresolved) == 0 {
			outputText("No unresolved links found.")
			return nil
		}
		var sb strings.Builder
		for _, u := range unresolved {
			if verbose {
				sb.WriteString(fmt.Sprintf("[[%s]] (from: %s)\n", u.Link, strings.Join(u.Sources, ", ")))
			} else if showCounts {
				sb.WriteString(fmt.Sprintf("[[%s]] (%d)\n", u.Link, u.Count))
			} else {
				sb.WriteString(fmt.Sprintf("[[%s]]\n", u.Link))
			}
		}
		outputText(strings.TrimRight(sb.String(), "\n"))
	}

	return nil
}

// isMarkdownPath checks if a path ends with .md
func isMarkdownPath(path string) bool {
	return strings.HasSuffix(path, ".md") || !strings.Contains(filepath.Base(path), ".")
}
