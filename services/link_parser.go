package services

import (
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"github.com/kazuph/obails/models"
)

// parseInternalLinks scans Markdown structure needed for internal links without treating code as content.
// No Markdown AST parser is present in the existing dependency graph, so this is a focused tokenizer.
func parseInternalLinks(content string) []models.Link {
	links := make([]models.Link, 0)
	inFence := false
	fenceMarker := byte(0)
	fenceLength := 0

	for _, line := range strings.Split(content, "\n") {
		marker, length, isFence := markdownFence(line)
		if inFence {
			if isFence && marker == fenceMarker && length >= fenceLength {
				inFence = false
			}
			continue
		}
		if isFence {
			inFence = true
			fenceMarker, fenceLength = marker, length
			continue
		}
		links = append(links, parseLineInternalLinks(line)...)
	}
	return links
}

func markdownFence(line string) (byte, int, bool) {
	trimmed := strings.TrimLeft(line, " \t")
	if len(trimmed) < 3 || (trimmed[0] != '`' && trimmed[0] != '~') {
		return 0, 0, false
	}
	length := 0
	for length < len(trimmed) && trimmed[length] == trimmed[0] {
		length++
	}
	return trimmed[0], length, length >= 3
}

func parseLineInternalLinks(line string) []models.Link {
	links := make([]models.Link, 0)
	for cursor := 0; cursor < len(line); {
		if line[cursor] == '`' {
			length := repeatedByteLength(line[cursor:], '`')
			end := strings.Index(line[cursor+length:], strings.Repeat("`", length))
			if end < 0 {
				break
			}
			cursor += length + end + length
			continue
		}

		if strings.HasPrefix(line[cursor:], "[[") {
			if end := strings.Index(line[cursor+2:], "]]"); end >= 0 {
				raw := line[cursor : cursor+end+4]
				if link, ok := parseWikiLink(raw, cursor > 0 && line[cursor-1] == '!'); ok {
					links = append(links, link)
				}
				cursor += end + 4
				continue
			}
		}

		start := cursor
		embed := false
		if line[cursor] == '!' && cursor+1 < len(line) && line[cursor+1] == '[' {
			embed = true
			cursor++
		}
		if line[cursor] == '[' && !strings.HasPrefix(line[cursor:], "[[") {
			if link, end, ok := parseMarkdownLink(line, cursor, embed, start); ok {
				links = append(links, link)
				cursor = end
				continue
			}
		}
		cursor = start + 1
	}
	return links
}

func repeatedByteLength(value string, marker byte) int {
	length := 0
	for length < len(value) && value[length] == marker {
		length++
	}
	return length
}

func parseWikiLink(raw string, embed bool) (models.Link, bool) {
	inner := raw[2 : len(raw)-2]
	target, alias, hasAlias := strings.Cut(inner, "|")
	link := newStructuredLink(target, "wikilink", embed, raw)
	if hasAlias {
		if width, height, dimensions := wikiEmbedDimensions(link.Text, embed, alias); dimensions {
			link.Width, link.Height = width, height
		} else {
			link.Alias = strings.TrimSpace(alias)
		}
	}
	return link, link.Text != ""
}

// wikiEmbedDimensions supports Obsidian-style image dimensions only for Wiki embeds.
// Markdown image destinations keep their label semantics because that syntax has no standard dimensions form.
func wikiEmbedDimensions(target string, embed bool, value string) (*int, *int, bool) {
	if !embed || !imageExtensions[strings.ToLower(filepath.Ext(target))] {
		return nil, nil, false
	}
	parts := strings.Split(strings.TrimSpace(value), "x")
	if len(parts) > 2 || len(parts) == 0 || parts[0] == "" {
		return nil, nil, false
	}
	width, err := strconv.Atoi(parts[0])
	if err != nil || width <= 0 {
		return nil, nil, false
	}
	if len(parts) == 1 {
		return &width, nil, true
	}
	if parts[1] == "" {
		return nil, nil, false
	}
	height, err := strconv.Atoi(parts[1])
	if err != nil || height <= 0 {
		return nil, nil, false
	}
	return &width, &height, true
}

