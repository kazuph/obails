package services

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/kazuph/obails/models"
)

func TestLinkService_GetUnlinkedMentions_UsesIndexedRenderableProse(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateFile("notes/Project Plan.markdown", "---\naliases:\n  - Plan Alias\n---\n# Project Plan")
	fs.CreateFile("source.md", "---\nsummary: Project Plan\n---\n# Project Plan\nProject Plan is discussed here.\nThe notes/Project Plan path is named.\nPlan Alias is also named.\n[[Project Plan]]\n[Project Plan](notes/Project%20Plan.markdown)\n`Project Plan`\nUnmatched ` literal Project Plan stays prose.\n```md\nProject Plan\n```\nProject Planner must not match.")

	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}
	result := ls.GetUnlinkedMentions("notes/Project Plan.markdown")
	if !result.Ready || result.Generation != 1 {
		t.Fatalf("mentions must identify the published generation: %#v", result.LinkIndexState)
	}

	matches := make(map[string]bool)
	foundUnmatchedLiteral := false
	pathMentionCount := 0
	for _, mention := range result.Mentions {
		if mention.SourcePath != "source.md" || mention.TargetPath != "notes/Project Plan.markdown" || mention.TargetTitle != "Project Plan" {
			t.Fatalf("mention must retain structured source and target data: %#v", mention)
		}
		matches[mention.Match] = true
		for _, forbidden := range []string{"[[Project Plan]]", "[Project Plan]", "`Project Plan`", "Project Planner"} {
			if strings.Contains(mention.Context, forbidden) {
				t.Fatalf("non-renderable or non-standalone text was reported: %#v", mention)
			}
		}
		foundUnmatchedLiteral = foundUnmatchedLiteral || strings.Contains(mention.Context, "Unmatched ` literal Project Plan")
		if strings.Contains(mention.Context, "notes/Project Plan path") {
			pathMentionCount++
			if mention.Match != "notes/Project Plan" {
				t.Errorf("path mention must prefer its full path over its overlapping title: %#v", mention)
			}
		}
	}
	if !foundUnmatchedLiteral {
		t.Errorf("unmatched inline-code delimiter must remain literal renderable prose: %#v", result.Mentions)
	}
	if pathMentionCount != 1 {
		t.Errorf("one path occurrence must produce one mention, got %#v", result.Mentions)
	}
	for _, expected := range []string{"Project Plan", "notes/Project Plan", "Plan Alias"} {
		if !matches[expected] {
			t.Errorf("expected unlinked %q mention, got %#v", expected, result.Mentions)
		}
	}
	if unresolved := ls.GetUnlinkedMentions("../../outside"); len(unresolved.Mentions) != 0 || !unresolved.Ready {
		t.Errorf("outside target must fail closed: %#v", unresolved)
	}
}

