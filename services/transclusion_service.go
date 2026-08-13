package services

import (
	"errors"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/kazuph/obails/models"
)

var (
	ErrUnresolvedTransclusion = errors.New("unresolved note transclusion")
	ErrStaleTransclusion      = errors.New("stale note transclusion")
)

// TransclusionService resolves only already-indexed Markdown embeds. It never reads files
// directly, so an embed result cannot mix content from a later vault generation.
type TransclusionService struct {
	linkService *LinkService
}

func NewTransclusionService(linkService *LinkService) *TransclusionService {
	return &TransclusionService{linkService: linkService}
}

// Resolve returns a note's full Markdown, a heading section, or one block for a resolved embed.
// Non-note attachments intentionally fail closed; their Link metadata is enough for the UI to select a renderer.
func (s *TransclusionService) Resolve(link models.Link) (models.TransclusionResult, error) {
	if !link.IsEmbed || !link.Exists || !isMarkdownSource(link.TargetPath) {
		return models.TransclusionResult{}, ErrUnresolvedTransclusion
	}
	if link.Generation == 0 {
		return models.TransclusionResult{}, ErrStaleTransclusion
	}
	snapshot := s.linkService.snapshotForRead()
	if snapshot == nil || !snapshot.state.Ready {
		return models.TransclusionResult{}, ErrUnresolvedTransclusion
	}
	if link.Generation != snapshot.state.Generation {
		return models.TransclusionResult{}, ErrStaleTransclusion
	}
	content, exists := snapshot.contents[normalizeVaultPath(link.TargetPath)]
	if !exists {
		return models.TransclusionResult{}, ErrUnresolvedTransclusion
	}
	result := models.TransclusionResult{TargetPath: link.TargetPath, Generation: snapshot.state.Generation, Fragment: link.Fragment, FragmentType: link.FragmentType}
	switch link.FragmentType {
	case "":
		result.Content = content
	case "heading":
		section, ok := extractEmbedHeading(content, link.Fragment)
		if !ok {
			return models.TransclusionResult{}, ErrUnresolvedTransclusion
		}
		result.Content = section
	case "block":
		block, ok := extractEmbedBlock(content, link.Fragment)
		if !ok {
			return models.TransclusionResult{}, ErrUnresolvedTransclusion
		}
		result.Content = block
	default:
		return models.TransclusionResult{}, ErrUnresolvedTransclusion
	}
	return result, nil
}

func extractEmbedHeading(content, target string) (string, bool) {
	lines := strings.Split(content, "\n")
	headings := markdownEmbedHeadings(lines)
	match := -1
	for i, heading := range headings {
		if normalizeHeadingFragment(heading.text) == normalizeHeadingFragment(target) {
			match = i
			break
		}
	}
	if match < 0 {
		return "", false
	}
	selected := headings[match]
	end := len(lines)
	for _, candidate := range headings[match+1:] {
		if candidate.level <= selected.level {
			end = candidate.line
			break
		}
	}
	return strings.Join(lines[selected.line:end], "\n"), true
}

type embedHeading struct {
	line  int
	end   int
	level int
	text  string
}

func markdownEmbedHeadings(lines []string) []embedHeading {
	headings := make([]embedHeading, 0)
	inFence := false
	fenceMarker := byte(0)
	fenceLength := 0
	paragraphStart := -1
	paragraph := make([]string, 0)
	for lineIndex, line := range lines {
		marker, length, isFence := markdownFence(line)
		if inFence {
			if isFence && marker == fenceMarker && length >= fenceLength {
				inFence = false
			}
			paragraphStart, paragraph = -1, paragraph[:0]
			continue
		}
		if isFence {
			inFence, fenceMarker, fenceLength = true, marker, length
			paragraphStart, paragraph = -1, paragraph[:0]
			continue
		}
		if level, text, ok := atxEmbedHeading(line); ok {
			headings = append(headings, embedHeading{line: lineIndex, end: lineIndex, level: level, text: text})
			paragraphStart, paragraph = -1, paragraph[:0]
			continue
		}
		if level, ok := setextEmbedHeadingLevel(line); ok && paragraphStart >= 0 {
			headings = append(headings, embedHeading{line: paragraphStart, end: lineIndex, level: level, text: strings.Join(paragraph, " ")})
			paragraphStart, paragraph = -1, paragraph[:0]
			continue
		}
		if isEmbedParagraphLine(line) {
			if paragraphStart < 0 {
				paragraphStart = lineIndex
			}
			paragraph = append(paragraph, strings.TrimSpace(line))
		} else {
			paragraphStart, paragraph = -1, paragraph[:0]
		}
	}
	return headings
}

func atxEmbedHeading(line string) (int, string, bool) {
	indent := len(line) - len(strings.TrimLeft(line, " "))
	if indent > 3 {
		return 0, "", false
	}
	line = line[indent:]
	level := 0
	for level < len(line) && line[level] == '#' {
		level++
	}
	if level == 0 || level > 6 || (level < len(line) && line[level] != ' ' && line[level] != '\t') {
		return 0, "", false
	}
	text := strings.TrimSpace(line[level:])
	trailing := len(text)
	for trailing > 0 && text[trailing-1] == '#' {
		trailing--
	}
	if trailing < len(text) && trailing > 0 && (text[trailing-1] == ' ' || text[trailing-1] == '\t') {
		text = strings.TrimSpace(text[:trailing])
	}
	return level, text, true
}

