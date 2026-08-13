package services

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"unicode"

	"github.com/kazuph/obails/models"
)

// SearchService evaluates Obsidian-style vault search expressions against
// Markdown files. It is separate from FileService's legacy line-search API.
type SearchService struct {
	configService *ConfigService
}

func NewSearchService(configService *ConfigService) *SearchService {
	return &SearchService{configService: configService}
}

// Search evaluates a query over .md and .markdown files. AND binds tighter
// than OR, and a leading hyphen negates the immediately following expression.
func (s *SearchService) Search(options models.SearchOptions) ([]models.VaultSearchResult, error) {
	if options.ContextRunes < 0 {
		return nil, fmt.Errorf("context runes must not be negative")
	}
	if options.Limit < 0 {
		return nil, fmt.Errorf("search limit must not be negative")
	}
	query, err := parseSearchQuery(options.Query)
	if err != nil {
		return nil, err
	}

	var results []models.VaultSearchResult
	vaultPath := s.configService.GetVaultPath()
	err = filepath.Walk(vaultPath, func(path string, info os.FileInfo, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if info.IsDir() {
			if strings.HasPrefix(info.Name(), ".") {
				return filepath.SkipDir
			}
			return nil
		}
		if strings.HasPrefix(info.Name(), ".") || !isSearchableMarkdown(info.Name()) {
			return nil
		}

		content, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		relativePath, relErr := filepath.Rel(vaultPath, path)
		if relErr != nil {
			return relErr
		}
		properties, _, frontmatterErr := NewFrontmatterService().ParseFrontmatter(string(content))
		if frontmatterErr != nil {
			properties = map[string]any{}
		}
		doc := searchDocument{
			path:       filepath.ToSlash(relativePath),
			fileName:   info.Name(),
			content:    string(content),
			properties: properties,
			base:       0,
			searchPath: true,
		}
		match := query.evaluate(doc, options.MatchCase)
		if !match.matched {
			return nil
		}

		line, context := searchContext(doc, match.offset, options.ContextRunes)
		results = append(results, models.VaultSearchResult{
			Path:       doc.path,
			Title:      strings.TrimSuffix(doc.fileName, filepath.Ext(doc.fileName)),
			FileName:   doc.fileName,
			Line:       line,
			Context:    context,
			MatchCount: max(match.count, 1),
			ModifiedAt: info.ModTime(),
		})
		return nil
	})
	if err != nil {
		return nil, err
	}

	sortSearchResults(results, options.Sort)
	if options.Limit > 0 && len(results) > options.Limit {
		results = results[:options.Limit]
	}
	return results, nil
}

func isSearchableMarkdown(name string) bool {
	ext := strings.ToLower(filepath.Ext(name))
	return ext == ".md" || ext == ".markdown"
}

func sortSearchResults(results []models.VaultSearchResult, order models.SearchSort) {
	sort.SliceStable(results, func(i, j int) bool {
		left, right := results[i], results[j]
		leftName, rightName := strings.ToLower(left.FileName), strings.ToLower(right.FileName)
		switch order {
		case models.SearchSortFileNameDescending:
			if leftName != rightName {
				return leftName > rightName
			}
		case models.SearchSortModifiedNewest:
			if !left.ModifiedAt.Equal(right.ModifiedAt) {
				return left.ModifiedAt.After(right.ModifiedAt)
			}
		case models.SearchSortModifiedOldest:
			if !left.ModifiedAt.Equal(right.ModifiedAt) {
				return left.ModifiedAt.Before(right.ModifiedAt)
			}
		default:
			if leftName != rightName {
				return leftName < rightName
			}
		}
		return left.Path < right.Path
	})
}

type searchDocument struct {
	path       string
	fileName   string
	content    string
	properties map[string]any
	base       int
	searchPath bool
}

type searchMatch struct {
	matched bool
	offset  int
	count   int
}

type searchNode interface {
	evaluate(searchDocument, bool) searchMatch
}

type termNode struct{ text string }

func (n termNode) evaluate(doc searchDocument, caseSensitive bool) searchMatch {
	if offset := findText(doc.content, n.text, caseSensitive); offset >= 0 {
		return searchMatch{matched: true, offset: doc.base + offset, count: countText(doc.content, n.text, caseSensitive)}
	}
	if doc.searchPath {
		if findText(doc.path, n.text, caseSensitive) >= 0 || findText(doc.fileName, n.text, caseSensitive) >= 0 {
			return searchMatch{matched: true, offset: -1, count: 1}
		}
	}
	return searchMatch{offset: -1}
}

