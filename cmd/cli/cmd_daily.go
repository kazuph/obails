//go:build cli

package main

import (
	"fmt"
	"strings"
	"time"

	"github.com/spf13/cobra"
)

var dailyCmd = &cobra.Command{
	Use:   "daily",
	Short: "Daily notes operations",
	Long: `Manage daily notes. Without a subcommand, behaves like 'daily read'.

Subcommands:
  read      Read today's daily note (create if missing)
  append    Append content to today's daily note
  prepend   Prepend content to today's daily note
  timeline  Add a timestamped entry to the timeline section

Examples:
  obails-cli daily
  obails-cli daily read
  obails-cli daily read --date 2025-01-15
  obails-cli daily append content="New entry"
  obails-cli daily append content="Notes item" section="## Notes"
  obails-cli daily prepend content="Important"
  obails-cli daily timeline content="Started working on CLI"
  obails-cli daily timeline content="Review PR" --todo`,
	RunE: runDailyRead,
}

var dailyReadCmd = &cobra.Command{
	Use:   "read",
	Short: "Read today's daily note",
	Long: `Read today's daily note. Creates the note if it doesn't exist.
Use --date to read a specific date's note.

Examples:
  obails-cli daily read
  obails-cli daily read --date 2025-01-15`,
	RunE: runDailyRead,
}

var dailyAppendCmd = &cobra.Command{
	Use:   "append",
	Short: "Append content to today's daily note",
	Long: `Append content to today's daily note. The note is created if it doesn't exist.
Use section= to append to a specific section.

Examples:
  obails-cli daily append content="New entry"
  obails-cli daily append content="Notes item" section="## Notes"
  obails-cli daily append content="inline text" inline=true`,
	RunE: runDailyAppend,
}

var dailyPrependCmd = &cobra.Command{
	Use:   "prepend",
	Short: "Prepend content to today's daily note",
	Long: `Prepend content to today's daily note, after the frontmatter.
The note is created if it doesn't exist.

Examples:
  obails-cli daily prepend content="Important notice"`,
	RunE: runDailyPrepend,
}

var dailyTimelineCmd = &cobra.Command{
	Use:   "timeline",
	Short: "Add a timestamped timeline entry",
	Long: `Add a timestamped entry to the timeline/memos section of today's daily note.
The note is created if it doesn't exist.

Use --todo to add the entry as a checkbox item.

Examples:
  obails-cli daily timeline content="Started working"
  obails-cli daily timeline content="Review PR" --todo`,
	RunE: runDailyTimeline,
}

func init() {
	// daily read flags
	dailyReadCmd.Flags().String("date", "", "Date in YYYY-MM-DD format (defaults to today)")

	// daily append flags
	dailyAppendCmd.Flags().String("content", "", "Content to append (required)")
	dailyAppendCmd.Flags().String("section", "", "Section heading to append to")
	dailyAppendCmd.Flags().String("inline", "false", "Append without newline (true/false)")
	dailyAppendCmd.Flags().String("silent", "false", "Suppress output (true/false)")

	// daily prepend flags
	dailyPrependCmd.Flags().String("content", "", "Content to prepend (required)")
	dailyPrependCmd.Flags().String("inline", "false", "Prepend without newline (true/false)")
	dailyPrependCmd.Flags().String("silent", "false", "Suppress output (true/false)")

	// daily timeline flags
	dailyTimelineCmd.Flags().String("content", "", "Content for the timeline entry (required)")
	dailyTimelineCmd.Flags().Bool("todo", false, "Add as a todo checkbox item")
	dailyTimelineCmd.Flags().String("silent", "false", "Suppress output (true/false)")

	// Build subcommand structure
	dailyCmd.AddCommand(dailyReadCmd)
	dailyCmd.AddCommand(dailyAppendCmd)
	dailyCmd.AddCommand(dailyPrependCmd)
	dailyCmd.AddCommand(dailyTimelineCmd)

	rootCmd.AddCommand(dailyCmd)
}

func runDailyRead(cmd *cobra.Command, args []string) error {
	if err := initServices(); err != nil {
		outputError(err)
		return nil
	}

	// Get date flag (only available on dailyReadCmd and dailyCmd inherits its run)
	dateStr := ""
	if f := cmd.Flags().Lookup("date"); f != nil {
		dateStr = f.Value.String()
	}

	if dateStr != "" {
		// Specific date
		n, err := noteService.GetDailyNote(dateStr)
		if err != nil {
			// Try to create it
			n, err = noteService.CreateDailyNote(dateStr)
			if err != nil {
				outputError(fmt.Errorf("failed to get daily note for %s: %w", dateStr, err))
				return nil
			}
		}
		result := map[string]any{
			"path":    n.Path,
			"title":   n.Title,
			"content": n.Content,
		}
		outputResult(result, n.Content)
	} else {
		// Today
		n, err := noteService.GetTodayDailyNote()
		if err != nil {
			outputError(fmt.Errorf("failed to get today's daily note: %w", err))
			return nil
		}
		result := map[string]any{
			"path":    n.Path,
			"title":   n.Title,
			"content": n.Content,
		}
		outputResult(result, n.Content)
	}

	return nil
}