func TestTransclusionService_ResolvesIndexedNoteEmbeds(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	target := "---\nalias: Target Alias\n---\n# Overview\nIntro.\n## Child\nChild text.\n# Next\nNext text.\n\nBlock first line\ncontinued ^block-a\n\n```md\nignored ^code-block\n```"
	fs.CreateFile("target.md", target)
	fs.CreateFile("source.md", "![[target]]\n![[target#Overview]]\n![[target#^block-a]]\n![[target#^code-block]]")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}
	links, err := ls.GetLinkInfo("source.md")
	if err != nil || len(links) != 4 {
		t.Fatalf("GetLinkInfo = %#v, %v", links, err)
	}
	resolver := NewTransclusionService(ls)

	missingGeneration := links[0]
	missingGeneration.Generation = 0
	if _, err := resolver.Resolve(missingGeneration); !errors.Is(err, ErrStaleTransclusion) {
		t.Fatalf("a transclusion request without a generation must be rejected, got %v", err)
	}
	full, err := resolver.Resolve(links[0])
	if err != nil || full.Content != target || full.TargetPath != "target.md" {
		t.Fatalf("full note embed = %#v, %v", full, err)
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "target.md"), []byte(target+"\nChanged in G2."), 0644); err != nil {
		t.Fatalf("WriteFile target for G2: %v", err)
	}
	stable, err := resolver.Resolve(links[0])
	if err != nil || stable.Content != target {
		t.Fatalf("embed must use the generation-captured Markdown until rebuild: %#v, %v", stable, err)
	}
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex for G2 failed: %v", err)
	}
	if links[0].Generation != 1 {
		t.Fatalf("G1 transclusion request must carry generation 1: %#v", links[0])
	}
	if _, err := resolver.Resolve(links[0]); !errors.Is(err, ErrStaleTransclusion) {
		t.Fatalf("a transclusion request from G1 must be rejected after G2 is published, got %v", err)
	}
	links, err = ls.GetLinkInfo("source.md")
	if err != nil || len(links) != 4 {
		t.Fatalf("GetLinkInfo for G2 = %#v, %v", links, err)
	}
	if links[0].Generation != 2 {
		t.Fatalf("G2 transclusion request must carry generation 2: %#v", links[0])
	}
	full, err = resolver.Resolve(links[0])
	if err != nil || full.Content != target+"\nChanged in G2." || full.Generation != 2 {
		t.Fatalf("a transclusion request from G2 must read G2 content: %#v, %v", full, err)
	}
	section, err := resolver.Resolve(links[1])
	if err != nil || !strings.Contains(section.Content, "# Overview") || !strings.Contains(section.Content, "## Child") || strings.Contains(section.Content, "# Next") {
		t.Fatalf("heading embed must stop at next equal-or-higher heading: %#v, %v", section, err)
	}
	block, err := resolver.Resolve(links[2])
	if err != nil || block.Content != "Block first line\ncontinued" || block.FragmentType != "block" {
		t.Fatalf("block embed = %#v, %v", block, err)
	}
	if _, err := resolver.Resolve(links[3]); !errors.Is(err, ErrUnresolvedTransclusion) {
		t.Fatalf("block identifiers in fenced code must fail closed, got %v", err)
	}

	fs.CreateFile("headings.md", "Setext Section\n--------------\nInside setext section.\n   ### Mixed   Case   ###\nInside ATX section.\n\nNext Section\n------------\nOutside section.")
	fs.CreateFile("heading-source.md", "![[headings#  mixed case ]]\n![[headings# SETEXT   SECTION]]")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex for heading variants failed: %v", err)
	}
	headingLinks, err := ls.GetLinkInfo("heading-source.md")
	if err != nil || len(headingLinks) != 2 {
		t.Fatalf("heading links = %#v, %v", headingLinks, err)
	}
	atxSection, err := resolver.Resolve(headingLinks[0])
	if err != nil || !strings.Contains(atxSection.Content, "Inside ATX section.") || strings.Contains(atxSection.Content, "Outside section.") {
		t.Fatalf("indented ATX/closing hashes/case-normalized section = %#v, %v", atxSection, err)
	}
	setextSection, err := resolver.Resolve(headingLinks[1])
	if err != nil || !strings.Contains(setextSection.Content, "Inside setext section.") || strings.Contains(setextSection.Content, "Next Section") || strings.Contains(setextSection.Content, "Outside section.") {
		t.Fatalf("setext section must stop before the next same-level setext heading: %#v, %v", setextSection, err)
	}
}

func TestLinkService_RebuildIndex_ExcludesOutsideVaultSymlinks(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	outsideDir, err := os.MkdirTemp("", "obails-link-outside-*")
	if err != nil {
		t.Fatalf("MkdirTemp outside vault: %v", err)
	}
	defer os.RemoveAll(outsideDir)
	outsideFile := filepath.Join(outsideDir, "external.md")
	if err := os.WriteFile(outsideFile, []byte("[[target]]\nTarget is private.\n"), 0600); err != nil {
		t.Fatalf("WriteFile outside target: %v", err)
	}
	if err := os.Mkdir(filepath.Join(outsideDir, "nested"), 0700); err != nil {
		t.Fatalf("Mkdir outside directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(outsideDir, "nested", "hidden.md"), []byte("# Hidden"), 0600); err != nil {
		t.Fatalf("WriteFile outside nested target: %v", err)
	}
	if err := os.Symlink(outsideFile, filepath.Join(tmpDir, "external.md")); err != nil {
		t.Fatalf("Symlink outside file: %v", err)
	}
	if err := os.Symlink(filepath.Join(outsideDir, "nested"), filepath.Join(tmpDir, "external-directory")); err != nil {
		t.Fatalf("Symlink outside directory: %v", err)
	}
	if err := fs.CreateFile("target.md", "# Target"); err != nil {
		t.Fatalf("CreateFile target: %v", err)
	}
	if err := fs.CreateFile("source.md", "![[external]]\n[[external]]"); err != nil {
		t.Fatalf("CreateFile source: %v", err)
	}

	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex: %v", err)
	}
	snapshot := ls.GetLinkIndexSnapshot()
	if _, exists := snapshot.Links["external.md"]; exists {
		t.Fatalf("outside-vault file symlink must not enter the index: %#v", snapshot.Links)
	}
	if _, exists := snapshot.Links["external-directory/hidden.md"]; exists {
		t.Fatalf("outside-vault directory symlink must not enter the index: %#v", snapshot.Links)
	}
	links, err := ls.GetLinkInfo("source.md")
	if err != nil || len(links) != 2 {
		t.Fatalf("GetLinkInfo source = %#v, %v", links, err)
	}
	for _, link := range links {
		if link.Exists || link.TargetPath != "" {
			t.Fatalf("outside-vault symlink target must remain unresolved: %#v", link)
		}
	}
	if _, err := NewTransclusionService(ls).Resolve(links[0]); !errors.Is(err, ErrUnresolvedTransclusion) {
		t.Fatalf("outside-vault symlink embed must fail closed, got %v", err)
	}
	for _, mention := range ls.GetUnlinkedMentions("target").Mentions {
		if mention.SourcePath == "external.md" || strings.HasPrefix(mention.SourcePath, "external-directory/") {
			t.Fatalf("outside-vault symlink content must not produce an unlinked mention: %#v", mention)
		}
	}
	for _, node := range NewGraphService(ls, fs, nil).GetFullGraph().Nodes {
		if node.Path == "external.md" || strings.HasPrefix(node.Path, "external-directory/") {
			t.Fatalf("outside-vault symlink must not produce a graph node: %#v", node)
		}
	}
	rewrites, err := prepareLinkRewritesForMove(tmpDir, "target.md", "renamed.md", false)
	if err != nil {
		t.Fatalf("prepareLinkRewritesForMove: %v", err)
	}
	if _, exists := rewrites["external.md"]; exists {
		t.Fatalf("outside-vault symlink must not become a rewrite candidate: %#v", rewrites)
	}
}

