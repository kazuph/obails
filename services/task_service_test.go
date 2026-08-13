package services

import (
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTaskService_ParseTasksInFile(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	ns := NewNoteService(fs, cs)
	ts := NewTaskService(fs, ns, cs)

	// Create a file with various task types
	content := `# Project Tasks

## Todo
- [ ] Buy groceries
- [x] Send email
- [-] Cancelled meeting
- [/] In progress report
- [ ] Nested context

## Notes
Some regular text here.
- Regular bullet point
- [ ] Another todo in different section
`
	fs.WriteFile("tasks.md", content)

	t.Run("parse all tasks from file", func(t *testing.T) {
		tasks, err := ts.ParseTasksInFile("tasks.md")
		if err != nil {
			t.Fatalf("ParseTasksInFile failed: %v", err)
		}

		if len(tasks) != 6 {
			t.Fatalf("Expected 6 tasks, got %d", len(tasks))
		}

		// Verify first task
		if tasks[0].Content != "Buy groceries" {
			t.Errorf("Expected 'Buy groceries', got %q", tasks[0].Content)
		}
		if tasks[0].Done {
			t.Error("First task should not be done")
		}
		if tasks[0].Status != " " {
			t.Errorf("Expected status ' ', got %q", tasks[0].Status)
		}
		if tasks[0].Line != 4 {
			t.Errorf("Expected line 4, got %d", tasks[0].Line)
		}

		// Verify completed task
		if tasks[1].Content != "Send email" {
			t.Errorf("Expected 'Send email', got %q", tasks[1].Content)
		}
		if !tasks[1].Done {
			t.Error("Second task should be done")
		}
		if tasks[1].Status != "x" {
			t.Errorf("Expected status 'x', got %q", tasks[1].Status)
		}

		// Verify cancelled task
		if tasks[2].Status != "-" {
			t.Errorf("Expected status '-', got %q", tasks[2].Status)
		}
		if tasks[2].Done {
			t.Error("Cancelled task should not be marked done")
		}

		// Verify in-progress task
		if tasks[3].Status != "/" {
			t.Errorf("Expected status '/', got %q", tasks[3].Status)
		}
	})

	t.Run("parse tasks from non-existent file", func(t *testing.T) {
		_, err := ts.ParseTasksInFile("nonexistent.md")
		if err == nil {
			t.Error("Should return error for non-existent file")
		}
	})

	t.Run("parse tasks from file with no tasks", func(t *testing.T) {
		fs.WriteFile("no-tasks.md", "# Just a note\n\nSome content without tasks.\n")
		tasks, err := ts.ParseTasksInFile("no-tasks.md")
		if err != nil {
			t.Fatalf("ParseTasksInFile failed: %v", err)
		}
		if len(tasks) != 0 {
			t.Errorf("Expected 0 tasks, got %d", len(tasks))
		}
	})
}

func TestTaskService_ParseAllTasks(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	ns := NewNoteService(fs, cs)
	ts := NewTaskService(fs, ns, cs)

	// Create multiple files with tasks
	fs.WriteFile("project-a.md", "# Project A\n- [ ] Task A1\n- [x] Task A2\n")
	fs.WriteFile("project-b.md", "# Project B\n- [ ] Task B1\n")
	fs.WriteFile("subfolder/project-c.md", "# Project C\n- [ ] Task C1\n- [ ] Task C2\n- [x] Task C3\n")
	fs.WriteFile("no-tasks.md", "# No tasks here\nJust text.\n")

	t.Run("parse all tasks from vault", func(t *testing.T) {
		tasks, err := ts.ParseAllTasks()
		if err != nil {
			t.Fatalf("ParseAllTasks failed: %v", err)
		}

		if len(tasks) != 6 {
			t.Errorf("Expected 6 tasks across all files, got %d", len(tasks))
		}

		// Verify tasks come from different files
		files := make(map[string]bool)
		for _, task := range tasks {
			files[task.File] = true
		}
		if len(files) != 3 {
			t.Errorf("Expected tasks from 3 files, got %d", len(files))
		}
	})

	t.Run("does not issue tasks or references for a symlink outside the vault", func(t *testing.T) {
		externalDir := t.TempDir()
		externalTask := filepath.Join(externalDir, "outside.md")
		if err := os.WriteFile(externalTask, []byte("- [ ] Outside task\n"), 0644); err != nil {
			t.Fatalf("write external task: %v", err)
		}
		if err := os.Symlink(externalTask, filepath.Join(tmpDir, "outside-link.md")); err != nil {
			t.Fatalf("create external symlink: %v", err)
		}

		tasks, err := ts.ParseAllTasks()
		if err != nil {
			t.Fatalf("ParseAllTasks failed: %v", err)
		}
		for _, task := range tasks {
			if task.File == "outside-link.md" || task.Content == "Outside task" {
				t.Fatalf("outside symlink task must not be issued: %#v", task)
			}
		}
	})
}

func TestTaskService_ToggleTask(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	ns := NewNoteService(fs, cs)
	ts := NewTaskService(fs, ns, cs)

	t.Run("toggle todo to done", func(t *testing.T) {
		fs.WriteFile("toggle.md", "# Tasks\n- [ ] Incomplete task\n- [x] Complete task\n")

		err := ts.ToggleTask("toggle.md", 2)
		if err != nil {
			t.Fatalf("ToggleTask failed: %v", err)
		}

		content, _ := fs.ReadFile("toggle.md")
		if !containsLine(content, "- [x] Incomplete task") {
			t.Errorf("Task should be toggled to done, got:\n%s", content)
		}
	})

	t.Run("toggle done to todo", func(t *testing.T) {
		fs.WriteFile("toggle2.md", "# Tasks\n- [x] Complete task\n")

		err := ts.ToggleTask("toggle2.md", 2)
		if err != nil {
			t.Fatalf("ToggleTask failed: %v", err)
		}

		content, _ := fs.ReadFile("toggle2.md")
		if !containsLine(content, "- [ ] Complete task") {
			t.Errorf("Task should be toggled to todo, got:\n%s", content)
		}
	})

	t.Run("toggle cancelled to todo", func(t *testing.T) {
		fs.WriteFile("toggle3.md", "# Tasks\n- [-] Cancelled task\n")

		err := ts.ToggleTask("toggle3.md", 2)
		if err != nil {
			t.Fatalf("ToggleTask failed: %v", err)
		}

		content, _ := fs.ReadFile("toggle3.md")
		if !containsLine(content, "- [x] Cancelled task") {
			t.Errorf("Non-x task should toggle to x, got:\n%s", content)
		}
	})

	t.Run("toggle non-task line", func(t *testing.T) {
		fs.WriteFile("no-task.md", "# Header\nRegular text\n")

		err := ts.ToggleTask("no-task.md", 2)
		if err == nil {
			t.Error("Should return error for non-task line")
		}
	})

	t.Run("toggle out of range", func(t *testing.T) {
		fs.WriteFile("small.md", "# Tasks\n- [ ] Only task\n")

		err := ts.ToggleTask("small.md", 99)
		if err == nil {
			t.Error("Should return error for out-of-range line")
		}
	})
}

func TestTaskService_SetTaskStatus(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	ns := NewNoteService(fs, cs)
	ts := NewTaskService(fs, ns, cs)

	t.Run("set status to in-progress", func(t *testing.T) {
		fs.WriteFile("status.md", "# Tasks\n- [ ] My task\n")

		err := ts.SetTaskStatus("status.md", 2, "/")
		if err != nil {
			t.Fatalf("SetTaskStatus failed: %v", err)
		}

		content, _ := fs.ReadFile("status.md")
		if !containsLine(content, "- [/] My task") {
			t.Errorf("Task should have status '/', got:\n%s", content)
		}
	})

	t.Run("set status to cancelled", func(t *testing.T) {
		fs.WriteFile("status2.md", "# Tasks\n- [ ] My task\n")

		err := ts.SetTaskStatus("status2.md", 2, "-")
		if err != nil {
			t.Fatalf("SetTaskStatus failed: %v", err)
		}

		content, _ := fs.ReadFile("status2.md")
		if !containsLine(content, "- [-] My task") {
			t.Errorf("Task should have status '-', got:\n%s", content)
		}
	})

	t.Run("set status to done", func(t *testing.T) {
		fs.WriteFile("status3.md", "# Tasks\n- [ ] My task\n")

		err := ts.SetTaskStatus("status3.md", 2, "x")
		if err != nil {
			t.Fatalf("SetTaskStatus failed: %v", err)
		}

		content, _ := fs.ReadFile("status3.md")
		if !containsLine(content, "- [x] My task") {
			t.Errorf("Task should have status 'x', got:\n%s", content)
		}
	})

	t.Run("invalid multi-char status", func(t *testing.T) {
		fs.WriteFile("status4.md", "# Tasks\n- [ ] My task\n")

		err := ts.SetTaskStatus("status4.md", 2, "xx")
		if err == nil {
			t.Error("Should return error for multi-char status")
		}
	})

	t.Run("set status on non-task line", func(t *testing.T) {
		fs.WriteFile("status5.md", "# Header\nNot a task\n")

		err := ts.SetTaskStatus("status5.md", 2, "x")
		if err == nil {
			t.Error("Should return error for non-task line")
		}
	})
}

func TestTaskService_TaskReference(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	ns := NewNoteService(fs, cs)
	ts := NewTaskService(fs, ns, cs)

	issueTargetRef := func(t *testing.T) string {
		t.Helper()
		tasks, err := ts.ParseTasksInFile("tasks.md")
		if err != nil {
			t.Fatalf("ParseTasksInFile failed: %v", err)
		}
		if len(tasks) != 2 {
			t.Fatalf("expected two tasks, got %d", len(tasks))
		}
		if tasks[1].Ref == "" {
			t.Fatal("expected task reference")
		}
		return tasks[1].Ref
	}

	t.Run("emits an opaque reference in JSON task output", func(t *testing.T) {
		if err := fs.WriteFile("tasks.md", "- [ ] First task\n- [ ] Target task\n"); err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}

		tasks, err := ts.ParseTasksInFile("tasks.md")
		if err != nil {
			t.Fatalf("ParseTasksInFile failed: %v", err)
		}
		encoded, err := json.Marshal(tasks)
		if err != nil {
			t.Fatalf("Marshal failed: %v", err)
		}
		if !strings.Contains(string(encoded), `"ref"`) {
			t.Fatalf("task JSON must include a reference, got %s", encoded)
		}
	})

	t.Run("rejects a reference after a line is inserted", func(t *testing.T) {
		if err := fs.WriteFile("tasks.md", "- [ ] First task\n- [ ] Target task\n"); err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}
		ref := issueTargetRef(t)

		before := "- [ ] Inserted task\n- [ ] First task\n- [ ] Target task\n"
		if err := fs.WriteFile("tasks.md", before); err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}
		_, err := ts.SetTaskStatusRef(ref, "x")
		if err == nil || !strings.Contains(err.Error(), "stale task reference") {
			t.Fatalf("expected stale task reference error, got %v", err)
		}

		content, err := fs.ReadFile("tasks.md")
		if err != nil {
			t.Fatalf("ReadFile failed: %v", err)
		}
		if content != before {
			t.Fatalf("stale reference changed file:\nwant: %q\n got: %q", before, content)
		}
	})

	t.Run("rejects a reference after tasks are reordered", func(t *testing.T) {
		if err := fs.WriteFile("tasks.md", "- [ ] First task\n- [ ] Target task\n"); err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}
		ref := issueTargetRef(t)

		before := "- [ ] Target task\n- [ ] First task\n"
		if err := fs.WriteFile("tasks.md", before); err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}
		_, err := ts.ToggleTaskRef(ref)
		if err == nil || !strings.Contains(err.Error(), "stale task reference") {
			t.Fatalf("expected stale task reference error, got %v", err)
		}

		content, err := fs.ReadFile("tasks.md")
		if err != nil {
			t.Fatalf("ReadFile failed: %v", err)
		}
		if content != before {
			t.Fatalf("stale reference changed file:\nwant: %q\n got: %q", before, content)
		}
	})

	t.Run("rejects a reference whose task identity no longer matches", func(t *testing.T) {
		if err := fs.WriteFile("tasks.md", "- [ ] First task\n- [ ] Target task\n"); err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}
		ref := issueTargetRef(t)
		reference, err := decodeTaskReference(ref)
		if err != nil {
			t.Fatalf("decodeTaskReference failed: %v", err)
		}

		if err := fs.WriteFile("tasks.md", "- [ ] Target task\n- [ ] First task\n"); err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}
		content, err := fs.ReadFile("tasks.md")
		if err != nil {
			t.Fatalf("ReadFile failed: %v", err)
		}
		reference.Generation = taskContentGeneration(content)
		before := content
		_, err = ts.ToggleTaskRef(encodeTaskReference(reference))
		if err == nil || !strings.Contains(err.Error(), "task identity changed") {
			t.Fatalf("expected task identity error, got %v", err)
		}
		after, err := fs.ReadFile("tasks.md")
		if err != nil {
			t.Fatalf("ReadFile after stale update failed: %v", err)
		}
		if after != before {
			t.Fatalf("identity mismatch changed file:\nwant: %q\n got: %q", before, after)
		}
	})

	t.Run("rejects a reference after its file is removed", func(t *testing.T) {
		if err := fs.WriteFile("tasks.md", "- [ ] First task\n- [ ] Target task\n"); err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}
		ref := issueTargetRef(t)
		if err := os.Remove(filepath.Join(tmpDir, "tasks.md")); err != nil {
			t.Fatalf("Remove failed: %v", err)
		}

		_, err := ts.ToggleTaskRef(ref)
		if err == nil || !strings.Contains(err.Error(), "stale task reference") {
			t.Fatalf("expected stale task reference error, got %v", err)
		}
		if _, err := os.Stat(filepath.Join(tmpDir, "tasks.md")); !os.IsNotExist(err) {
			t.Fatalf("stale reference must not recreate removed file, stat error: %v", err)
		}
	})

	t.Run("updates the referenced task when the file generation and identity match", func(t *testing.T) {
		if err := fs.WriteFile("tasks.md", "- [ ] First task\n- [ ] Target task\n"); err != nil {
			t.Fatalf("WriteFile failed: %v", err)
		}
		ref := issueTargetRef(t)

		nextRef, err := ts.SetTaskStatusRef(ref, "x")
		if err != nil {
			t.Fatalf("SetTaskStatusRef failed: %v", err)
		}
		if nextRef == "" || nextRef == ref {
			t.Fatalf("expected a fresh next reference, got %q", nextRef)
		}
		content, err := fs.ReadFile("tasks.md")
		if err != nil {
			t.Fatalf("ReadFile failed: %v", err)
		}
		if content != "- [ ] First task\n- [x] Target task\n" {
			t.Fatalf("fresh reference updated the wrong content:\n%s", content)
		}
		if _, err := ts.SetTaskStatusRef(nextRef, " "); err != nil {
			t.Fatalf("fresh next reference must be reusable: %v", err)
		}
	})

	t.Run("rejects unknown JSON fields and non-SHA256 digests", func(t *testing.T) {
		payload := base64.RawURLEncoding.EncodeToString([]byte(`{"file":"tasks.md","line":1,"generation":"bad","identity":"bad","extra":true}`))
		if _, err := decodeTaskReference(payload); err == nil {
			t.Fatal("expected unknown field to be rejected")
		}

		payload = base64.RawURLEncoding.EncodeToString([]byte(`{"file":"tasks.md","line":1,"generation":"YQ","identity":"YQ"}`))
		if _, err := decodeTaskReference(payload); err == nil {
			t.Fatal("expected non-SHA256 digests to be rejected")
		}
	})
}

// containsLine checks if the content contains a specific line
func containsLine(content, line string) bool {
	for _, l := range splitLines(content) {
		if trimmedEquals(l, line) {
			return true
		}
	}
	return false
}

func splitLines(s string) []string {
	return splitByNewline(s)
}

func splitByNewline(s string) []string {
	result := []string{}
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			result = append(result, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		result = append(result, s[start:])
	}
	return result
}

func trimmedEquals(a, b string) bool {
	return trimWhitespace(a) == trimWhitespace(b)
}

func trimWhitespace(s string) string {
	start := 0
	end := len(s)
	for start < end && (s[start] == ' ' || s[start] == '\t' || s[start] == '\r') {
		start++
	}
	for end > start && (s[end-1] == ' ' || s[end-1] == '\t' || s[end-1] == '\r') {
		end--
	}
	return s[start:end]
}