func parseMarkdownLink(line string, labelStart int, embed bool, rawStart int) (models.Link, int, bool) {
	labelEnd := strings.IndexByte(line[labelStart:], ']')
	if labelEnd < 0 {
		return models.Link{}, rawStart + 1, false
	}
	labelEnd += labelStart
	if labelEnd+1 >= len(line) || line[labelEnd+1] != '(' {
		return models.Link{}, rawStart + 1, false
	}

	depth := 1
	cursor := labelEnd + 2
	for ; cursor < len(line); cursor++ {
		switch line[cursor] {
		case '(':
			depth++
		case ')':
			depth--
			if depth == 0 {
				raw := line[rawStart : cursor+1]
				link := newStructuredLink(markdownDestination(line[labelEnd+2:cursor]), "markdown", embed, raw)
				link.Alias = line[labelStart+1 : labelEnd]
				return link, cursor + 1, link.Text != ""
			}
		}
	}
	return models.Link{}, rawStart + 1, false
}

func markdownDestination(value string) string {
	value = strings.TrimSpace(value)
	if strings.HasPrefix(value, "<") {
		if end := strings.Index(value, ">"); end >= 0 {
			return value[1:end]
		}
	}
	if index := strings.IndexAny(value, " \t"); index >= 0 {
		return value[:index]
	}
	return value
}

func newStructuredLink(value, kind string, embed bool, raw string) models.Link {
	value = strings.TrimSpace(value)
	target, fragment, hasFragment := strings.Cut(value, "#")
	link := models.Link{Text: parseLinkTarget(target), Kind: kind, IsEmbed: embed, Raw: raw}
	if hasFragment {
		decoded, err := url.PathUnescape(strings.TrimSpace(fragment))
		if err == nil {
			fragment = decoded
		}
		link.Fragment = fragment
		link.FragmentType = "heading"
		if strings.HasPrefix(fragment, "^") {
			link.Fragment = strings.TrimPrefix(fragment, "^")
			link.FragmentType = "block"
		}
	}
	return link
}

func parseLinkTarget(value string) string {
	value = strings.TrimSpace(value)
	if fragmentStart := strings.IndexByte(value, '#'); fragmentStart >= 0 {
		value = value[:fragmentStart]
	}
	if value == "" || strings.HasPrefix(value, "#") || isExternalLink(value) {
		return ""
	}
	if decoded, err := url.PathUnescape(value); err == nil {
		value = decoded
	}
	return filepath.ToSlash(value)
}

func isExternalLink(value string) bool {
	lower := strings.ToLower(value)
	return strings.Contains(lower, "://") || strings.HasPrefix(lower, "mailto:") || strings.HasPrefix(lower, "data:")
}

// prepareLinkRewritesForMove resolves links against the pre-move vault, then
// returns only the Markdown files whose renderable internal links must change.
func prepareLinkRewritesForMove(vaultPath, sourcePath, destinationPath string, sourceIsDirectory bool) (map[string]string, error) {
	paths, err := vaultPathsForLinkRewrite(vaultPath)
	if err != nil {
		return nil, err
	}
	pathIndex := make(map[string]string, len(paths)*4)
	for _, path := range paths {
		registerPathIndex(pathIndex, path)
	}
	movedPaths := make([]string, 0, len(paths))
	for _, path := range paths {
		movedPaths = append(movedPaths, movedVaultPath(path, sourcePath, destinationPath, sourceIsDirectory))
	}
	sort.Strings(movedPaths)
	movedPathIndex := make(map[string]string, len(movedPaths)*4)
	for _, path := range movedPaths {
		registerPathIndex(movedPathIndex, path)
	}

	rewrites := make(map[string]string)
	for _, path := range paths {
		if !isMarkdownSource(path) {
			continue
		}
		content, err := os.ReadFile(filepath.Join(vaultPath, filepath.FromSlash(path)))
		if err != nil {
			return nil, err
		}
		movedSourcePath := movedVaultPath(path, sourcePath, destinationPath, sourceIsDirectory)
		updated := rewriteInternalLinksForMove(string(content), path, movedSourcePath, sourcePath, destinationPath, sourceIsDirectory, pathIndex, movedPathIndex)
		if updated != string(content) {
			rewrites[path] = updated
		}
	}
	return rewrites, nil
}