func TestLinkService_RebuildIndex_KeepsPublishedGenerationOnWalkFailure(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	if err := fs.CreateFile("source.md", "[[target]]"); err != nil {
		t.Fatalf("CreateFile source: %v", err)
	}
	if err := fs.CreateFile("target.md", "# Target"); err != nil {
		t.Fatalf("CreateFile target: %v", err)
	}
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex G1: %v", err)
	}
	first := ls.GetLinkIndexSnapshot()

	blockedDir := filepath.Join(tmpDir, "blocked")
	if err := os.Mkdir(blockedDir, 0700); err != nil {
		t.Fatalf("Mkdir blocked directory: %v", err)
	}
	if err := os.WriteFile(filepath.Join(blockedDir, "unreadable.md"), []byte("# Unreadable"), 0600); err != nil {
		t.Fatalf("WriteFile unreadable file: %v", err)
	}
	if err := os.Chmod(blockedDir, 0000); err != nil {
		t.Fatalf("Chmod blocked directory: %v", err)
	}
	defer os.Chmod(blockedDir, 0700)
	if _, err := os.ReadDir(blockedDir); err == nil {
		t.Fatal("the real filesystem did not reject the unreadable test directory")
	}

	if err := ls.RebuildIndex(); err == nil {
		t.Fatal("a filesystem walk failure must fail the rebuild")
	}
	second := ls.GetLinkIndexSnapshot()
	if !second.Ready || second.Rebuilding || second.Generation != first.Generation {
		t.Fatalf("failed rebuild must retain G1 unchanged: first=%#v second=%#v", first.LinkIndexState, second.LinkIndexState)
	}
	if got := second.Links["source.md"]; len(got) != 1 || !got[0].Exists || got[0].TargetPath != "target.md" {
		t.Fatalf("failed rebuild must retain G1 links: %#v", second.Links)
	}
}

func TestLinkService_RebuildIndex_KeepsPublishedGenerationOnReadFailure(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	if err := fs.CreateFile("source.md", "[[target]]"); err != nil {
		t.Fatalf("CreateFile source: %v", err)
	}
	if err := fs.CreateFile("target.md", "# Target"); err != nil {
		t.Fatalf("CreateFile target: %v", err)
	}
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex G1: %v", err)
	}
	first := ls.GetLinkIndexSnapshot()

	unreadablePath := filepath.Join(tmpDir, "unreadable.md")
	if err := os.WriteFile(unreadablePath, []byte("# Unreadable"), 0600); err != nil {
		t.Fatalf("WriteFile unreadable file: %v", err)
	}
	if err := os.Chmod(unreadablePath, 0000); err != nil {
		t.Fatalf("Chmod unreadable file: %v", err)
	}
	defer os.Chmod(unreadablePath, 0600)
	if _, err := os.ReadFile(unreadablePath); err == nil {
		t.Fatal("the real filesystem did not reject the unreadable test file")
	}

	if err := ls.RebuildIndex(); err == nil {
		t.Fatal("a file read failure must fail the rebuild")
	}
	second := ls.GetLinkIndexSnapshot()
	if !second.Ready || second.Rebuilding || second.Generation != first.Generation {
		t.Fatalf("failed rebuild must retain G1 unchanged: first=%#v second=%#v", first.LinkIndexState, second.LinkIndexState)
	}
	if got := second.Links["source.md"]; len(got) != 1 || !got[0].Exists || got[0].TargetPath != "target.md" {
		t.Fatalf("failed rebuild must retain G1 links: %#v", second.Links)
	}
}

