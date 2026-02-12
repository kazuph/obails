package services

import (
	"fmt"
	"strings"
)

// SectionService provides operations on markdown sections (headings).
type SectionService struct{}

// NewSectionService creates a new SectionService.
func NewSectionService() *SectionService {
	return &SectionService{}
}

// headingLevel returns the heading level (number of leading '#') of a line.
// Returns 0 if the line is not a heading.
func headingLevel(line string) int {
	trimmed := strings.TrimSpace(line)
	if !strings.HasPrefix(trimmed, "#") {
		return 0
	}
	level := 0
	for _, ch := range trimmed {
		if ch == '#' {
			level++
		} else {
			break
		}
	}
	// Must be followed by a space to be a valid heading (e.g. "## Foo")
	if level > 0 && level < len(trimmed) && trimmed[level] == ' ' {
		return level
	}
	// Heading that is just "#" with nothing after — not standard, but handle gracefully
	if level == len(trimmed) {
		return level
	}
	return 0
}

// ExtractSection extracts the content under the given heading.
// It returns everything from the heading line (inclusive) down to (but not including)
// the next heading of the same or higher level.
// If the heading is not found, an error is returned.
func (s *SectionService) ExtractSection(content string, sectionHeading string) (string, error) {
	lines := strings.Split(content, "\n")
	targetLevel := headingLevel(sectionHeading)
	if targetLevel == 0 {
		return "", fmt.Errorf("invalid section heading: %q", sectionHeading)
	}

	startIdx := -1
	for i, line := range lines {
		if strings.TrimSpace(line) == strings.TrimSpace(sectionHeading) {
			startIdx = i
			break
		}
	}
	if startIdx == -1 {
		return "", fmt.Errorf("section not found: %q", sectionHeading)
	}

	// Find the end: next heading with level <= targetLevel
	endIdx := len(lines)
	for i := startIdx + 1; i < len(lines); i++ {
		lvl := headingLevel(lines[i])
		if lvl > 0 && lvl <= targetLevel {
			endIdx = i
			break
		}
	}

	return strings.Join(lines[startIdx:endIdx], "\n"), nil
}

// AppendToSection appends an entry at the end of the given section
// (just before the next heading of the same or higher level).
// If the section heading is not found, the entry is appended at the end of the content.
func (s *SectionService) AppendToSection(content string, sectionHeading string, entry string) string {
	lines := strings.Split(content, "\n")
	targetLevel := headingLevel(sectionHeading)

	startIdx := -1
	for i, line := range lines {
		if strings.TrimSpace(line) == strings.TrimSpace(sectionHeading) {
			startIdx = i
			break
		}
	}

	if startIdx == -1 {
		// Section not found — append at end
		if content != "" && !strings.HasSuffix(content, "\n") {
			return content + "\n" + entry
		}
		return content + entry
	}

	// Find the end of the section
	endIdx := len(lines)
	for i := startIdx + 1; i < len(lines); i++ {
		lvl := headingLevel(lines[i])
		if lvl > 0 && lvl <= targetLevel {
			endIdx = i
			break
		}
	}

	// Insert the entry just before endIdx
	// Remove trailing blank lines within the section before inserting
	insertIdx := endIdx
	result := make([]string, 0, len(lines)+1)
	result = append(result, lines[:insertIdx]...)
	result = append(result, entry)
	result = append(result, lines[insertIdx:]...)

	return strings.Join(result, "\n")
}
