package services

import (
	"strings"
	"testing"
)

func TestSectionService_ExtractSection(t *testing.T) {
	ss := NewSectionService()

	content := `# Title

Some intro text.

## Section A

Content of section A.
More A content.

## Section B

Content of section B.

### Sub B1

Sub section content.

## Section C

Content of section C.
`

	t.Run("extract middle section", func(t *testing.T) {
		result, err := ss.ExtractSection(content, "## Section A")
		if err != nil {
			t.Fatalf("ExtractSection failed: %v", err)
		}
		if !strings.HasPrefix(result, "## Section A") {
			t.Error("Result should start with the heading")
		}
		if !strings.Contains(result, "Content of section A.") {
			t.Error("Result should contain section A content")
		}
		if strings.Contains(result, "Content of section B.") {
			t.Error("Result should NOT contain section B content")
		}
	})

	t.Run("extract first section (h1)", func(t *testing.T) {
		result, err := ss.ExtractSection(content, "# Title")
		if err != nil {
			t.Fatalf("ExtractSection failed: %v", err)
		}
		// H1 is the top level, so it includes everything until another H1 (which doesn't exist)
		if !strings.HasPrefix(result, "# Title") {
			t.Error("Result should start with the heading")
		}
	})

	t.Run("extract section with subsection", func(t *testing.T) {
		result, err := ss.ExtractSection(content, "## Section B")
		if err != nil {
			t.Fatalf("ExtractSection failed: %v", err)
		}
		if !strings.Contains(result, "Content of section B.") {
			t.Error("Result should contain section B content")
		}
		if !strings.Contains(result, "### Sub B1") {
			t.Error("Result should include subsections")
		}
		if !strings.Contains(result, "Sub section content.") {
			t.Error("Result should include subsection content")
		}
		if strings.Contains(result, "Content of section C.") {
			t.Error("Result should NOT contain section C content")
		}
	})

	t.Run("extract last section", func(t *testing.T) {
		result, err := ss.ExtractSection(content, "## Section C")
		if err != nil {
			t.Fatalf("ExtractSection failed: %v", err)
		}
		if !strings.HasPrefix(result, "## Section C") {
			t.Error("Result should start with the heading")
		}
		if !strings.Contains(result, "Content of section C.") {
			t.Error("Result should contain section C content")
		}
	})

	t.Run("extract subsection", func(t *testing.T) {
		result, err := ss.ExtractSection(content, "### Sub B1")
		if err != nil {
			t.Fatalf("ExtractSection failed: %v", err)
		}
		if !strings.HasPrefix(result, "### Sub B1") {
			t.Error("Result should start with the heading")
		}
		if !strings.Contains(result, "Sub section content.") {
			t.Error("Result should contain sub section content")
		}
		// Should stop at ## Section C which is higher level
		if strings.Contains(result, "Content of section C.") {
			t.Error("Result should stop before the next same-or-higher level heading")
		}
	})

	t.Run("section not found", func(t *testing.T) {
		_, err := ss.ExtractSection(content, "## Nonexistent")
		if err == nil {
			t.Error("Should return error for nonexistent section")
		}
	})

	t.Run("invalid heading", func(t *testing.T) {
		_, err := ss.ExtractSection(content, "not a heading")
		if err == nil {
			t.Error("Should return error for invalid heading format")
		}
	})
}

func TestSectionService_AppendToSection(t *testing.T) {
	ss := NewSectionService()

	t.Run("append to middle section", func(t *testing.T) {
		content := `## Section A

Content A.

## Section B

Content B.

## Section C

Content C.
`
		result := ss.AppendToSection(content, "## Section B", "New entry B.")
		lines := strings.Split(result, "\n")

		// Find the new entry
		entryIdx := -1
		sectionCIdx := -1
		for i, line := range lines {
			if strings.TrimSpace(line) == "New entry B." {
				entryIdx = i
			}
			if strings.TrimSpace(line) == "## Section C" {
				sectionCIdx = i
			}
		}

		if entryIdx == -1 {
			t.Fatal("New entry not found in result")
		}
		if sectionCIdx == -1 {
			t.Fatal("Section C not found in result")
		}
		if entryIdx >= sectionCIdx {
			t.Errorf("New entry (line %d) should be before Section C (line %d)", entryIdx, sectionCIdx)
		}
	})

	t.Run("append to last section", func(t *testing.T) {
		content := `## Section A

Content A.

## Section B

Content B.`
		result := ss.AppendToSection(content, "## Section B", "Appended to last.")
		if !strings.Contains(result, "Appended to last.") {
			t.Error("Result should contain the appended entry")
		}
		// The entry should come after "Content B."
		bIdx := strings.Index(result, "Content B.")
		aIdx := strings.Index(result, "Appended to last.")
		if aIdx <= bIdx {
			t.Error("Appended entry should be after existing content")
		}
	})

	t.Run("section not found appends to end", func(t *testing.T) {
		content := `## Section A

Content A.`
		result := ss.AppendToSection(content, "## Nonexistent", "Fallback entry.")
		if !strings.HasSuffix(result, "Fallback entry.") {
			t.Errorf("When section not found, should append to end. Got: %q", result)
		}
	})

	t.Run("append to section with subsections", func(t *testing.T) {
		content := `## Section A

Content A.

### Sub A1

Sub content.

## Section B

Content B.`
		result := ss.AppendToSection(content, "## Section A", "New A entry.")
		// The entry should be inserted before ## Section B
		lines := strings.Split(result, "\n")
		entryIdx := -1
		sectionBIdx := -1
		for i, line := range lines {
			if strings.TrimSpace(line) == "New A entry." {
				entryIdx = i
			}
			if strings.TrimSpace(line) == "## Section B" {
				sectionBIdx = i
			}
		}
		if entryIdx == -1 {
			t.Fatal("New entry not found")
		}
		if sectionBIdx == -1 {
			t.Fatal("Section B not found")
		}
		if entryIdx >= sectionBIdx {
			t.Error("Entry should be before Section B")
		}
	})
}