func TestLinkService_RebuildIndex_PreservesRawContentWhenFrontmatterIsInvalid(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	invalid := "---\naliases: [unterminated\ntags: [also unterminated\n---\n# Invalid\n#inline-tag\n"
	if err := fs.CreateFile("invalid.md", invalid); err != nil {
		t.Fatalf("CreateFile invalid frontmatter: %v", err)
	}
	if err := fs.CreateFile("source.md", "[[Bad alias]] ![[invalid]]"); err != nil {
		t.Fatalf("CreateFile source: %v", err)
	}
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex: %v", err)
	}
	if _, resolved := ls.ResolveLink("Bad alias"); resolved {
		t.Fatal("invalid frontmatter aliases must not enter the index")
	}
	for _, node := range NewGraphService(ls, fs, nil).GetFullGraph().Nodes {
		if node.Path == "invalid.md" && len(node.Tags) != 0 {
			t.Fatalf("invalid frontmatter tags must be empty: %#v", node)
		}
	}
	links, err := ls.GetLinkInfo("source.md")
	if err != nil || len(links) != 2 {
		t.Fatalf("GetLinkInfo source = %#v, %v", links, err)
	}
	result, err := NewTransclusionService(ls).Resolve(links[1])
	if err != nil || result.Content != invalid {
		t.Fatalf("invalid frontmatter must retain raw indexed content for transclusion: %#v, %v", result, err)
	}
}

func TestLinkService_ParsesEmbedAttachmentMetadataAndWikiImageDimensions(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateFile("report.pdf", "pdf")
	fs.CreateFile("recording.mp3", "audio")
	fs.CreateFile("image.png", "image")
	fs.CreateFile("source.md", "![[report.pdf]] ![[recording.mp3]] ![[image.png|300]] ![[image.png|300x200]] ![[image.png|caption]] ![Markdown](image.png|300) ![[../../outside.png|300]] ![[image.png|0]] ![[image.png|-1]] ![[image.png|300x]] ![[image.png|x200]] ![[image.png|999999999999999999999999999999999999]]")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}
	links, err := ls.GetLinkInfo("source.md")
	if err != nil {
		t.Fatalf("GetLinkInfo failed: %v", err)
	}
	if len(links) != 12 {
		t.Fatalf("expected twelve parsed embeds/links, got %#v", links)
	}
	if link := links[0]; !link.IsEmbed || link.Kind != "wikilink" || !link.Exists || link.TargetPath != "report.pdf" {
		t.Errorf("PDF embed metadata = %#v", link)
	}
	if link := links[1]; !link.IsEmbed || link.Kind != "wikilink" || !link.Exists || link.TargetPath != "recording.mp3" {
		t.Errorf("audio embed metadata = %#v", link)
	}
	if link := links[2]; link.Width == nil || *link.Width != 300 || link.Height != nil || link.Alias != "" {
		t.Errorf("width-only Wiki image dimensions = %#v", link)
	}
	if link := links[3]; link.Width == nil || *link.Width != 300 || link.Height == nil || *link.Height != 200 || link.Alias != "" {
		t.Errorf("width-height Wiki image dimensions = %#v", link)
	}
	if link := links[4]; link.Width != nil || link.Height != nil || link.Alias != "caption" {
		t.Errorf("Wiki image alias must not become dimensions: %#v", link)
	}
	if link := links[5]; link.Width != nil || link.Height != nil || link.Kind != "markdown" {
		t.Errorf("Markdown image does not have Wiki dimensions semantics: %#v", link)
	}
	if link := links[6]; link.Exists || link.TargetPath != "" {
		t.Errorf("outside-vault image target must not resolve: %#v", link)
	}
	for _, link := range links[7:] {
		if link.Width != nil || link.Height != nil || link.Alias == "" {
			t.Errorf("invalid Wiki image dimensions must remain aliases: %#v", link)
		}
	}
}

func newTestLinkService(t *testing.T) (*LinkService, *FileService, string) {
	t.Helper()
	tmpDir, err := os.MkdirTemp("", "obails-link-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	cs := &ConfigService{
		configPath: filepath.Join(tmpDir, "config.toml"),
		config: &models.Config{
			Vault: models.VaultConfig{
				Path: tmpDir,
			},
		},
	}

	fs := NewFileService(cs)
	ls := NewLinkService(fs, cs)
	return ls, fs, tmpDir
}