func setextEmbedHeadingLevel(line string) (int, bool) {
	indent := len(line) - len(strings.TrimLeft(line, " "))
	if indent > 3 {
		return 0, false
	}
	marker := strings.TrimSpace(line[indent:])
	if marker == "" {
		return 0, false
	}
	for _, value := range marker {
		if value != rune(marker[0]) {
			return 0, false
		}
	}
	if marker[0] == '=' {
		return 1, true
	}
	if marker[0] == '-' {
		return 2, true
	}
	return 0, false
}

func isEmbedParagraphLine(line string) bool {
	indent := len(line) - len(strings.TrimLeft(line, " "))
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || indent > 3 || strings.HasPrefix(line, "\t") {
		return false
	}
	if strings.HasPrefix(trimmed, ">") || isEmbedListMarker(trimmed) {
		return false
	}
	return !isThematicBreakLine(line)
}

func isEmbedListMarker(line string) bool {
	if len(line) >= 2 && (line[0] == '-' || line[0] == '+' || line[0] == '*') && (line[1] == ' ' || line[1] == '\t') {
		return true
	}
	end := 0
	for end < len(line) && line[end] >= '0' && line[end] <= '9' {
		end++
	}
	return end > 0 && end+1 < len(line) && (line[end] == '.' || line[end] == ')') && (line[end+1] == ' ' || line[end+1] == '\t')
}

func isThematicBreakLine(line string) bool {
	indent := len(line) - len(strings.TrimLeft(line, " "))
	if indent > 3 {
		return false
	}
	markers := strings.ReplaceAll(strings.ReplaceAll(line[indent:], " ", ""), "\t", "")
	if len(markers) < 3 {
		return false
	}
	return strings.Trim(markers, "*-_") == ""
}

func normalizeHeadingFragment(value string) string {
	return strings.ToLower(strings.Join(strings.Fields(strings.TrimSpace(value)), " "))
}

func extractEmbedBlock(content, target string) (string, bool) {
	lines := strings.Split(content, "\n")
	inFence := false
	fenceMarker := byte(0)
	fenceLength := 0
	for i, line := range lines {
		marker, length, isFence := markdownFence(line)
		if inFence {
			if isFence && marker == fenceMarker && length >= fenceLength {
				inFence = false
			}
			continue
		}
		if isFence {
			inFence, fenceMarker, fenceLength = true, marker, length
			continue
		}
		matchStart, matchEnd, found := blockIdentifierRange(line, target)
		if !found {
			continue
		}
		start, end := i, i+1
		for start > 0 && strings.TrimSpace(lines[start-1]) != "" && headingLevel(lines[start-1]) == 0 {
			start--
		}
		for end < len(lines) && strings.TrimSpace(lines[end]) != "" && headingLevel(lines[end]) == 0 {
			end++
		}
		block := append([]string(nil), lines[start:end]...)
		block[i-start] = strings.TrimSpace(line[:matchStart] + line[matchEnd:])
		return strings.Join(block, "\n"), true
	}
	return "", false
}

func blockIdentifierRange(line, target string) (int, int, bool) {
	if target == "" {
		return 0, 0, false
	}
	masked := maskInlineCode(line)
	needle := "^" + target
	for offset := 0; offset < len(masked); {
		index := strings.Index(masked[offset:], needle)
		if index < 0 {
			return 0, 0, false
		}
		start := offset + index
		end := start + len(needle)
		if mentionBoundary(masked, start, end) {
			return start, end, true
		}
		offset = end
	}
	return 0, 0, false
}

// GetUnlinkedMentions searches only the content captured with the currently published generation.
func (s *LinkService) GetUnlinkedMentions(target string) models.UnlinkedMentionsResult {
	snapshot := s.snapshotForRead()
	if snapshot == nil {
		return models.UnlinkedMentionsResult{}
	}
	result := models.UnlinkedMentionsResult{LinkIndexState: snapshot.state}
	if !snapshot.state.Ready {
		return result
	}
	targetPath, resolved := resolveFromPathIndex(snapshot.pathIndex, "", target)
	if !resolved {
		return result
	}
	terms := mergeStrings(append([]string{displayName(targetPath), targetPath, strings.TrimSuffix(targetPath, filepathExt(targetPath))}, snapshot.aliases[targetPath]...))
	sourcePaths := make([]string, 0, len(snapshot.contents))
	for sourcePath := range snapshot.contents {
		sourcePaths = append(sourcePaths, sourcePath)
	}
	sort.Strings(sourcePaths)
	for _, sourcePath := range sourcePaths {
		content := snapshot.contents[sourcePath]
		if sourcePath == targetPath {
			continue
		}
		for _, prose := range renderableProseLines(content) {
			for _, match := range mentionMatches(prose, terms) {
				result.Mentions = append(result.Mentions, models.UnlinkedMention{
					SourcePath: sourcePath, SourceTitle: displayName(sourcePath), TargetPath: targetPath,
					TargetTitle: displayName(targetPath), Match: match, Context: prose,
				})
			}
		}
	}
	return result
}

