package services

import (
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"unicode"
	"unicode/utf8"

	"github.com/kazuph/obails/models"
)

type linkIndexSnapshot struct {
	state     models.LinkIndexState
	forward   map[string][]models.Link
	backward  map[string][]models.Backlink
	pathIndex map[string]string
	metadata  map[string]models.LinkMetadata
	contents  map[string]string
	aliases   map[string][]string
}

// LinkService owns atomically-published, immutable link-index generations.
type LinkService struct {
	fileService   *FileService
	configService *ConfigService

	mu        sync.RWMutex
	rebuildMu sync.Mutex
	snapshot  *linkIndexSnapshot
}

func NewLinkService(fileService *FileService, configService *ConfigService) *LinkService {
	return &LinkService{fileService: fileService, configService: configService}
}

// ParseLinks is retained for callers that only need deduplicated target text.
func (s *LinkService) ParseLinks(content string) []string {
	refs := parseInternalLinks(content)
	seen := make(map[string]bool, len(refs))
	links := make([]string, 0, len(refs))
	for _, ref := range refs {
		if ref.Text != "" && !seen[ref.Text] {
			seen[ref.Text] = true
			links = append(links, ref.Text)
		}
	}
	return links
}

// GetIndexState reports whether a generation has been published. An empty vault is Ready.
func (s *LinkService) GetIndexState() models.LinkIndexState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.snapshot == nil {
		return models.LinkIndexState{}
	}
	return s.snapshot.state
}

// GetLinkIndexSnapshot returns a deep copy of exactly one published generation.
func (s *LinkService) GetLinkIndexSnapshot() models.LinkIndexSnapshot {
	snapshot := s.snapshotForRead()
	if snapshot == nil {
		return models.LinkIndexSnapshot{}
	}
	return exportSnapshot(snapshot)
}

// ResolveLink does not scan the vault before readiness; callers must wait for a published index.
func (s *LinkService) ResolveLink(linkText string) (string, bool) {
	snapshot := s.snapshotForRead()
	if snapshot == nil || !snapshot.state.Ready {
		return "", false
	}
	return resolveFromPathIndex(snapshot.pathIndex, "", linkText)
}

// GetBacklinks returns the current generation's backlinks for compatibility with existing callers.
func (s *LinkService) GetBacklinks(relativePath string) []models.Backlink {
	return s.GetBacklinksFromSnapshot(s.GetLinkIndexSnapshot(), relativePath).Backlinks
}

// GetBacklinksFromSnapshot reads backlinks from the supplied immutable generation only.
func (s *LinkService) GetBacklinksFromSnapshot(snapshot models.LinkIndexSnapshot, relativePath string) models.BacklinksResult {
	result := models.BacklinksResult{LinkIndexState: snapshot.LinkIndexState}
	if !snapshot.Ready {
		return result
	}
	key := normalizeVaultPath(relativePath)
	result.Backlinks = cloneBacklinks(snapshot.Backlinks[key])
	return result
}

// RebuildIndex publishes a complete new generation atomically. During a later rebuild, readers
// continue to receive the previous immutable generation; before the first publish they see not-ready.
func (s *LinkService) RebuildIndex() error {
	s.rebuildMu.Lock()
	defer s.rebuildMu.Unlock()

	s.setRebuilding(true)
	snapshot, err := s.buildSnapshot()
	if err != nil {
		s.setRebuilding(false)
		return err
	}

	s.mu.Lock()
	previousGeneration := uint64(0)
	if s.snapshot != nil {
		previousGeneration = s.snapshot.state.Generation
	}
	snapshot.state = models.LinkIndexState{Ready: true, Generation: previousGeneration + 1}
	s.snapshot = snapshot
	s.mu.Unlock()
	return nil
}

