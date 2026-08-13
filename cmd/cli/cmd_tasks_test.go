//go:build cli

package main

import (
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kazuph/obails/services"
	"github.com/spf13/cobra"
	"github.com/spf13/pflag"
)

type savedFlag struct {
	value   string
	changed bool
}

func preserveFlagSet(t *testing.T, flags *pflag.FlagSet) {
	t.Helper()
	saved := make(map[string]savedFlag)
	flags.VisitAll(func(flag *pflag.Flag) {
		saved[flag.Name] = savedFlag{value: flag.Value.String(), changed: flag.Changed}
	})
	t.Cleanup(func() {
		flags.VisitAll(func(flag *pflag.Flag) {
			state := saved[flag.Name]
			if err := flag.Value.Set(state.value); err != nil {
				t.Errorf("restore %s flag: %v", flag.Name, err)
			}
			flag.Changed = state.changed
		})
	})
}

func preserveFlags(t *testing.T, command *cobra.Command) {
	t.Helper()
	preserveFlagSet(t, command.Flags())
	preserveFlagSet(t, command.PersistentFlags())
}

func captureCommandOutput(t *testing.T, run func() error) (string, error) {
	t.Helper()
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatalf("Pipe failed: %v", err)
	}
	previousStdout := os.Stdout
	os.Stdout = writer
	t.Cleanup(func() { os.Stdout = previousStdout })

	runErr := run()
	if err := writer.Close(); err != nil {
		t.Fatalf("close output writer: %v", err)
	}
	os.Stdout = previousStdout
	output, err := io.ReadAll(reader)
	if err != nil {
		t.Fatalf("read command output: %v", err)
	}
	if err := reader.Close(); err != nil {
		t.Fatalf("close output reader: %v", err)
	}
	return string(output), runErr
}

func setFlag(t *testing.T, command *cobra.Command, name, value string) {
	t.Helper()
	flags := command.Flags()
	if flags.Lookup(name) == nil {
		flags = command.PersistentFlags()
	}
	if err := flags.Set(name, value); err != nil {
		t.Fatalf("set %s flag: %v", name, err)
	}
}

func taskReferenceFromVerbose(t *testing.T, output string) string {
	t.Helper()
	for _, line := range strings.Split(strings.TrimSpace(output), "\n") {
		if !strings.Contains(line, "Target task") {
			continue
		}
		value, found := strings.CutPrefix(line, "ref=")
		if !found {
			t.Fatalf("verbose line lacks ref: %q", line)
		}
		ref, _, found := strings.Cut(value, "\t")
		if !found || ref == "" {
			t.Fatalf("verbose line has invalid ref: %q", line)
		}
		return ref
	}
	t.Fatalf("target task missing from verbose output: %q", output)
	return ""
}

