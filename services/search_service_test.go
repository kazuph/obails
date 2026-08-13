package services

import (
	"os"
	"testing"

	"github.com/kazuph/obails/models"
)

func TestSearchService_SearchSyntax(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	if err := fs.WriteFile("notes/Alpha.md", "---\nstatus: Draft\naliases: Captain\nempty: \n---\n# Roadmap\n#work\nAlpha beta\nAlpha gamma\n- [ ] call client\n- [x] call archive\n"); err != nil {
		t.Fatal(err)
	}
	if err := fs.WriteFile("notes/Beta.markdown", "---\nstatus: Published\n---\n# Archive\n#home\nBeta only\n- [ ] email team\n"); err != nil {
		t.Fatal(err)
	}
	if err := fs.WriteFile("code.md", "```\n#work\n```\nMiXeD Alpha\n"); err != nil {
		t.Fatal(err)
	}

	search := NewSearchService(cs)
	for _, tt := range []struct {
		name  string
		query string
		paths []string
	}{
		{"plain term", "alpha", []string{"notes/Alpha.md", "code.md"}},
		{"exact phrase", `"Alpha beta"`, []string{"notes/Alpha.md"}},
		{"implicit AND", "Alpha beta", []string{"notes/Alpha.md"}},
		{"OR", "gamma OR Beta", []string{"notes/Alpha.md", "notes/Beta.markdown"}},
		{"negation", "Alpha -gamma", []string{"code.md"}},
		{"grouping and precedence", "Alpha OR Beta gamma", []string{"notes/Alpha.md", "code.md"}},
		{"grouping overrides precedence", "(Alpha OR Beta) gamma", []string{"notes/Alpha.md"}},
		{"regex", `/Alpha\s+(beta|gamma)/`, []string{"notes/Alpha.md"}},
		{"file", "file:Alpha", []string{"notes/Alpha.md"}},
		{"path", `path:"notes/Beta"`, []string{"notes/Beta.markdown"}},
		{"content", "content:gamma", []string{"notes/Alpha.md"}},
		{"match case", "match-case:MiXeD", []string{"code.md"}},
		{"ignore case", "ignore-case:mixed", []string{"code.md"}},
		{"tag excludes code", "tag:#work", []string{"notes/Alpha.md"}},
		{"line", "line:(Alpha beta)", []string{"notes/Alpha.md"}},
		{"block", "block:(Alpha beta)", []string{"notes/Alpha.md"}},
		{"section", "section:(Alpha gamma)", []string{"notes/Alpha.md"}},
		{"task", "task:call", []string{"notes/Alpha.md"}},
		{"task todo", "task-todo:call", []string{"notes/Alpha.md"}},
		{"task done", "task-done:archive", []string{"notes/Alpha.md"}},
		{"property exists", "[aliases]", []string{"notes/Alpha.md"}},
		{"property value", "[status:Draft]", []string{"notes/Alpha.md"}},
		{"property value expression", "[status:Draft OR Published]", []string{"notes/Alpha.md", "notes/Beta.markdown"}},
		{"property null", "[empty:null]", []string{"notes/Alpha.md"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			results, err := search.Search(models.SearchOptions{Query: tt.query})
			if err != nil {
				t.Fatalf("Search(%q): %v", tt.query, err)
			}
			if got := searchResultPaths(results); !sameStrings(got, tt.paths) {
				t.Errorf("Search(%q) paths = %v, want %v", tt.query, got, tt.paths)
			}
		})
	}
}

func TestSearchService_SearchEscapingErrorsAndUnicodeContext(t *testing.T) {
	cs, tmpDir := newTestConfigService(t)
	defer os.RemoveAll(tmpDir)

	fs := NewFileService(cs)
	if err := fs.WriteFile("quote.markdown", "She said \"hello\" to café猫\n"); err != nil {
		t.Fatal(err)
	}
	search := NewSearchService(cs)

	results, err := search.Search(models.SearchOptions{Query: `"said \"hello\""`, ContextRunes: 12})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Context != "She said \"he…" {
		t.Fatalf("escaped phrase context = %#v", results)
	}
	results, err = search.Search(models.SearchOptions{Query: "猫", ContextRunes: 24})
	if err != nil {
		t.Fatal(err)
	}
	if len(results) != 1 || results[0].Context != "She said \"hello\" to café…" {
		t.Fatalf("unicode context = %#v", results)
	}
	if _, err := search.Search(models.SearchOptions{Query: "/("}); err == nil {
		t.Fatal("invalid regex must return an error")
	}
	if _, err := search.Search(models.SearchOptions{Query: "(alpha"}); err == nil {
		t.Fatal("unclosed group must return an error")
	}
}

func searchResultPaths(results []models.VaultSearchResult) []string {
	paths := make([]string, len(results))
	for i, result := range results {
		paths[i] = result.Path
	}
	return paths
}

func sameStrings(got, want []string) bool {
	if len(got) != len(want) {
		return false
	}
	for i := range got {
		if got[i] != want[i] {
			return false
		}
	}
	return true
}