func TestLinkService_ParseLinks(t *testing.T) {
	ls, _, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	tests := []struct {
		name     string
		content  string
		expected []string
	}{
		{
			name:     "single link",
			content:  "Check out [[My Note]]",
			expected: []string{"My Note"},
		},
		{
			name:     "multiple links",
			content:  "See [[Note A]] and [[Note B]] for details",
			expected: []string{"Note A", "Note B"},
		},
		{
			name:     "link with alias",
			content:  "Click [[actual-note|display text]] here",
			expected: []string{"actual-note"},
		},
		{
			name:     "link with heading",
			content:  "Jump to [[Note#Section]]",
			expected: []string{"Note"},
		},
		{
			name:     "link with alias and heading",
			content:  "See [[My Note#Intro|Introduction]]",
			expected: []string{"My Note"},
		},
		{
			name:     "no links",
			content:  "This is plain text",
			expected: nil,
		},
		{
			name:     "duplicate links deduplicated",
			content:  "[[Same]] and [[Same]] again",
			expected: []string{"Same"},
		},
		{
			name:     "nested brackets ignored",
			content:  "[[Valid]] but [not a link]",
			expected: []string{"Valid"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			links := ls.ParseLinks(tt.content)

			if len(links) != len(tt.expected) {
				t.Errorf("Expected %d links, got %d: %v", len(tt.expected), len(links), links)
				return
			}

			for i, expected := range tt.expected {
				if links[i] != expected {
					t.Errorf("Link %d: expected %q, got %q", i, expected, links[i])
				}
			}
		})
	}
}

func TestLinkService_ResolveLink(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup test files
	fs.CreateFile("root-note.md", "# Root Note")
	fs.CreateFile("folder/nested-note.md", "# Nested Note")
	fs.CreateFile("Another Note.md", "# Another Note")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}

	t.Run("resolve exact path", func(t *testing.T) {
		path, exists := ls.ResolveLink("root-note")
		if !exists {
			t.Error("Should resolve existing file")
		}
		if path != "root-note.md" {
			t.Errorf("Unexpected path: %s", path)
		}
	})

	t.Run("resolve with .md extension", func(t *testing.T) {
		path, exists := ls.ResolveLink("root-note.md")
		if !exists {
			t.Error("Should resolve with explicit extension")
		}
		if path != "root-note.md" {
			t.Errorf("Unexpected path: %s", path)
		}
	})

	t.Run("resolve nested file by name", func(t *testing.T) {
		path, exists := ls.ResolveLink("nested-note")
		if !exists {
			t.Error("Should resolve nested file")
		}
		if path != "folder/nested-note.md" {
			t.Errorf("Unexpected path: %s", path)
		}
	})

	t.Run("resolve file with spaces", func(t *testing.T) {
		path, exists := ls.ResolveLink("Another Note")
		if !exists {
			t.Error("Should resolve file with spaces")
		}
		if path != "Another Note.md" {
			t.Errorf("Unexpected path: %s", path)
		}
	})

	t.Run("non-existent file", func(t *testing.T) {
		_, exists := ls.ResolveLink("ghost")
		if exists {
			t.Error("Should not resolve non-existent file")
		}
	})
}

func TestLinkService_RebuildIndex(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup test vault structure
	fs.CreateFile("note-a.md", "# Note A\n\nLinks to [[note-b]] and [[note-c]]")
	fs.CreateFile("note-b.md", "# Note B\n\nLinks back to [[note-a]]")
	fs.CreateFile("note-c.md", "# Note C\n\nNo outgoing links")
	fs.CreateFile("folder/note-d.md", "# Note D\n\nLinks to [[note-a]]")

	t.Run("rebuild index", func(t *testing.T) {
		err := ls.RebuildIndex()
		if err != nil {
			t.Fatalf("RebuildIndex failed: %v", err)
		}

		stats := ls.GetIndexStats()
		if stats["totalFiles"] != 4 {
			t.Errorf("Expected 4 files indexed, got %d", stats["totalFiles"])
		}
	})

	t.Run("get backlinks", func(t *testing.T) {
		ls.RebuildIndex()

		backlinks := ls.GetBacklinks("note-a.md")

		// note-b and note-d link to note-a
		if len(backlinks) < 2 {
			t.Errorf("Expected at least 2 backlinks, got %d", len(backlinks))
		}

		// Verify backlink sources
		sources := make(map[string]bool)
		for _, bl := range backlinks {
			sources[bl.SourcePath] = true
		}

		if !sources["note-b.md"] {
			t.Error("note-b.md should be a backlink source")
		}
		if !sources["folder/note-d.md"] {
			t.Error("folder/note-d.md should be a backlink source")
		}
	})

	t.Run("no backlinks for unlinked note", func(t *testing.T) {
		ls.RebuildIndex()

		backlinks := ls.GetBacklinks("note-c.md")
		// note-a links to note-c
		if len(backlinks) != 1 {
			t.Errorf("Expected 1 backlink to note-c, got %d", len(backlinks))
		}
	})

	t.Run("resolved links use indexed paths after rebuild", func(t *testing.T) {
		ls.RebuildIndex()

		path, exists := ls.ResolveLink("note-d")
		if !exists {
			t.Fatal("Expected indexed nested note to resolve")
		}
		if path != "folder/note-d.md" {
			t.Errorf("Expected folder/note-d.md, got %q", path)
		}
	})
}