func TestTaskCommands_ReuseFreshReferenceAndRejectStaleReference(t *testing.T) {
	preserveFlags(t, rootCmd)
	preserveFlags(t, tasksCmd)
	preserveFlags(t, taskCmd)

	tmpDir := t.TempDir()
	vaultDir := filepath.Join(tmpDir, "vault")
	if err := os.MkdirAll(vaultDir, 0755); err != nil {
		t.Fatalf("MkdirAll failed: %v", err)
	}
	configPath := filepath.Join(tmpDir, "config.toml")
	if err := os.WriteFile(configPath, []byte("[vault]\npath = \""+vaultDir+"\"\n"), 0644); err != nil {
		t.Fatalf("WriteFile config failed: %v", err)
	}
	t.Setenv("OBAILS_CONFIG_FILE", configPath)

	initial := "- [ ] First task\n- [ ] Target task\n"
	taskPath := filepath.Join(vaultDir, "tasks.md")
	if err := os.WriteFile(taskPath, []byte(initial), 0644); err != nil {
		t.Fatalf("WriteFile task failed: %v", err)
	}

	setFlag(t, rootCmd, "format", "json")
	setFlag(t, rootCmd, "vault", "")
	setFlag(t, tasksCmd, "path", "tasks.md")
	setFlag(t, tasksCmd, "file", "")
	setFlag(t, tasksCmd, "daily", "false")
	setFlag(t, tasksCmd, "all", "false")
	setFlag(t, tasksCmd, "todo", "false")
	setFlag(t, tasksCmd, "done", "false")
	setFlag(t, tasksCmd, "total", "false")
	setFlag(t, tasksCmd, "verbose", "false")
	listedOutput, err := captureCommandOutput(t, func() error { return runTasks(tasksCmd, nil) })
	if err != nil {
		t.Fatalf("runTasks JSON failed: %v", err)
	}
	var listed []services.TaskItem
	if err := json.Unmarshal([]byte(listedOutput), &listed); err != nil {
		t.Fatalf("decode tasks JSON failed: %v\n%s", err, listedOutput)
	}
	if len(listed) != 2 || listed[1].Ref == "" {
		t.Fatalf("tasks JSON must issue target ref, got %#v", listed)
	}

	setFlag(t, taskCmd, "ref", listed[1].Ref)
	setFlag(t, taskCmd, "toggle", "false")
	setFlag(t, taskCmd, "done", "true")
	setFlag(t, taskCmd, "todo", "false")
	setFlag(t, taskCmd, "status", "")
	updatedOutput, err := captureCommandOutput(t, func() error { return runTask(taskCmd, nil) })
	if err != nil {
		t.Fatalf("runTask fresh reference failed: %v", err)
	}
	var updated map[string]any
	if err := json.Unmarshal([]byte(updatedOutput), &updated); err != nil {
		t.Fatalf("decode task update JSON failed: %v\n%s", err, updatedOutput)
	}
	nextRef, ok := updated["nextRef"].(string)
	if !ok || nextRef == "" || nextRef == listed[1].Ref {
		t.Fatalf("task update must return a fresh nextRef, got %#v", updated)
	}
	if _, returnedConsumedRef := updated["ref"]; returnedConsumedRef {
		t.Fatalf("task update must not return consumed ref, got %#v", updated)
	}
	if content, err := os.ReadFile(taskPath); err != nil || string(content) != "- [ ] First task\n- [x] Target task\n" {
		t.Fatalf("fresh reference result mismatch: content=%q err=%v", content, err)
	}

	setFlag(t, taskCmd, "ref", nextRef)
	setFlag(t, taskCmd, "done", "false")
	setFlag(t, taskCmd, "todo", "true")
	if _, err := captureCommandOutput(t, func() error { return runTask(taskCmd, nil) }); err != nil {
		t.Fatalf("runTask nextRef reuse failed: %v", err)
	}
	if content, err := os.ReadFile(taskPath); err != nil || string(content) != initial {
		t.Fatalf("nextRef reuse result mismatch: content=%q err=%v", content, err)
	}

	setFlag(t, rootCmd, "format", "text")
	setFlag(t, tasksCmd, "verbose", "true")
	verboseOutput, err := captureCommandOutput(t, func() error { return runTasks(tasksCmd, nil) })
	if err != nil {
		t.Fatalf("runTasks verbose failed: %v", err)
	}
	staleRef := taskReferenceFromVerbose(t, verboseOutput)
	staleContent := "- [ ] Target task\n- [ ] First task\n"
	if err := os.WriteFile(taskPath, []byte(staleContent), 0644); err != nil {
		t.Fatalf("WriteFile reordered task failed: %v", err)
	}
	setFlag(t, taskCmd, "ref", staleRef)
	setFlag(t, taskCmd, "todo", "false")
	setFlag(t, taskCmd, "toggle", "true")
	if _, err := captureCommandOutput(t, func() error { return runTask(taskCmd, nil) }); err == nil || !strings.Contains(err.Error(), "stale task reference") {
		t.Fatalf("expected stale task reference error, got %v", err)
	}
	if content, err := os.ReadFile(taskPath); err != nil || string(content) != staleContent {
		t.Fatalf("stale reference changed real file: content=%q err=%v", content, err)
	}
}