func (s *LinkService) buildSnapshot() (*linkIndexSnapshot, error) {
	vaultPath := s.configService.GetVaultPath()
	if vaultPath == "" {
		return &linkIndexSnapshot{forward: map[string][]models.Link{}, backward: map[string][]models.Backlink{}, pathIndex: map[string]string{}, metadata: map[string]models.LinkMetadata{}, contents: map[string]string{}, aliases: map[string][]string{}}, nil
	}
	resolvedVaultPath, err := resolveVaultPath(vaultPath)
	if err != nil {
		return nil, err
	}

	type vaultFile struct {
		fullPath string
		relative string
		markdown bool
		content  string
	}
	files := make([]vaultFile, 0)
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
		insideVault, resolveErr := resolvesWithinVault(resolvedVaultPath, path)
		if resolveErr != nil {
			return resolveErr
		}
		if !insideVault {
			return nil
		}
		relative, relErr := filepath.Rel(resolvedVaultPath, path)
		if relErr != nil {
			return relErr
		}
		files = append(files, vaultFile{fullPath: path, relative: filepath.ToSlash(relative), markdown: isMarkdownSource(relative)})
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(files, func(i, j int) bool { return files[i].relative < files[j].relative })
	for i := range files {
		if !files[i].markdown {
			continue
		}
		content, readErr := os.ReadFile(files[i].fullPath)
		if readErr != nil {
			return nil, readErr
		}
		files[i].content = string(content)
	}

	pathIndex := make(map[string]string, len(files)*4)
	metadata := make(map[string]models.LinkMetadata)
	contents := make(map[string]string)
	aliases := make(map[string][]string)
	for _, file := range files {
		registerPathIndex(pathIndex, file.relative)
	}
	frontmatterService := NewFrontmatterService()
	for _, file := range files {
		if !file.markdown {
			continue
		}
		contents[file.relative] = file.content
		props, body, parseErr := frontmatterService.ParseFrontmatter(file.content)
		if parseErr != nil {
			metadata[file.relative] = models.LinkMetadata{}
			continue
		}
		registerFrontmatterAliases(pathIndex, props, file.relative)
		aliases[file.relative] = frontmatterAliases(props)
		metadata[file.relative] = models.LinkMetadata{Tags: mergeTags(frontmatterTags(props), renderableInlineTags(body))}
	}

	forward := make(map[string][]models.Link)
	backward := make(map[string][]models.Backlink)
	for _, file := range files {
		if !file.markdown {
			continue
		}
		links := parseInternalLinks(file.content)
		for i := range links {
			if hasInvalidWikiEscape(links[i]) {
				continue
			}
			if targetPath, exists := resolveStructuredLinkText(pathIndex, file.relative, links[i].Text); exists {
				links[i].TargetPath = targetPath
				links[i].Exists = true
			}
		}
		forward[file.relative] = links

		seenTargets := make(map[string]bool)
		for _, link := range links {
			if !link.Exists || seenTargets[link.TargetPath] {
				continue
			}
			seenTargets[link.TargetPath] = true
			backward[link.TargetPath] = append(backward[link.TargetPath], models.Backlink{
				SourcePath:  file.relative,
				SourceTitle: displayName(file.relative),
				Context:     backlinkContext(file.content, link.Raw),
				Link:        link,
			})
		}
	}

	return &linkIndexSnapshot{forward: forward, backward: backward, pathIndex: pathIndex, metadata: metadata, contents: contents, aliases: aliases}, nil
}

func hasInvalidWikiEscape(link models.Link) bool {
	if link.Kind != "wikilink" {
		return false
	}
	inner := link.Raw[2 : len(link.Raw)-2]
	target, _, _ := strings.Cut(inner, "|")
	pathTarget, fragment, hasFragment := strings.Cut(target, "#")
	if _, err := url.PathUnescape(strings.TrimSpace(pathTarget)); err != nil {
		return true
	}
	if !hasFragment {
		return false
	}
	_, err := url.PathUnescape(strings.TrimSpace(fragment))
	return err != nil
}

// GetLinkInfo returns raw structured link data from one published generation; it never produces HTML.
func (s *LinkService) GetLinkInfo(relativePath string) ([]models.Link, error) {
	if _, err := s.fileService.ReadFile(relativePath); err != nil {
		return nil, err
	}
	snapshot := s.snapshotForRead()
	if snapshot == nil || !snapshot.state.Ready {
		return []models.Link{}, nil
	}
	links := cloneLinks(snapshot.forward[normalizeVaultPath(relativePath)])
	stampLinkGeneration(links, snapshot.state.Generation)
	return links, nil
}

func (s *LinkService) GetIndexStats() map[string]int {
	snapshot := s.snapshotForRead()
	if snapshot == nil || !snapshot.state.Ready {
		return map[string]int{"totalFiles": 0, "totalLinks": 0}
	}
	totalLinks := 0
	for _, links := range snapshot.forward {
		totalLinks += len(links)
	}
	return map[string]int{"totalFiles": len(snapshot.forward), "totalLinks": totalLinks}
}

// ExportForwardIndex remains a compatibility API for string-only callers.
func (s *LinkService) ExportForwardIndex() map[string][]string {
	snapshot := s.snapshotForRead()
	if snapshot == nil || !snapshot.state.Ready {
		return map[string][]string{}
	}
	result := make(map[string][]string, len(snapshot.forward))
	for path, links := range snapshot.forward {
		result[path] = make([]string, 0, len(links))
		for _, link := range links {
			result[path] = append(result[path], link.Text)
		}
	}
	return result
}