func vaultPathsForLinkRewrite(vaultPath string) ([]string, error) {
	resolvedVaultPath, err := resolveVaultPath(vaultPath)
	if err != nil {
		return nil, err
	}
	paths := make([]string, 0)
	err = filepath.Walk(resolvedVaultPath, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			if path != resolvedVaultPath && strings.HasPrefix(info.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(info.Name(), ".") {
			return nil
		}
		insideVault, err := resolvesWithinVault(resolvedVaultPath, path)
		if err != nil {
			return err
		}
		if !insideVault {
			return nil
		}
		relativePath, err := filepath.Rel(resolvedVaultPath, path)
		if err != nil {
			return err
		}
		paths = append(paths, filepath.ToSlash(relativePath))
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Strings(paths)
	return paths, nil
}

func rewriteInternalLinksForMove(content, sourcePath, movedSourcePath, movedPath, destinationPath string, movedDirectory bool, pathIndex, movedPathIndex map[string]string) string {
	inFence := false
	fenceMarker := byte(0)
	fenceLength := 0
	lines := strings.SplitAfter(content, "\n")
	for index, line := range lines {
		contentLine := strings.TrimSuffix(line, "\n")
		marker, length, isFence := markdownFence(contentLine)
		if inFence {
			if isFence && marker == fenceMarker && length >= fenceLength {
				inFence = false
			}
			continue
		}
		if isFence {
			inFence = true
			fenceMarker, fenceLength = marker, length
			continue
		}
		newline := line[len(contentLine):]
		lines[index] = rewriteLineInternalLinksForMove(contentLine, sourcePath, movedSourcePath, movedPath, destinationPath, movedDirectory, pathIndex, movedPathIndex) + newline
	}
	return strings.Join(lines, "")
}

func rewriteLineInternalLinksForMove(line, sourcePath, movedSourcePath, movedPath, destinationPath string, movedDirectory bool, pathIndex, movedPathIndex map[string]string) string {
	var updated strings.Builder
	updated.Grow(len(line))
	for cursor := 0; cursor < len(line); {
		if line[cursor] == '`' {
			length := repeatedByteLength(line[cursor:], '`')
			end := strings.Index(line[cursor+length:], strings.Repeat("`", length))
			if end < 0 {
				updated.WriteString(line[cursor:])
				break
			}
			end += cursor + length + length
			updated.WriteString(line[cursor:end])
			cursor = end
			continue
		}

		if strings.HasPrefix(line[cursor:], "[[") {
			if end := strings.Index(line[cursor+2:], "]]"); end >= 0 {
				rawEnd := cursor + end + 4
				updated.WriteString(rewriteWikiLinkForMove(line[cursor:rawEnd], sourcePath, movedSourcePath, movedPath, destinationPath, movedDirectory, pathIndex, movedPathIndex))
				cursor = rawEnd
				continue
			}
		}

		start := cursor
		embed := false
		if line[cursor] == '!' && cursor+1 < len(line) && line[cursor+1] == '[' {
			embed = true
			cursor++
		}
		if line[cursor] == '[' && !strings.HasPrefix(line[cursor:], "[[") {
			if _, end, ok := parseMarkdownLink(line, cursor, embed, start); ok {
				updated.WriteString(rewriteMarkdownLinkForMove(line[start:end], sourcePath, movedSourcePath, movedPath, destinationPath, movedDirectory, pathIndex, movedPathIndex))
				cursor = end
				continue
			}
		}
		updated.WriteByte(line[start])
		cursor = start + 1
	}
	return updated.String()
}

func rewriteWikiLinkForMove(raw, sourcePath, movedSourcePath, movedPath, destinationPath string, movedDirectory bool, pathIndex, movedPathIndex map[string]string) string {
	inner := raw[2 : len(raw)-2]
	destination, alias, hasAlias := strings.Cut(inner, "|")
	updatedDestination, changed := rewrittenMoveDestination(destination, "wikilink", sourcePath, movedSourcePath, movedPath, destinationPath, movedDirectory, pathIndex, movedPathIndex)
	if !changed {
		return raw
	}
	if hasAlias {
		return "[[" + updatedDestination + "|" + alias + "]]"
	}
	return "[[" + updatedDestination + "]]"
}

func rewriteMarkdownLinkForMove(raw, sourcePath, movedSourcePath, movedPath, destinationPath string, movedDirectory bool, pathIndex, movedPathIndex map[string]string) string {
	labelStart := 0
	if strings.HasPrefix(raw, "![") {
		labelStart = 1
	}
	labelEnd := strings.IndexByte(raw[labelStart:], ']') + labelStart
	body := raw[labelEnd+2 : len(raw)-1]
	leadingLength := len(body) - len(strings.TrimLeft(body, " \t"))
	leading, destinationAndSuffix := body[:leadingLength], body[leadingLength:]
	destination, suffix, wrapped := markdownDestinationParts(destinationAndSuffix)
	updatedDestination, changed := rewrittenMoveDestination(destination, "markdown", sourcePath, movedSourcePath, movedPath, destinationPath, movedDirectory, pathIndex, movedPathIndex)
	if !changed {
		return raw
	}
	if wrapped {
		updatedDestination = "<" + updatedDestination + ">"
	}
	return raw[:labelEnd+2] + leading + updatedDestination + suffix + ")"
}

func markdownDestinationParts(value string) (destination, suffix string, wrapped bool) {
	if strings.HasPrefix(value, "<") {
		if end := strings.IndexByte(value, '>'); end >= 0 {
			return value[1:end], value[end+1:], true
		}
	}
	if end := strings.IndexAny(value, " \t"); end >= 0 {
		return value[:end], value[end:], false
	}
	return value, "", false
}

func rewrittenMoveDestination(rawDestination, kind, sourcePath, movedSourcePath, movedPath, destinationPath string, movedDirectory bool, pathIndex, movedPathIndex map[string]string) (string, bool) {
	targetText := parseLinkTarget(rawDestination)
	if targetText == "" {
		return rawDestination, false
	}
	resolvedTarget, ok := resolveFromPathIndex(pathIndex, sourcePath, targetText)
	if !ok {
		return rawDestination, false
	}
	movedTargetPath := movedVaultPath(resolvedTarget, movedPath, destinationPath, movedDirectory)
	targetMoved := movedTargetPath != resolvedTarget
	sourceMoved := movedSourcePath != sourcePath
	if !targetMoved && !(sourceMoved && (kind == "markdown" || isRelativeVaultLink(targetText))) {
		return rawDestination, false
	}

	targetPart, fragment := splitLinkFragment(rawDestination)
	pathQualified := mustQualifyBareWikiLink(kind, targetPart, movedSourcePath, movedTargetPath, movedPathIndex)
	updatedTarget := movedLinkTarget(kind, targetPart, movedSourcePath, movedTargetPath, pathQualified)
	return updatedTarget + fragment, updatedTarget != targetPart
}

func mustQualifyBareWikiLink(kind, originalTarget, movedSourcePath, movedTargetPath string, movedPathIndex map[string]string) bool {
	decodedOriginal, err := url.PathUnescape(originalTarget)
	if err != nil {
		decodedOriginal = originalTarget
	}
	if kind != "wikilink" || strings.Contains(decodedOriginal, "/") || isRelativeVaultLink(decodedOriginal) {
		return false
	}
	bareTarget := filepath.Base(movedTargetPath)
	if extension := filepath.Ext(bareTarget); extension != "" && filepath.Ext(decodedOriginal) == "" {
		bareTarget = strings.TrimSuffix(bareTarget, extension)
	}
	if strings.Contains(originalTarget, "%") {
		bareTarget = encodeLinkPath(bareTarget)
	}
	resolvedTarget, ok := resolveFromPathIndex(movedPathIndex, movedSourcePath, bareTarget)
	return !ok || resolvedTarget != movedTargetPath
}

func movedLinkTarget(kind, originalTarget, movedSourcePath, movedTargetPath string, pathQualified bool) string {
	decodedOriginal, err := url.PathUnescape(originalTarget)
	if err != nil {
		decodedOriginal = originalTarget
	}
	rooted := strings.HasPrefix(decodedOriginal, "/")
	relative := isRelativeVaultLink(decodedOriginal)
	updated := movedTargetPath
	if (kind == "markdown" && !rooted) || relative {
		if relativePath, err := filepath.Rel(filepath.Dir(movedSourcePath), filepath.FromSlash(movedTargetPath)); err == nil {
			updated = filepath.ToSlash(relativePath)
		}
	}
	if kind == "wikilink" && !relative {
		if !pathQualified && !strings.Contains(decodedOriginal, "/") {
			updated = filepath.Base(updated)
		}
		if extension := filepath.Ext(updated); extension != "" && filepath.Ext(decodedOriginal) == "" {
			updated = strings.TrimSuffix(updated, extension)
		}
	}
	if rooted {
		updated = "/" + updated
	}
	if strings.Contains(originalTarget, "%") {
		updated = encodeLinkPath(updated)
	}
	return updated
}

func splitLinkFragment(value string) (string, string) {
	if index := strings.IndexByte(value, '#'); index >= 0 {
		return value[:index], value[index:]
	}
	return value, ""
}

func isRelativeVaultLink(target string) bool {
	return target == "." || target == ".." || strings.HasPrefix(target, "./") || strings.HasPrefix(target, "../")
}

func encodeLinkPath(value string) string {
	parts := strings.Split(value, "/")
	for index, part := range parts {
		if part != "." && part != ".." {
			parts[index] = url.PathEscape(part)
		}
	}
	return strings.Join(parts, "/")
}

func movedVaultPath(path, movedPath, destinationPath string, movedDirectory bool) string {
	if path == movedPath {
		return destinationPath
	}
	if movedDirectory && strings.HasPrefix(path, movedPath+"/") {
		return destinationPath + strings.TrimPrefix(path, movedPath)
	}
	return path
}