type regexNode struct {
	pattern string
	regex   *regexp.Regexp
}

func (n regexNode) evaluate(doc searchDocument, caseSensitive bool) searchMatch {
	regex := n.regex
	if !caseSensitive {
		var err error
		regex, err = regexp.Compile("(?i)" + n.pattern)
		if err != nil {
			return searchMatch{offset: -1}
		}
	}
	if index := regex.FindStringIndex(doc.content); index != nil {
		return searchMatch{matched: true, offset: doc.base + index[0], count: len(regex.FindAllStringIndex(doc.content, -1))}
	}
	if doc.searchPath && (regex.MatchString(doc.path) || regex.MatchString(doc.fileName)) {
		return searchMatch{matched: true, offset: -1, count: 1}
	}
	return searchMatch{offset: -1}
}

type andNode struct{ left, right searchNode }

func (n andNode) evaluate(doc searchDocument, caseSensitive bool) searchMatch {
	left := n.left.evaluate(doc, caseSensitive)
	if !left.matched {
		return searchMatch{offset: -1}
	}
	right := n.right.evaluate(doc, caseSensitive)
	if !right.matched {
		return searchMatch{offset: -1}
	}
	if left.offset >= 0 {
		return searchMatch{matched: true, offset: left.offset, count: left.count + right.count}
	}
	return searchMatch{matched: true, offset: right.offset, count: left.count + right.count}
}

type orNode struct{ left, right searchNode }

func (n orNode) evaluate(doc searchDocument, caseSensitive bool) searchMatch {
	if left := n.left.evaluate(doc, caseSensitive); left.matched {
		return left
	}
	return n.right.evaluate(doc, caseSensitive)
}

type notNode struct{ child searchNode }

func (n notNode) evaluate(doc searchDocument, caseSensitive bool) searchMatch {
	if n.child.evaluate(doc, caseSensitive).matched {
		return searchMatch{offset: -1}
	}
	return searchMatch{matched: true, offset: -1, count: 1}
}

type fieldNode struct {
	field string
	child searchNode
}

func (n fieldNode) evaluate(doc searchDocument, caseSensitive bool) searchMatch {
	switch n.field {
	case "file":
		return n.child.evaluate(searchDocument{content: doc.fileName, base: -1}, caseSensitive)
	case "path":
		return n.child.evaluate(searchDocument{content: doc.path, base: -1}, caseSensitive)
	case "content":
		return n.child.evaluate(searchDocument{content: doc.content, base: doc.base}, caseSensitive)
	case "match-case":
		return n.child.evaluate(doc, true)
	case "ignore-case":
		return n.child.evaluate(doc, false)
	case "tag":
		return evaluateTag(doc, n.child, caseSensitive)
	case "line":
		return evaluateScopes(doc, lineScopes(doc), n.child, caseSensitive)
	case "block":
		return evaluateScopes(doc, blockScopes(doc), n.child, caseSensitive)
	case "section":
		return evaluateScopes(doc, sectionScopes(doc), n.child, caseSensitive)
	case "task", "task-todo", "task-done":
		return evaluateTasks(doc, n.field, n.child, caseSensitive)
	default:
		return searchMatch{offset: -1}
	}
}

type propertyNode struct {
	key   string
	value searchNode
	null  bool
}

func (n propertyNode) evaluate(doc searchDocument, caseSensitive bool) searchMatch {
	value, exists := doc.properties[n.key]
	if !exists {
		return searchMatch{offset: -1}
	}
	if n.value == nil {
		return searchMatch{matched: true, offset: -1, count: 1}
	}
	if n.null {
		return searchMatch{matched: value == nil, offset: -1, count: 1}
	}
	for _, candidate := range propertyValues(value) {
		if n.value.evaluate(searchDocument{content: candidate, base: -1}, caseSensitive).matched {
			return searchMatch{matched: true, offset: -1, count: 1}
		}
	}
	return searchMatch{offset: -1}
}