func TestLinkService_GetLinkInfo(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup
	fs.CreateFile("source.md", "# Source\n\nLinks to [[existing]] and [[missing]]")
	fs.CreateFile("existing.md", "# Existing Note")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}

	t.Run("get link info with mixed existence", func(t *testing.T) {
		links, err := ls.GetLinkInfo("source.md")
		if err != nil {
			t.Fatalf("GetLinkInfo failed: %v", err)
		}

		if len(links) != 2 {
			t.Fatalf("Expected 2 links, got %d", len(links))
		}

		// Check existing link
		existingFound := false
		missingFound := false
		for _, link := range links {
			if link.Text == "existing" {
				existingFound = true
				if !link.Exists {
					t.Error("'existing' link should exist")
				}
			}
			if link.Text == "missing" {
				missingFound = true
				if link.Exists {
					t.Error("'missing' link should not exist")
				}
			}
		}

		if !existingFound {
			t.Error("'existing' link not found")
		}
		if !missingFound {
			t.Error("'missing' link not found")
		}
	})
}

func TestLinkService_BacklinkContext(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup
	fs.CreateFile("source.md", "# Source\n\nSome context around [[target]] link here")
	fs.CreateFile("target.md", "# Target Note")

	ls.RebuildIndex()

	t.Run("backlink includes context", func(t *testing.T) {
		backlinks := ls.GetBacklinks("target.md")

		if len(backlinks) == 0 {
			t.Fatal("Expected at least one backlink")
		}

		if backlinks[0].Context == "" {
			t.Error("Backlink should include context")
		}

		if backlinks[0].SourceTitle != "source" {
			t.Errorf("Expected source title 'source', got '%s'", backlinks[0].SourceTitle)
		}
	})
}

func TestLinkService_HiddenFilesIgnored(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup with hidden file
	fs.CreateFile("visible.md", "# Visible\n\nLinks to [[hidden]]")
	fs.CreateFile(".hidden.md", "# Hidden\n\nLinks to [[visible]]")

	ls.RebuildIndex()

	stats := ls.GetIndexStats()
	if stats["totalFiles"] != 1 {
		t.Errorf("Expected 1 file (hidden ignored), got %d", stats["totalFiles"])
	}
}

func TestLinkService_ConcurrentAccess(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	// Setup
	fs.CreateFile("note.md", "# Note\n\n[[link]]")

	// Run concurrent operations
	done := make(chan bool)

	go func() {
		for i := 0; i < 10; i++ {
			ls.RebuildIndex()
		}
		done <- true
	}()

	go func() {
		for i := 0; i < 10; i++ {
			ls.GetBacklinks("note.md")
		}
		done <- true
	}()

	go func() {
		for i := 0; i < 10; i++ {
			ls.GetIndexStats()
		}
		done <- true
	}()

	// Wait for all goroutines
	<-done
	<-done
	<-done

	// If we get here without deadlock/panic, test passes
}