func runDailyAppend(cmd *cobra.Command, args []string) error {
	if err := initServices(); err != nil {
		outputError(err)
		return nil
	}

	content, _ := cmd.Flags().GetString("content")
	section, _ := cmd.Flags().GetString("section")
	inlineStr, _ := cmd.Flags().GetString("inline")
	silentStr, _ := cmd.Flags().GetString("silent")

	inline := inlineStr == "true"
	silent := silentStr == "true"

	if content == "" {
		outputError(fmt.Errorf("content is required: use content=<text>"))
		return nil
	}

	content = unescapeContent(content)

	// Get or create today's daily note
	note, err := noteService.GetTodayDailyNote()
	if err != nil {
		outputError(fmt.Errorf("failed to get today's daily note: %w", err))
		return nil
	}

	// Build new content
	var newContent string
	if section != "" {
		newContent = appendToSection(note.Content, section, content)
	} else {
		if inline {
			newContent = note.Content + content
		} else {
			if note.Content != "" && !strings.HasSuffix(note.Content, "\n") {
				newContent = note.Content + "\n" + content + "\n"
			} else {
				newContent = note.Content + content + "\n"
			}
		}
	}

	// Save
	if err := noteService.SaveNote(note.Path, newContent); err != nil {
		outputError(fmt.Errorf("failed to save daily note: %w", err))
		return nil
	}

	if !silent {
		result := map[string]any{
			"path":     note.Path,
			"appended": true,
		}
		outputResult(result, fmt.Sprintf("Appended to daily note: %s", note.Path))
	}

	return nil
}

func runDailyPrepend(cmd *cobra.Command, args []string) error {
	if err := initServices(); err != nil {
		outputError(err)
		return nil
	}

	content, _ := cmd.Flags().GetString("content")
	inlineStr, _ := cmd.Flags().GetString("inline")
	silentStr, _ := cmd.Flags().GetString("silent")

	inline := inlineStr == "true"
	silent := silentStr == "true"

	if content == "" {
		outputError(fmt.Errorf("content is required: use content=<text>"))
		return nil
	}

	content = unescapeContent(content)

	// Get or create today's daily note
	note, err := noteService.GetTodayDailyNote()
	if err != nil {
		outputError(fmt.Errorf("failed to get today's daily note: %w", err))
		return nil
	}

	// Prepend content respecting frontmatter
	newContent := prependToContent(note.Content, content, inline)

	// Save
	if err := noteService.SaveNote(note.Path, newContent); err != nil {
		outputError(fmt.Errorf("failed to save daily note: %w", err))
		return nil
	}

	if !silent {
		result := map[string]any{
			"path":      note.Path,
			"prepended": true,
		}
		outputResult(result, fmt.Sprintf("Prepended to daily note: %s", note.Path))
	}

	return nil
}

func runDailyTimeline(cmd *cobra.Command, args []string) error {
	if err := initServices(); err != nil {
		outputError(err)
		return nil
	}

	content, _ := cmd.Flags().GetString("content")
	isTodo, _ := cmd.Flags().GetBool("todo")
	silentStr, _ := cmd.Flags().GetString("silent")

	silent := silentStr == "true"

	if content == "" {
		outputError(fmt.Errorf("content is required: use content=<text>"))
		return nil
	}

	content = unescapeContent(content)

	if err := noteService.AddTimelineWithOptions(content, isTodo); err != nil {
		outputError(fmt.Errorf("failed to add timeline entry: %w", err))
		return nil
	}

	if !silent {
		timeStr := time.Now().Format(configService.GetTimelineTimeFormat())
		var entryFormat string
		if isTodo {
			entryFormat = fmt.Sprintf("- [ ] %s %s", timeStr, content)
		} else {
			entryFormat = fmt.Sprintf("- %s %s", timeStr, content)
		}

		result := map[string]any{
			"entry": entryFormat,
			"added": true,
		}
		outputResult(result, fmt.Sprintf("Added timeline: %s", entryFormat))
	}

	return nil
}