func propertyValues(value any) []string {
	switch typed := value.(type) {
	case string:
		return []string{typed}
	case []any:
		values := make([]string, 0, len(typed))
		for _, item := range typed {
			values = append(values, propertyValues(item)...)
		}
		return values
	default:
		return []string{fmt.Sprint(value)}
	}
}

func evaluateTag(doc searchDocument, child searchNode, caseSensitive bool) searchMatch {
	term, ok := child.(termNode)
	if !ok || !strings.HasPrefix(term.text, "#") {
		return searchMatch{offset: -1}
	}
	flags := ""
	if !caseSensitive {
		flags = "(?i)"
	}
	pattern := flags + `(?:^|\s)` + regexp.QuoteMeta(term.text) + `(?:$|\s|[.,;:!?])`
	matcher := regexp.MustCompile(pattern)
	inFence := false
	for _, scope := range lineScopes(doc) {
		trimmed := strings.TrimSpace(scope.content)
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			inFence = !inFence
			continue
		}
		if !inFence && matcher.MatchString(scope.content) {
			return searchMatch{matched: true, offset: scope.base, count: 1}
		}
	}
	return searchMatch{offset: -1}
}

func evaluateScopes(doc searchDocument, scopes []searchDocument, child searchNode, caseSensitive bool) searchMatch {
	for _, scope := range scopes {
		if match := child.evaluate(scope, caseSensitive); match.matched {
			return match
		}
	}
	return searchMatch{offset: -1}
}

var markdownTask = regexp.MustCompile(`^\s*[-*+] \[([^\]])\]\s+`)

func evaluateTasks(doc searchDocument, kind string, child searchNode, caseSensitive bool) searchMatch {
	for _, scope := range lineScopes(doc) {
		status := markdownTask.FindStringSubmatch(scope.content)
		if status == nil || (kind == "task-todo" && strings.EqualFold(status[1], "x")) || (kind == "task-done" && !strings.EqualFold(status[1], "x")) {
			continue
		}
		if match := child.evaluate(scope, caseSensitive); match.matched {
			return match
		}
	}
	return searchMatch{offset: -1}
}

func lineScopes(doc searchDocument) []searchDocument {
	lines := strings.SplitAfter(doc.content, "\n")
	scopes := make([]searchDocument, 0, len(lines))
	offset := 0
	for _, line := range lines {
		content := strings.TrimSuffix(line, "\n")
		scopes = append(scopes, searchDocument{content: content, properties: doc.properties, base: doc.base + offset})
		offset += len(line)
	}
	return scopes
}

func blockScopes(doc searchDocument) []searchDocument {
	var scopes []searchDocument
	start := 0
	inBlock := false
	for _, line := range lineScopes(doc) {
		if strings.TrimSpace(line.content) == "" {
			if inBlock {
				scopes = append(scopes, searchDocument{content: doc.content[start : line.base-doc.base], properties: doc.properties, base: doc.base + start})
				inBlock = false
			}
			continue
		}
		if !inBlock {
			start = line.base - doc.base
			inBlock = true
		}
	}
	if inBlock {
		scopes = append(scopes, searchDocument{content: doc.content[start:], properties: doc.properties, base: doc.base + start})
	}
	return scopes
}

func sectionScopes(doc searchDocument) []searchDocument {
	lines := lineScopes(doc)
	if len(lines) == 0 {
		return nil
	}
	var scopes []searchDocument
	start := 0
	for index, line := range lines {
		if index > 0 && isHeading(line.content) {
			scopes = append(scopes, searchDocument{content: doc.content[start : line.base-doc.base], properties: doc.properties, base: doc.base + start})
			start = line.base - doc.base
		}
	}
	scopes = append(scopes, searchDocument{content: doc.content[start:], properties: doc.properties, base: doc.base + start})
	return scopes
}

func isHeading(line string) bool {
	trimmed := strings.TrimLeft(line, " ")
	level := 0
	for level < len(trimmed) && trimmed[level] == '#' {
		level++
	}
	return level > 0 && level < len(trimmed) && strings.ContainsRune(" \t", rune(trimmed[level]))
}

func findText(text, query string, caseSensitive bool) int {
	if !caseSensitive {
		text, query = strings.ToLower(text), strings.ToLower(query)
	}
	return strings.Index(text, query)
}

func countText(text, query string, caseSensitive bool) int {
	if query == "" {
		return 0
	}
	if !caseSensitive {
		text, query = strings.ToLower(text), strings.ToLower(query)
	}
	return strings.Count(text, query)
}