func TestLinkService_RebuildIndex_ParsesOnlyRenderableInternalLinks(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateFile("source.md", "`[[inline-code]]`\n\n```md\n[[fenced-code]]\n```\n\n[[wiki-target#Heading|Wiki alias]]\n[Markdown label](markdown-target.md#Nested%20heading)\n![Photo](attachments/photo.png)\n[[block-target#^block-id]]\n[[unsafe|<em>raw alias</em>]]")
	fs.CreateFile("wiki-target.md", "# Wiki")
	fs.CreateFile("markdown-target.md", "# Markdown")
	fs.CreateFile("block-target.md", "# Block")
	fs.CreateFile("unsafe.md", "# Unsafe")
	fs.CreateFile("attachments/photo.png", "image bytes")

	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}

	links, err := ls.GetLinkInfo("source.md")
	if err != nil {
		t.Fatalf("GetLinkInfo failed: %v", err)
	}

	if len(links) != 5 {
		t.Fatalf("expected five renderable internal links, got %d: %#v", len(links), links)
	}
	for _, ignored := range []string{"inline-code", "fenced-code"} {
		for _, link := range links {
			if link.Text == ignored {
				t.Errorf("code-region link %q must not be indexed", ignored)
			}
		}
	}

	expectedTargets := map[string]string{
		"wiki-target":           "wiki-target.md",
		"markdown-target.md":    "markdown-target.md",
		"attachments/photo.png": "attachments/photo.png",
		"block-target":          "block-target.md",
	}
	for _, link := range links {
		if expectedPath, ok := expectedTargets[link.Text]; ok {
			if !link.Exists || link.TargetPath != expectedPath {
				t.Errorf("link %q resolved to %q (exists %t), want %q", link.Text, link.TargetPath, link.Exists, expectedPath)
			}
		}
	}

	byText := make(map[string]models.Link, len(links))
	for _, link := range links {
		byText[link.Text] = link
	}
	if link := byText["wiki-target"]; link.Alias != "Wiki alias" || link.Fragment != "Heading" || link.FragmentType != "heading" || link.Kind != "wikilink" {
		t.Errorf("wikilink structure was not retained: %#v", link)
	}
	if link := byText["markdown-target.md"]; link.Alias != "Markdown label" || link.Fragment != "Nested heading" || link.FragmentType != "heading" || link.Kind != "markdown" {
		t.Errorf("Markdown link structure was not retained: %#v", link)
	}
	if link := byText["block-target"]; link.Fragment != "block-id" || link.FragmentType != "block" {
		t.Errorf("block fragment structure was not retained: %#v", link)
	}
	if link := byText["attachments/photo.png"]; !link.IsEmbed || link.Kind != "markdown" {
		t.Errorf("attachment structure was not retained: %#v", link)
	}
	if link := byText["unsafe"]; link.Alias != "<em>raw alias</em>" || link.Raw != "[[unsafe|<em>raw alias</em>]]" {
		t.Errorf("vault-controlled display text must remain raw structured data: %#v", link)
	}
}

func TestLinkService_RebuildIndex_ResolvesPercentEncodedWikiEmbedPath(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	destinationPath := "attachments/日本語 folder/photo #1 |[draft].png"
	if err := fs.CreateFile(destinationPath, "binary-safe fixture"); err != nil {
		t.Fatalf("create attachment fixture: %v", err)
	}
	if err := fs.CreateFile("source.md", "![[attachments/%E6%97%A5%E6%9C%AC%E8%AA%9E%20folder/photo%20%231%20%7C%5Bdraft%5D.png]]\n[[attachments/bad%ZZ.png]]"); err != nil {
		t.Fatalf("create source fixture: %v", err)
	}
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex: %v", err)
	}

	links, err := ls.GetLinkInfo("source.md")
	if err != nil {
		t.Fatalf("GetLinkInfo: %v", err)
	}
	if len(links) != 2 {
		t.Fatalf("links = %#v, want the valid embed and unresolved invalid escape", links)
	}
	link := links[0]
	if !link.IsEmbed || !link.Exists || link.Text != destinationPath || link.TargetPath != destinationPath {
		t.Fatalf("encoded Wiki embed did not resolve to its attachment: %#v", link)
	}
	if unresolved := links[1]; unresolved.Exists || unresolved.Text != "attachments/bad%ZZ.png" {
		t.Fatalf("invalid escape link must remain unresolved with raw text: %#v", unresolved)
	}
}

func TestLinkService_RebuildIndex_AssignsDuplicateBacklinkToResolvedWinnerOnly(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateFile("folder-a/shared.md", "# A")
	fs.CreateFile("folder-b/shared.md", "# B")
	fs.CreateFile("source.md", "[[shared]]")

	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}

	winner, resolved := ls.ResolveLink("shared")
	if !resolved {
		t.Fatal("shared must resolve under the existing single-winner policy")
	}
	loser := "folder-a/shared.md"
	if winner == loser {
		loser = "folder-b/shared.md"
	}

	if backlinks := ls.GetBacklinks(winner); len(backlinks) != 1 || backlinks[0].SourcePath != "source.md" {
		t.Fatalf("resolved winner %q must own source backlink exactly once, got %#v", winner, backlinks)
	}
	if backlinks := ls.GetBacklinks(loser); len(backlinks) != 0 {
		t.Errorf("non-winner %q must not receive the resolved backlink: %#v", loser, backlinks)
	}
}