func (s *LinkService) snapshotForRead() *linkIndexSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.snapshot
}

func (s *LinkService) setRebuilding(rebuilding bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.snapshot == nil {
		s.snapshot = &linkIndexSnapshot{state: models.LinkIndexState{Rebuilding: rebuilding}}
		return
	}
	state := s.snapshot.state
	state.Rebuilding = rebuilding
	s.snapshot = &linkIndexSnapshot{
		state:     state,
		forward:   s.snapshot.forward,
		backward:  s.snapshot.backward,
		pathIndex: s.snapshot.pathIndex,
		metadata:  s.snapshot.metadata,
		contents:  s.snapshot.contents,
		aliases:   s.snapshot.aliases,
	}
}

func exportSnapshot(snapshot *linkIndexSnapshot) models.LinkIndexSnapshot {
	links := cloneForward(snapshot.forward)
	backlinks := cloneBackward(snapshot.backward)
	for path := range links {
		stampLinkGeneration(links[path], snapshot.state.Generation)
	}
	for path := range backlinks {
		for index := range backlinks[path] {
			backlinks[path][index].Link.Generation = snapshot.state.Generation
		}
	}
	return models.LinkIndexSnapshot{
		LinkIndexState: snapshot.state,
		Links:          links,
		Backlinks:      backlinks,
		Metadata:       cloneMetadata(snapshot.metadata),
	}
}

func stampLinkGeneration(links []models.Link, generation uint64) {
	for index := range links {
		links[index].Generation = generation
	}
}

func resolveVaultPath(vaultPath string) (string, error) {
	absVaultPath, err := filepath.Abs(vaultPath)
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(absVaultPath)
}

func resolvesWithinVault(resolvedVaultPath, path string) (bool, error) {
	resolvedPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return false, err
	}
	relativePath, err := filepath.Rel(resolvedVaultPath, resolvedPath)
	if err != nil {
		return false, err
	}
	return relativePath != ".." && !strings.HasPrefix(relativePath, ".."+string(filepath.Separator)) && !filepath.IsAbs(relativePath), nil
}

func cloneMetadata(metadata map[string]models.LinkMetadata) map[string]models.LinkMetadata {
	result := make(map[string]models.LinkMetadata, len(metadata))
	for path, value := range metadata {
		result[path] = models.LinkMetadata{Tags: append([]string(nil), value.Tags...)}
	}
	return result
}

func cloneForward(forward map[string][]models.Link) map[string][]models.Link {
	result := make(map[string][]models.Link, len(forward))
	for path, links := range forward {
		result[path] = cloneLinks(links)
	}
	return result
}

func cloneBackward(backward map[string][]models.Backlink) map[string][]models.Backlink {
	result := make(map[string][]models.Backlink, len(backward))
	for path, backlinks := range backward {
		result[path] = cloneBacklinks(backlinks)
	}
	return result
}

func cloneLinks(links []models.Link) []models.Link {
	return append([]models.Link(nil), links...)
}

func cloneBacklinks(backlinks []models.Backlink) []models.Backlink {
	return append([]models.Backlink(nil), backlinks...)
}

func isMarkdownSource(relativePath string) bool {
	extension := strings.ToLower(filepath.Ext(relativePath))
	return extension == ".md" || extension == ".markdown"
}

func registerPathIndex(index map[string]string, relativePath string) {
	cleanPath := normalizeVaultPath(relativePath)
	extension := filepath.Ext(cleanPath)
	keys := []string{cleanPath, strings.TrimSuffix(cleanPath, extension), filepath.Base(cleanPath), strings.TrimSuffix(filepath.Base(cleanPath), extension)}
	for _, key := range keys {
		if key != "" {
			if _, exists := index[key]; !exists {
				index[key] = cleanPath
			}
		}
	}
}

func registerFrontmatterAliases(index map[string]string, props map[string]any, relativePath string) {
	for _, alias := range frontmatterAliases(props) {
		key := normalizeVaultPath(alias)
		if key == "" {
			continue
		}
		if _, exists := index[key]; !exists {
			index[key] = relativePath
		}
	}
}

func frontmatterAliases(props map[string]any) []string {
	aliases := make([]string, 0)
	for _, property := range []string{"aliases", "alias"} {
		aliases = append(aliases, frontmatterStringValues(props[property])...)
	}
	return mergeStrings(aliases)
}

func mergeStrings(values []string) []string {
	seen := make(map[string]bool, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && !seen[value] {
			seen[value] = true
			result = append(result, value)
		}
	}
	sort.Strings(result)
	return result
}

