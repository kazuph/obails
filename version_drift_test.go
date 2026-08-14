package main

import (
	"os"
	"strings"
	"testing"
)

func TestCanonicalVersionSourcesMatchApplicationVersion(t *testing.T) {
	if applicationVersion == "" || strings.Contains(applicationVersion, " ") {
		t.Fatalf("applicationVersion = %q, want a dotted product version", applicationVersion)
	}
	windowsFourPart := applicationVersion + ".0"
	for _, source := range []struct {
		path    string
		needles []string
	}{
		{path: "build/config.yml", needles: []string{`version: "` + applicationVersion + `"`}},
		{path: "package.json", needles: []string{`"version": "` + applicationVersion + `"`}},
		{path: "frontend/package.json", needles: []string{`"version": "` + applicationVersion + `"`}},
		{path: "cmd/cli/root.go", needles: []string{`version = "` + applicationVersion + `"`}},
		{path: "build/darwin/Info.plist", needles: []string{
			"<string>" + applicationVersion + "</string>",
		}},
		{path: "build/darwin/Info.dev.plist", needles: []string{
			"<string>" + applicationVersion + "</string>",
		}},
		{path: "build/ios/Info.plist", needles: []string{
			"<string>" + applicationVersion + "</string>",
		}},
		{path: "build/ios/Info.dev.plist", needles: []string{
			"<string>" + applicationVersion + "</string>",
		}},
		{path: "build/ios/build.sh", needles: []string{
			`VERSION="` + applicationVersion + `"`,
			`BUILD_NUMBER="` + applicationVersion + `"`,
		}},
		{path: "build/linux/nfpm/nfpm.yaml", needles: []string{`version: "` + applicationVersion + `"`}},
		{path: "build/windows/info.json", needles: []string{
			`"file_version": "` + applicationVersion + `"`,
			`"ProductVersion": "` + applicationVersion + `"`,
		}},
		{path: "build/windows/wails.exe.manifest", needles: []string{`version="` + applicationVersion + `"`}},
		{path: "build/windows/msix/template.xml", needles: []string{`Version="` + windowsFourPart + `"`}},
		{path: "build/windows/msix/app_manifest.xml", needles: []string{`Version="` + windowsFourPart + `"`}},
		{path: "build/windows/nsis/wails_tools.nsh", needles: []string{`INFO_PRODUCTVERSION "` + applicationVersion + `"`}},
		{path: "build/windows/nsis/project.nsi", needles: []string{`INFO_PRODUCTVERSION "` + applicationVersion + `"`}},
	} {
		body, err := os.ReadFile(source.path)
		if err != nil {
			t.Fatalf("read %s: %v", source.path, err)
		}
		text := string(body)
		for _, needle := range source.needles {
			if !strings.Contains(text, needle) {
				t.Errorf("%s missing %q", source.path, needle)
			}
		}
	}
}