func TestLinkService_IndexReadinessAndSnapshots(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	if state := ls.GetIndexState(); state.Ready || state.Generation != 0 || state.Rebuilding {
		t.Fatalf("new link index must be not-ready generation zero: %#v", state)
	}
	if result := ls.GetBacklinksFromSnapshot(ls.GetLinkIndexSnapshot(), "target.md"); result.Ready || len(result.Backlinks) != 0 {
		t.Fatalf("not-ready backlink response must not masquerade as an empty published index: %#v", result)
	}

	fs.CreateFile("source.md", "[[target]]")
	fs.CreateFile("target.md", "# Target")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("first RebuildIndex failed: %v", err)
	}
	first := ls.GetLinkIndexSnapshot()
	if !first.Ready || first.Generation != 1 {
		t.Fatalf("first published index must be ready generation one: %#v", first.LinkIndexState)
	}

	fs.CreateFile("source.md", "[[target]]\n[[second]]")
	fs.CreateFile("second.md", "# Second")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("second RebuildIndex failed: %v", err)
	}
	second := ls.GetLinkIndexSnapshot()
	if second.Generation != first.Generation+1 {
		t.Fatalf("each published rebuild must advance generation: first=%d second=%d", first.Generation, second.Generation)
	}
	if got := len(first.Links["source.md"]); got != 1 {
		t.Errorf("previous snapshot must remain immutable after a rebuild, got %d links", got)
	}
	if got := ls.GetBacklinksFromSnapshot(first, "target.md"); !got.Ready || got.Generation != first.Generation || len(got.Backlinks) != 1 {
		t.Errorf("backlinks must read from the supplied generation: %#v", got)
	}
}

func TestLinkService_RebuildIndex_IndexesMarkdownExtension(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateFile("source.markdown", "[[target]]")
	fs.CreateFile("target.markdown", "# Target")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}

	if links, err := ls.GetLinkInfo("source.markdown"); err != nil || len(links) != 1 || !links[0].Exists || links[0].TargetPath != "target.markdown" {
		t.Fatalf(".markdown source must participate in link indexing: links=%#v err=%v", links, err)
	}
	if backlinks := ls.GetBacklinks("target.markdown"); len(backlinks) != 1 || backlinks[0].SourcePath != "source.markdown" {
		t.Fatalf(".markdown source must participate in backlinks: %#v", backlinks)
	}
}

func TestLinkService_RebuildIndex_ResolvesFrontmatterAliases(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateFile("scalar.md", "---\naliases: Scalar alias\nalias: [Inline list alias]\n---\n# Scalar")
	fs.CreateFile("list.md", "---\nalias: Scalar property alias\naliases:\n  - List alias one\n  - List alias two\n---\n# List")
	fs.CreateFile("source.md", "[[Scalar alias]] [[Inline list alias]] [[Scalar property alias]] [[List alias one]] [[List alias two]]")

	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}

	expected := map[string]string{
		"Scalar alias":          "scalar.md",
		"Inline list alias":     "scalar.md",
		"Scalar property alias": "list.md",
		"List alias one":        "list.md",
		"List alias two":        "list.md",
	}
	for alias, targetPath := range expected {
		if resolved, ok := ls.ResolveLink(alias); !ok || resolved != targetPath {
			t.Errorf("ResolveLink(%q) = %q, %t; want %q, true", alias, resolved, ok, targetPath)
		}
	}
	links, err := ls.GetLinkInfo("source.md")
	if err != nil {
		t.Fatalf("GetLinkInfo failed: %v", err)
	}
	for _, link := range links {
		if targetPath, ok := expected[link.Text]; !ok || !link.Exists || link.TargetPath != targetPath {
			t.Errorf("GetLinkInfo did not resolve alias %#v", link)
		}
	}
}

func TestLinkService_RebuildIndex_ResolvesURLEncodedMarkdownDestination(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateFile("Note Name.md", "# Target")
	fs.CreateFile("source.md", "[Encoded destination](Note%20Name.md)")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}

	if resolved, ok := ls.ResolveLink("Note%20Name.md"); !ok || resolved != "Note Name.md" {
		t.Fatalf("ResolveLink must decode URL-encoded path: %q, %t", resolved, ok)
	}
	links, err := ls.GetLinkInfo("source.md")
	if err != nil || len(links) != 1 || !links[0].Exists || links[0].TargetPath != "Note Name.md" {
		t.Fatalf("GetLinkInfo must resolve URL-encoded Markdown destination: links=%#v err=%v", links, err)
	}
}

func TestLinkService_RebuildIndex_ResolvesParentRelativeMarkdownDestination(t *testing.T) {
	ls, fs, tmpDir := newTestLinkService(t)
	defer os.RemoveAll(tmpDir)

	fs.CreateFile("folder/source.md", "[parent](../target.md)")
	fs.CreateFile("target.md", "# Target")
	if err := ls.RebuildIndex(); err != nil {
		t.Fatalf("RebuildIndex failed: %v", err)
	}

	links, err := ls.GetLinkInfo("folder/source.md")
	if err != nil || len(links) != 1 || !links[0].Exists || links[0].TargetPath != "target.md" {
		t.Fatalf("parent-relative Markdown destination must resolve within the vault: links=%#v err=%v", links, err)
	}
	if backlinks := ls.GetBacklinks("target.md"); len(backlinks) != 1 || backlinks[0].SourcePath != "folder/source.md" {
		t.Fatalf("parent-relative target must receive the source backlink: %#v", backlinks)
	}
}