func frontmatterStringValues(value any) []string {
	switch typed := value.(type) {
	case string:
		return []string{typed}
	case []any:
		values := make([]string, 0, len(typed))
		for _, item := range typed {
			if alias, ok := item.(string); ok {
				values = append(values, alias)
			}
		}
		return values
	default:
		return nil
	}
}

func frontmatterTags(props map[string]any) []string {
	tags := make([]string, 0)
	for _, value := range frontmatterStringValues(props["tags"]) {
		tags = append(tags, strings.TrimSpace(strings.TrimPrefix(value, "#")))
	}
	return mergeTags(tags)
}

func renderableInlineTags(content string) []string {
	tags := make([]string, 0)
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
			inFence, fenceMarker, fenceLength = true, marker, length
			continue
		}
		tags = append(tags, tagsInLine(line)...)
	}
	return mergeTags(tags)
}

func tagsInLine(line string) []string {
	tags := make([]string, 0)
	for cursor := 0; cursor < len(line); {
		if line[cursor] == '`' {
			length := repeatedByteLength(line[cursor:], '`')
			end := strings.Index(line[cursor+length:], strings.Repeat("`", length))
			if end < 0 {
				// An unmatched backtick run is literal Markdown, so later tags
				// on the line remain renderable.
				cursor += length
				continue
			}
			cursor += length + end + length
			continue
		}
		if line[cursor] != '#' || (cursor > 0 && !isTagBoundary(line[cursor-1])) {
			cursor++
			continue
		}
		end := cursor + 1
		for end < len(line) {
			value, size := utf8.DecodeRuneInString(line[end:])
			if !isTagCharacter(value) {
				break
			}
			end += size
		}
		if end > cursor+1 {
			tags = append(tags, line[cursor+1:end])
		}
		cursor = end
	}
	return tags
}

func isTagBoundary(value byte) bool {
	return value == ' ' || value == '\t' || value == '(' || value == '[' || value == '{' || value == '"' || value == '\''
}

func isTagCharacter(value rune) bool {
	return unicode.IsLetter(value) || unicode.IsDigit(value) || value == '_' || value == '-' || value == '/'
}

func mergeTags(tagSets ...[]string) []string {
	seen := make(map[string]bool)
	tags := make([]string, 0)
	for _, tagSet := range tagSets {
		for _, value := range tagSet {
			tag := strings.TrimPrefix(strings.TrimSpace(value), "#")
			if tag != "" && !seen[tag] {
				seen[tag] = true
				tags = append(tags, tag)
			}
		}
	}
	sort.Strings(tags)
	return tags
}

func resolveFromPathIndex(index map[string]string, sourcePath, linkText string) (string, bool) {
	target := parseLinkTarget(linkText)
	return resolveStructuredLinkText(index, sourcePath, target)
}

// resolveStructuredLinkText resolves a target already parsed from Markdown or
// Wiki syntax. It must not parse it again: a decoded literal '#' can be a
// filename character rather than a fragment delimiter.
func resolveStructuredLinkText(index map[string]string, sourcePath, target string) (string, bool) {
	target = strings.TrimSpace(target)
	if target == "" {
		return "", false
	}
	candidates := linkResolutionCandidates(normalizeVaultPath(target))
	if sourcePath != "" && !strings.HasPrefix(target, "/") {
		resolvedRelativePath := normalizeVaultPath(filepath.Join(filepath.Dir(sourcePath), target))
		candidates = append(candidates, linkResolutionCandidates(resolvedRelativePath)...)
	}
	for _, candidate := range candidates {
		if resolved, ok := index[candidate]; ok {
			return resolved, true
		}
	}
	return "", false
}

func linkResolutionCandidates(target string) []string {
	if target == "" {
		return nil
	}
	candidates := []string{target}
	if filepath.Ext(target) == "" {
		candidates = append(candidates, target+".md", target+".markdown")
	}
	return candidates
}

func normalizeVaultPath(path string) string {
	cleaned := filepath.ToSlash(filepath.Clean(strings.TrimSpace(strings.TrimPrefix(path, "/"))))
	if cleaned == "." || cleaned == ".." || strings.HasPrefix(cleaned, "../") {
		return ""
	}
	return cleaned
}

func displayName(relativePath string) string {
	return strings.TrimSuffix(filepath.Base(relativePath), filepath.Ext(relativePath))
}

func backlinkContext(content, raw string) string {
	for _, line := range strings.Split(content, "\n") {
		if strings.Contains(line, raw) {
			return strings.TrimSpace(line)
		}
	}
	return ""
}
