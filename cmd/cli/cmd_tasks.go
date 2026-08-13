//go:build cli

package main

import (
	"fmt"
	"strings"

	"github.com/kazuph/obails/services"
	"github.com/spf13/cobra"
)

var tasksCmd = &cobra.Command{
	Use:   "tasks",
	Short: "List tasks (checkboxes) from vault files",
	Long: `List tasks (- [ ] / - [x]) from vault files.

By default, lists tasks from a specific file. Use 'all' for vault-wide,
or 'daily' for today's daily note.

Examples:
  ob tasks file=MyProject
  ob tasks daily
  ob tasks all todo
  ob tasks all done total
  ob tasks file=Todo.md verbose`,
	RunE: runTasks,
}

var taskCmd = &cobra.Command{
	Use:   "task",
	Short: "Modify a task's status",
	Long: `Toggle or set the status of a specific task by file and line number.

Examples:
  ob task ref=<opaque-reference-from-tasks-output> toggle
  ob task ref=<opaque-reference-from-tasks-output> done
  ob task file=Todo.md line=5 todo
  ob task file=Todo.md line=5 status=/
  ob task file=Todo.md line=5 toggle`,
	RunE: runTask,
}

func init() {
	// tasks command flags
	tasksCmd.Flags().String("file", "", "File name (wiki-link resolved)")
	tasksCmd.Flags().String("path", "", "File path (relative to vault root)")
	tasksCmd.Flags().Bool("daily", false, "Show tasks from today's daily note")
	tasksCmd.Flags().Bool("todo", false, "Show only incomplete tasks")
	tasksCmd.Flags().Bool("done", false, "Show only completed tasks")
	tasksCmd.Flags().Bool("all", false, "Search all files in the vault")
	tasksCmd.Flags().Bool("total", false, "Show only the total count")
	tasksCmd.Flags().Bool("verbose", false, "Include file path and line number")

	// task command flags
	taskCmd.Flags().String("ref", "", "Opaque task reference emitted by tasks JSON or verbose output")
	taskCmd.Flags().String("file", "", "File name (wiki-link resolved)")
	taskCmd.Flags().String("path", "", "File path (relative to vault root)")
	taskCmd.Flags().Int("line", 0, "Line number of the task")
	taskCmd.Flags().Bool("toggle", false, "Toggle task status")
	taskCmd.Flags().Bool("done", false, "Set task to done [x]")
	taskCmd.Flags().Bool("todo", false, "Set task to todo [ ]")
	taskCmd.Flags().String("status", "", "Set task to arbitrary status character")

	rootCmd.AddCommand(tasksCmd)
	rootCmd.AddCommand(taskCmd)
}

// resolveTaskFilePath resolves a file path from --file or --path flags
func resolveTaskFilePath(cmd *cobra.Command) (string, error) {
	filePath, _ := cmd.Flags().GetString("path")
	fileName, _ := cmd.Flags().GetString("file")

	if filePath != "" {
		return filePath, nil
	}
	if fileName != "" {
		// Resolve wiki-link style name to path
		resolved, found := linkService.ResolveLink(fileName)
		if !found {
			return "", fmt.Errorf("file not found: %s", fileName)
		}
		return resolved, nil
	}
	return "", fmt.Errorf("file= or path= is required")
}

