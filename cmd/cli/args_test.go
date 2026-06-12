//go:build cli

package main

import (
	"os"
	"testing"

	"github.com/spf13/cobra"
)

func TestParseKeyValueArgs(t *testing.T) {
	t.Run("parse simple key=value", func(t *testing.T) {
		cmd := &cobra.Command{Use: "test"}
		var fileFlag string
		cmd.Flags().StringVar(&fileFlag, "file", "", "file name")

		err := parseKeyValueArgs(cmd, []string{"file=MyNote"})
		if err != nil {
			t.Fatalf("parseKeyValueArgs failed: %v", err)
		}
		if fileFlag != "MyNote" {
			t.Errorf("expected 'MyNote', got '%s'", fileFlag)
		}
	})

	t.Run("parse value with equals sign", func(t *testing.T) {
		cmd := &cobra.Command{Use: "test"}
		var contentFlag string
		cmd.Flags().StringVar(&contentFlag, "content", "", "content")

		err := parseKeyValueArgs(cmd, []string{"content=a=b=c"})
		if err != nil {
			t.Fatalf("parseKeyValueArgs failed: %v", err)
		}
		if contentFlag != "a=b=c" {
			t.Errorf("expected 'a=b=c', got '%s'", contentFlag)
		}
	})

	t.Run("skip args without equals sign", func(t *testing.T) {
		cmd := &cobra.Command{Use: "test"}
		var fileFlag string
		cmd.Flags().StringVar(&fileFlag, "file", "", "file name")

		err := parseKeyValueArgs(cmd, []string{"notakeyvalue", "file=MyNote"})
		if err != nil {
			t.Fatalf("parseKeyValueArgs failed: %v", err)
		}
		if fileFlag != "MyNote" {
			t.Errorf("expected 'MyNote', got '%s'", fileFlag)
		}
	})

	t.Run("skip unknown keys", func(t *testing.T) {
		cmd := &cobra.Command{Use: "test"}
		var fileFlag string
		cmd.Flags().StringVar(&fileFlag, "file", "", "file name")

		err := parseKeyValueArgs(cmd, []string{"unknown=value", "file=MyNote"})
		if err != nil {
			t.Fatalf("parseKeyValueArgs failed: %v", err)
		}
		if fileFlag != "MyNote" {
			t.Errorf("expected 'MyNote', got '%s'", fileFlag)
		}
	})

	t.Run("parse multiple key=value pairs", func(t *testing.T) {
		cmd := &cobra.Command{Use: "test"}
		var fileFlag, sectionFlag string
		cmd.Flags().StringVar(&fileFlag, "file", "", "file name")
		cmd.Flags().StringVar(&sectionFlag, "section", "", "section")

		err := parseKeyValueArgs(cmd, []string{"file=MyNote", "section=## Heading"})
		if err != nil {
			t.Fatalf("parseKeyValueArgs failed: %v", err)
		}
		if fileFlag != "MyNote" {
			t.Errorf("file: expected 'MyNote', got '%s'", fileFlag)
		}
		if sectionFlag != "## Heading" {
			t.Errorf("section: expected '## Heading', got '%s'", sectionFlag)
		}
	})

	t.Run("parse inherited persistent flags", func(t *testing.T) {
		parent := &cobra.Command{Use: "parent"}
		var formatFlag string
		parent.PersistentFlags().StringVar(&formatFlag, "format", "json", "output format")

		child := &cobra.Command{Use: "child"}
		parent.AddCommand(child)

		err := parseKeyValueArgs(child, []string{"format=text"})
		if err != nil {
			t.Fatalf("parseKeyValueArgs failed: %v", err)
		}
		if formatFlag != "text" {
			t.Errorf("expected 'text', got '%s'", formatFlag)
		}
	})
}

func TestUnescapeContent(t *testing.T) {
	t.Run("convert literal backslash-n to newline", func(t *testing.T) {
		result := unescapeContent(`line1\nline2`)
		expected := "line1\nline2"
		if result != expected {
			t.Errorf("expected %q, got %q", expected, result)
		}
	})

	t.Run("multiple newlines", func(t *testing.T) {
		result := unescapeContent(`a\nb\nc`)
		expected := "a\nb\nc"
		if result != expected {
			t.Errorf("expected %q, got %q", expected, result)
		}
	})

	t.Run("no escape sequences", func(t *testing.T) {
		result := unescapeContent("plain text")
		if result != "plain text" {
			t.Errorf("expected 'plain text', got '%s'", result)
		}
	})

	t.Run("empty string", func(t *testing.T) {
		result := unescapeContent("")
		if result != "" {
			t.Errorf("expected empty string, got '%s'", result)
		}
	})
}

func TestResolveContent(t *testing.T) {
	newCmd := func() *cobra.Command {
		cmd := &cobra.Command{Use: "test"}
		addContentFlags(cmd)
		return cmd
	}

	t.Run("content= keeps legacy literal \\n conversion", func(t *testing.T) {
		cmd := newCmd()
		cmd.Flags().Set("content", `line1\nline2`)
		got, err := resolveContent(cmd)
		if err != nil {
			t.Fatalf("resolveContent failed: %v", err)
		}
		if got != "line1\nline2" {
			t.Errorf("expected newline conversion, got %q", got)
		}
	})

	t.Run("content-file reads LaTeX verbatim without escape processing", func(t *testing.T) {
		tmp, err := os.CreateTemp("", "ob-content-*.md")
		if err != nil {
			t.Fatalf("CreateTemp failed: %v", err)
		}
		defer os.Remove(tmp.Name())
		latex := `数式 $\nabla^2 u \neq \nu$ と \not と改行リテラル \n はそのまま`
		if _, err := tmp.WriteString(latex); err != nil {
			t.Fatalf("WriteString failed: %v", err)
		}
		tmp.Close()

		cmd := newCmd()
		cmd.Flags().Set("content-file", tmp.Name())
		got, err := resolveContent(cmd)
		if err != nil {
			t.Fatalf("resolveContent failed: %v", err)
		}
		if got != latex {
			t.Errorf("content-file must be verbatim.\nwant %q\ngot  %q", latex, got)
		}
	})

	t.Run("content-file takes precedence over content", func(t *testing.T) {
		tmp, err := os.CreateTemp("", "ob-content-*.md")
		if err != nil {
			t.Fatalf("CreateTemp failed: %v", err)
		}
		defer os.Remove(tmp.Name())
		tmp.WriteString("from file")
		tmp.Close()

		cmd := newCmd()
		cmd.Flags().Set("content", "from flag")
		cmd.Flags().Set("content-file", tmp.Name())
		got, err := resolveContent(cmd)
		if err != nil {
			t.Fatalf("resolveContent failed: %v", err)
		}
		if got != "from file" {
			t.Errorf("expected file content to win, got %q", got)
		}
	})

	t.Run("missing content-file returns error", func(t *testing.T) {
		cmd := newCmd()
		cmd.Flags().Set("content-file", "/nonexistent/path.md")
		if _, err := resolveContent(cmd); err == nil {
			t.Error("expected error for missing content-file")
		}
	})
}