func searchContext(doc searchDocument, offset, limit int) (int, string) {
	if offset < 0 || offset >= len(doc.content) {
		return 0, ""
	}
	lineStart := strings.LastIndex(doc.content[:offset], "\n") + 1
	lineEnd := strings.Index(doc.content[offset:], "\n")
	if lineEnd < 0 {
		lineEnd = len(doc.content)
	} else {
		lineEnd += offset
	}
	line := strings.TrimSpace(doc.content[lineStart:lineEnd])
	return strings.Count(doc.content[:lineStart], "\n") + 1, truncateRunes(line, limit)
}

func truncateRunes(text string, limit int) string {
	if limit == 0 {
		return text
	}
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return string(runes[:limit]) + "…"
}

type searchTokenKind int

const (
	searchTokenText searchTokenKind = iota
	searchTokenPhrase
	searchTokenRegex
	searchTokenProperty
	searchTokenOpenGroup
	searchTokenCloseGroup
	searchTokenNegation
)

type searchToken struct {
	kind  searchTokenKind
	value string
}

type searchParser struct {
	tokens []searchToken
	index  int
}

func parseSearchQuery(input string) (searchNode, error) {
	tokens, err := lexSearch(input)
	if err != nil {
		return nil, err
	}
	if len(tokens) == 0 {
		return nil, fmt.Errorf("search query is empty")
	}
	parser := searchParser{tokens: tokens}
	query, err := parser.parseOr()
	if err != nil {
		return nil, err
	}
	if parser.index != len(parser.tokens) {
		return nil, fmt.Errorf("unexpected token %q", parser.tokens[parser.index].value)
	}
	return query, nil
}

func (p *searchParser) parseOr() (searchNode, error) {
	left, err := p.parseAnd()
	if err != nil {
		return nil, err
	}
	for p.peekText("OR") {
		p.index++
		right, err := p.parseAnd()
		if err != nil {
			return nil, fmt.Errorf("OR requires an expression: %w", err)
		}
		left = orNode{left: left, right: right}
	}
	return left, nil
}

func (p *searchParser) parseAnd() (searchNode, error) {
	left, err := p.parseUnary()
	if err != nil {
		return nil, err
	}
	for p.canStartExpression() {
		right, err := p.parseUnary()
		if err != nil {
			return nil, err
		}
		left = andNode{left: left, right: right}
	}
	return left, nil
}

func (p *searchParser) parseUnary() (searchNode, error) {
	if p.index < len(p.tokens) && p.tokens[p.index].kind == searchTokenNegation {
		p.index++
		child, err := p.parseUnary()
		if err != nil {
			return nil, fmt.Errorf("negation requires an expression: %w", err)
		}
		return notNode{child: child}, nil
	}
	return p.parsePrimary()
}

func (p *searchParser) parsePrimary() (searchNode, error) {
	if p.index >= len(p.tokens) {
		return nil, fmt.Errorf("expected expression")
	}
	token := p.tokens[p.index]
	p.index++
	switch token.kind {
	case searchTokenOpenGroup:
		node, err := p.parseOr()
		if err != nil {
			return nil, err
		}
		if p.index >= len(p.tokens) || p.tokens[p.index].kind != searchTokenCloseGroup {
			return nil, fmt.Errorf("unclosed group")
		}
		p.index++
		return node, nil
	case searchTokenPhrase:
		return termNode{text: token.value}, nil
	case searchTokenRegex:
		return newRegexNode(token.value)
	case searchTokenProperty:
		return parsePropertyNode(token.value)
	case searchTokenText:
		if field, value, ok := splitSearchField(token.value); ok {
			if value != "" {
				child, err := parseInlineSearchValue(value)
				if err != nil {
					return nil, err
				}
				return fieldNode{field: field, child: child}, nil
			}
			child, err := p.parsePrimary()
			if err != nil {
				return nil, fmt.Errorf("%s requires an expression", field)
			}
			return fieldNode{field: field, child: child}, nil
		}
		return termNode{text: token.value}, nil
	default:
		return nil, fmt.Errorf("expected expression, got %q", token.value)
	}
}