func filepathExt(path string) string {
	lastSlash := strings.LastIndexByte(path, '/')
	lastDot := strings.LastIndexByte(path, '.')
	if lastDot <= lastSlash {
		return ""
	}
	return path[lastDot:]
}

func renderableProseLines(content string) []string {
	_, body, err := NewFrontmatterService().ParseFrontmatter(content)
	if err != nil {
		return nil
	}
	lines := strings.Split(body, "\n")
	headingLines := make(map[int]bool)
	for _, heading := range markdownEmbedHeadings(lines) {
		for line := heading.line; line <= heading.end; line++ {
			headingLines[line] = true
		}
	}
	prose := make([]string, 0)
	inFence := false
	fenceMarker := byte(0)
	fenceLength := 0
	for lineIndex, line := range lines {
		marker, length, isFence := markdownFence(line)
		if inFence {
			if isFence && marker == fenceMarker && length >= fenceLength {
				inFence = false
			}
			continue
		}
		if isFence {
			inFence, fenceMarker, fenceLength = true, marker, length
			continue
		}
		if headingLines[lineIndex] {
			continue
		}
		line = strings.TrimSpace(maskInlineMarkdown(line))
		if line != "" {
			prose = append(prose, line)
		}
	}
	return prose
}

func maskInlineMarkdown(line string) string {
	masked := []byte(line)
	for cursor := 0; cursor < len(line); {
		if line[cursor] == '`' {
			length := repeatedByteLength(line[cursor:], '`')
			end := strings.Index(line[cursor+length:], strings.Repeat("`", length))
			if end < 0 {
				cursor += length
				continue
			}
			end += cursor + length + length
			for i := cursor; i < end; i++ {
				masked[i] = ' '
			}
			cursor = end
			continue
		}
		if strings.HasPrefix(line[cursor:], "[[") {
			if end := strings.Index(line[cursor+2:], "]]"); end >= 0 {
				end += cursor + 4
				for i := cursor; i < end; i++ {
					masked[i] = ' '
				}
				if cursor > 0 && line[cursor-1] == '!' {
					masked[cursor-1] = ' '
				}
				cursor = end
				continue
			}
		}
		start, embed := cursor, false
		if line[cursor] == '!' && cursor+1 < len(line) && line[cursor+1] == '[' {
			embed, cursor = true, cursor+1
		}
		if line[cursor] == '[' && !strings.HasPrefix(line[cursor:], "[[") {
			if _, end, ok := parseMarkdownLink(line, cursor, embed, start); ok {
				for i := start; i < end; i++ {
					masked[i] = ' '
				}
				cursor = end
				continue
			}
		}
		cursor = start + 1
	}
	return string(masked)
}

func maskInlineCode(line string) string {
	return maskInlineMarkdownCodeOnly(line)
}

func maskInlineMarkdownCodeOnly(line string) string {
	masked := []byte(line)
	for cursor := 0; cursor < len(line); cursor++ {
		if line[cursor] != '`' {
			continue
		}
		length := repeatedByteLength(line[cursor:], '`')
		end := strings.Index(line[cursor+length:], strings.Repeat("`", length))
		if end < 0 {
			break
		}
		end += cursor + length + length
		for i := cursor; i < end; i++ {
			masked[i] = ' '
		}
		cursor = end - 1
	}
	return string(masked)
}

func mentionMatches(line string, terms []string) []string {
	type occurrence struct {
		term       string
		start, end int
	}
	occurrences := make([]occurrence, 0)
	for _, term := range terms {
		for offset := 0; offset < len(line); {
			index := strings.Index(line[offset:], term)
			if index < 0 {
				break
			}
			start := offset + index
			end := start + len(term)
			if mentionBoundary(line, start, end) {
				occurrences = append(occurrences, occurrence{term: term, start: start, end: end})
			}
			offset = end
		}
	}
	sort.Slice(occurrences, func(i, j int) bool {
		if occurrences[i].start == occurrences[j].start {
			return occurrences[i].end > occurrences[j].end
		}
		return occurrences[i].start < occurrences[j].start
	})
	matches := make([]string, 0, len(occurrences))
	lastEnd := -1
	for _, occurrence := range occurrences {
		if occurrence.start < lastEnd {
			continue
		}
		matches = append(matches, occurrence.term)
		lastEnd = occurrence.end
	}
	return matches
}

func mentionBoundary(value string, start, end int) bool {
	if start > 0 {
		previous, _ := utf8.DecodeLastRuneInString(value[:start])
		if unicode.IsLetter(previous) || unicode.IsDigit(previous) || previous == '_' {
			return false
		}
	}
	if end < len(value) {
		next, _ := utf8.DecodeRuneInString(value[end:])
		if unicode.IsLetter(next) || unicode.IsDigit(next) || next == '_' {
			return false
		}
	}
	return true
}
