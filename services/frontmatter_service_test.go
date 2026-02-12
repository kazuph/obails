package services

import (
	"strings"
	"testing"
)

func TestFrontmatterService_ParseFrontmatter(t *testing.T) {
	fs := NewFrontmatterService()

	t.Run("parse valid frontmatter", func(t *testing.T) {
		content := `---
title: My Note
tags:
  - note
  - test
---
# Heading

Body content.
`
		props, body, err := fs.ParseFrontmatter(content)
		if err != nil {
			t.Fatalf("ParseFrontmatter failed: %v", err)
		}

		if props["title"] != "My Note" {
			t.Errorf("Expected title 'My Note', got %v", props["title"])
		}

		tags, ok := props["tags"].([]any)
		if !ok {
			t.Fatalf("Expected tags to be a slice, got %T", props["tags"])
		}
		if len(tags) != 2 {
			t.Errorf("Expected 2 tags, got %d", len(tags))
		}

		if !strings.HasPrefix(body, "# Heading") {
			t.Errorf("Body should start with '# Heading', got: %q", body[:min(len(body), 50)])
		}
	})

	t.Run("no frontmatter", func(t *testing.T) {
		content := `# Just a heading

No frontmatter here.
`
		props, body, err := fs.ParseFrontmatter(content)
		if err != nil {
			t.Fatalf("ParseFrontmatter failed: %v", err)
		}
		if len(props) != 0 {
			t.Errorf("Expected empty props, got %v", props)
		}
		if body != content {
			t.Error("Body should be the entire content when no frontmatter")
		}
	})

	t.Run("empty frontmatter", func(t *testing.T) {
		content := `---
---
Body after empty frontmatter.
`
		props, body, err := fs.ParseFrontmatter(content)
		if err != nil {
			t.Fatalf("ParseFrontmatter failed: %v", err)
		}
		if len(props) != 0 {
			t.Errorf("Expected empty props for empty frontmatter, got %v", props)
		}
		if !strings.HasPrefix(body, "Body after empty frontmatter.") {
			t.Errorf("Body mismatch: %q", body)
		}
	})

	t.Run("frontmatter with date", func(t *testing.T) {
		content := `---
date: 2026-01-15
draft: true
---
Content.
`
		props, _, err := fs.ParseFrontmatter(content)
		if err != nil {
			t.Fatalf("ParseFrontmatter failed: %v", err)
		}
		if props["draft"] != true {
			t.Errorf("Expected draft=true, got %v", props["draft"])
		}
	})

	t.Run("content starting with dashes but not frontmatter", func(t *testing.T) {
		content := `--- some text
not frontmatter
`
		props, body, err := fs.ParseFrontmatter(content)
		if err != nil {
			t.Fatalf("ParseFrontmatter failed: %v", err)
		}
		if len(props) != 0 {
			t.Errorf("Expected empty props, got %v", props)
		}
		if body != content {
			t.Error("Body should be the entire content")
		}
	})

	t.Run("frontmatter without trailing content", func(t *testing.T) {
		content := "---\ntitle: Solo\n---\n"
		props, body, err := fs.ParseFrontmatter(content)
		if err != nil {
			t.Fatalf("ParseFrontmatter failed: %v", err)
		}
		if props["title"] != "Solo" {
			t.Errorf("Expected title 'Solo', got %v", props["title"])
		}
		if body != "" {
			t.Errorf("Expected empty body, got %q", body)
		}
	})
}

func TestFrontmatterService_SetFrontmatterProperty(t *testing.T) {
	fs := NewFrontmatterService()

	t.Run("set property in existing frontmatter", func(t *testing.T) {
		content := `---
title: Original
---
Body.
`
		result, err := fs.SetFrontmatterProperty(content, "title", "Updated")
		if err != nil {
			t.Fatalf("SetFrontmatterProperty failed: %v", err)
		}

		props, body, _ := fs.ParseFrontmatter(result)
		if props["title"] != "Updated" {
			t.Errorf("Expected title 'Updated', got %v", props["title"])
		}
		if !strings.Contains(body, "Body.") {
			t.Error("Body should be preserved")
		}
	})

	t.Run("add new property to existing frontmatter", func(t *testing.T) {
		content := `---
title: MyNote
---
Body.
`
		result, err := fs.SetFrontmatterProperty(content, "draft", true)
		if err != nil {
			t.Fatalf("SetFrontmatterProperty failed: %v", err)
		}

		props, _, _ := fs.ParseFrontmatter(result)
		if props["title"] != "MyNote" {
			t.Errorf("Original title should be preserved, got %v", props["title"])
		}
		if props["draft"] != true {
			t.Errorf("Expected draft=true, got %v", props["draft"])
		}
	})

	t.Run("create frontmatter when none exists", func(t *testing.T) {
		content := `# Heading

Body content.
`
		result, err := fs.SetFrontmatterProperty(content, "tags", []string{"a", "b"})
		if err != nil {
			t.Fatalf("SetFrontmatterProperty failed: %v", err)
		}

		if !strings.HasPrefix(result, "---\n") {
			t.Error("Result should start with frontmatter delimiter")
		}

		props, body, _ := fs.ParseFrontmatter(result)
		tags, ok := props["tags"].([]any)
		if !ok {
			t.Fatalf("Expected tags to be a slice, got %T", props["tags"])
		}
		if len(tags) != 2 {
			t.Errorf("Expected 2 tags, got %d", len(tags))
		}
		if !strings.HasPrefix(body, "# Heading") {
			t.Errorf("Body should be preserved, got: %q", body[:min(len(body), 50)])
		}
	})
}

func TestFrontmatterService_RemoveFrontmatterProperty(t *testing.T) {
	fs := NewFrontmatterService()

	t.Run("remove existing property", func(t *testing.T) {
		content := `---
title: MyNote
draft: true
---
Body.
`
		result, err := fs.RemoveFrontmatterProperty(content, "draft")
		if err != nil {
			t.Fatalf("RemoveFrontmatterProperty failed: %v", err)
		}

		props, body, _ := fs.ParseFrontmatter(result)
		if props["title"] != "MyNote" {
			t.Errorf("Title should be preserved, got %v", props["title"])
		}
		if _, exists := props["draft"]; exists {
			t.Error("draft property should be removed")
		}
		if !strings.Contains(body, "Body.") {
			t.Error("Body should be preserved")
		}
	})

	t.Run("remove nonexistent property returns unchanged", func(t *testing.T) {
		content := `---
title: MyNote
---
Body.
`
		result, err := fs.RemoveFrontmatterProperty(content, "nonexistent")
		if err != nil {
			t.Fatalf("RemoveFrontmatterProperty failed: %v", err)
		}
		if result != content {
			t.Error("Content should be unchanged when removing nonexistent property")
		}
	})

	t.Run("remove last property removes frontmatter block", func(t *testing.T) {
		content := `---
title: Solo
---
Body content.
`
		result, err := fs.RemoveFrontmatterProperty(content, "title")
		if err != nil {
			t.Fatalf("RemoveFrontmatterProperty failed: %v", err)
		}
		if strings.Contains(result, "---") {
			t.Error("Frontmatter block should be removed when last property is deleted")
		}
		if !strings.Contains(result, "Body content.") {
			t.Error("Body should be preserved")
		}
	})
}