func (p *searchParser) canStartExpression() bool {
	if p.index >= len(p.tokens) || p.peekText("OR") {
		return false
	}
	switch p.tokens[p.index].kind {
	case searchTokenText, searchTokenPhrase, searchTokenRegex, searchTokenProperty, searchTokenOpenGroup, searchTokenNegation:
		return true
	default:
		return false
	}
}

func (p *searchParser) peekText(value string) bool {
	return p.index < len(p.tokens) && p.tokens[p.index].kind == searchTokenText && p.tokens[p.index].value == value
}

func newRegexNode(pattern string) (searchNode, error) {
	compiled, err := regexp.Compile(pattern)
	if err != nil {
		return nil, fmt.Errorf("invalid regular expression %q: %w", pattern, err)
	}
	return regexNode{pattern: pattern, regex: compiled}, nil
}

func parseInlineSearchValue(value string) (searchNode, error) {
	if strings.HasPrefix(value, "/") && strings.HasSuffix(value, "/") && len(value) > 1 {
		return newRegexNode(value[1 : len(value)-1])
	}
	return termNode{text: value}, nil
}

func splitSearchField(value string) (string, string, bool) {
	field, payload, found := strings.Cut(value, ":")
	if !found {
		return "", "", false
	}
	switch field {
	case "file", "path", "content", "match-case", "ignore-case", "tag", "line", "block", "section", "task", "task-todo", "task-done":
		return field, payload, true
	default:
		return "", "", false
	}
}

func parsePropertyNode(raw string) (searchNode, error) {
	key, value, hasValue := strings.Cut(raw, ":")
	key = strings.TrimSpace(key)
	if key == "" {
		return nil, fmt.Errorf("property name is empty")
	}
	if !hasValue {
		return propertyNode{key: key}, nil
	}
	value = strings.TrimSpace(value)
	if value == "null" {
		return propertyNode{key: key, value: termNode{text: value}, null: true}, nil
	}
	child, err := parseSearchQuery(value)
	if err != nil {
		return nil, err
	}
	return propertyNode{key: key, value: child}, nil
}

func lexSearch(input string) ([]searchToken, error) {
	var tokens []searchToken
	for index := 0; index < len(input); {
		if unicode.IsSpace(rune(input[index])) {
			index++
			continue
		}
		switch input[index] {
		case '(':
			tokens = append(tokens, searchToken{kind: searchTokenOpenGroup, value: "("})
			index++
			continue
		case ')':
			tokens = append(tokens, searchToken{kind: searchTokenCloseGroup, value: ")"})
			index++
			continue
		case '"':
			value, next, err := lexDelimited(input, index, '"')
			if err != nil {
				return nil, err
			}
			tokens = append(tokens, searchToken{kind: searchTokenPhrase, value: value})
			index = next
			continue
		case '/':
			value, next, err := lexDelimited(input, index, '/')
			if err != nil {
				return nil, err
			}
			tokens = append(tokens, searchToken{kind: searchTokenRegex, value: value})
			index = next
			continue
		case '[':
			value, next, err := lexDelimited(input, index, ']')
			if err != nil {
				return nil, err
			}
			tokens = append(tokens, searchToken{kind: searchTokenProperty, value: value})
			index = next
			continue
		case '-':
			tokens = append(tokens, searchToken{kind: searchTokenNegation, value: "-"})
			index++
			continue
		}

		start := index
		for index < len(input) && !unicode.IsSpace(rune(input[index])) && !strings.ContainsRune("()\"[]", rune(input[index])) {
			index++
		}
		if start == index {
			return nil, fmt.Errorf("unexpected character %q", input[index])
		}
		tokens = append(tokens, searchToken{kind: searchTokenText, value: input[start:index]})
	}
	return tokens, nil
}

func lexDelimited(input string, start int, delimiter byte) (string, int, error) {
	var value strings.Builder
	for index := start + 1; index < len(input); index++ {
		if input[index] == '\\' && index+1 < len(input) {
			if input[index+1] == delimiter || (delimiter == '"' && input[index+1] == '\\') {
				value.WriteByte(input[index+1])
				index++
				continue
			}
			value.WriteByte(input[index])
			continue
		}
		if input[index] == delimiter {
			return value.String(), index + 1, nil
		}
		value.WriteByte(input[index])
	}
	return "", 0, fmt.Errorf("unclosed %q expression", string(delimiter))
}