func runTasks(cmd *cobra.Command, args []string) error {
	daily, _ := cmd.Flags().GetBool("daily")
	allVault, _ := cmd.Flags().GetBool("all")
	todoOnly, _ := cmd.Flags().GetBool("todo")
	doneOnly, _ := cmd.Flags().GetBool("done")
	totalOnly, _ := cmd.Flags().GetBool("total")
	verbose, _ := cmd.Flags().GetBool("verbose")

	if err := initServices(); err != nil {
		return err
	}

	var tasks []services.TaskItem
	var err error

	switch {
	case daily:
		tasks, err = taskService.ParseDailyTasks()
	case allVault:
		tasks, err = taskService.ParseAllTasks()
	default:
		filePath, resolveErr := resolveTaskFilePath(cmd)
		if resolveErr != nil {
			return resolveErr
		}
		tasks, err = taskService.ParseTasksInFile(filePath)
	}

	if err != nil {
		return err
	}

	// Filter by status
	if todoOnly {
		tasks = filterTaskItems(tasks, func(t services.TaskItem) bool { return !t.Done })
	} else if doneOnly {
		tasks = filterTaskItems(tasks, func(t services.TaskItem) bool { return t.Done })
	}

	// Output
	if totalOnly {
		outputResult(map[string]int{"total": len(tasks)}, fmt.Sprintf("%d", len(tasks)))
		return nil
	}

	if outputFormat == "json" {
		outputJSON(tasks)
	} else {
		if len(tasks) == 0 {
			outputText("No tasks found.")
			return nil
		}
		var sb strings.Builder
		for _, t := range tasks {
			if verbose {
				sb.WriteString(fmt.Sprintf("ref=%s\t%s:%d\t- [%s] %s\n", t.Ref, t.File, t.Line, t.Status, t.Content))
			} else {
				sb.WriteString(fmt.Sprintf("- [%s] %s\n", t.Status, t.Content))
			}
		}
		outputText(strings.TrimRight(sb.String(), "\n"))
	}

	return nil
}

func filterTaskItems(tasks []services.TaskItem, pred func(services.TaskItem) bool) []services.TaskItem {
	var result []services.TaskItem
	for _, t := range tasks {
		if pred(t) {
			result = append(result, t)
		}
	}
	return result
}

func runTask(cmd *cobra.Command, args []string) error {
	if err := initServices(); err != nil {
		return err
	}

	ref, _ := cmd.Flags().GetString("ref")
	toggle, _ := cmd.Flags().GetBool("toggle")
	done, _ := cmd.Flags().GetBool("done")
	todo, _ := cmd.Flags().GetBool("todo")
	status, _ := cmd.Flags().GetString("status")

	if ref != "" {
		var nextRef string
		var err error
		switch {
		case toggle:
			nextRef, err = taskService.ToggleTaskRef(ref)
		case done:
			nextRef, err = taskService.SetTaskStatusRef(ref, "x")
		case todo:
			nextRef, err = taskService.SetTaskStatusRef(ref, " ")
		case status != "":
			nextRef, err = taskService.SetTaskStatusRef(ref, status)
		default:
			return fmt.Errorf("action required: toggle, done, todo, or status=<char>")
		}
		if err != nil {
			return fmt.Errorf("task update failed: %w", err)
		}

		outputResult(map[string]any{"success": true, "nextRef": nextRef}, "Task updated")
		return nil
	}

	filePath, err := resolveTaskFilePath(cmd)
	if err != nil {
		return err
	}
	lineNum, _ := cmd.Flags().GetInt("line")
	if lineNum <= 0 {
		return fmt.Errorf("line number is required and must be positive")
	}

	switch {
	case toggle:
		if err := taskService.ToggleTask(filePath, lineNum); err != nil {
			return fmt.Errorf("toggle failed: %w", err)
		}
	case done:
		if err := taskService.SetTaskStatus(filePath, lineNum, "x"); err != nil {
			return fmt.Errorf("set done failed: %w", err)
		}
	case todo:
		if err := taskService.SetTaskStatus(filePath, lineNum, " "); err != nil {
			return fmt.Errorf("set todo failed: %w", err)
		}
	case status != "":
		if err := taskService.SetTaskStatus(filePath, lineNum, status); err != nil {
			return fmt.Errorf("set status failed: %w", err)
		}
	default:
		return fmt.Errorf("action required: toggle, done, todo, or status=<char>")
	}

	outputResult(
		map[string]any{"success": true, "file": filePath, "line": lineNum},
		fmt.Sprintf("Task updated: %s:%d", filePath, lineNum),
	)
	return nil
}
