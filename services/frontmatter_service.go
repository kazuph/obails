package services

import (
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

// FrontmatterService provides operations on YAML frontmatter in markdown files.
type FrontmatterService struct{}

// NewFrontmatterService creates a new FrontmatterService.
func NewFrontmatterService() *FrontmatterService {
	return &FrontmatterService{}
}

// ParseFrontmatter splits a markdown document into its YAML frontmatter
// (as a map) and the remaining body.
// If no frontmatter is present, an empty map is returned with the full content as body.
func (s *FrontmatterService) ParseFrontmatter(content string) (map[string]any, string, error) {
	lines := strings.SplitAfter(content, "\n")

	// First line must be exactly "---\n" or "---\r\n"
	if len(lines) < 2 {
		return map[string]any{}, content, nil
	}
	firstLine := strings.TrimRight(lines[0], "\r\n")
	if firstLine != "---" {
		return map[string]any{}, content, nil
	}

	// Find the closing --- line
	closingLineIdx := -1
	for i := 1; i < len(lines); i++ {
		trimmed := strings.TrimRight(lines[i], "\r\n")
		if trimmed == "---" {
			closingLineIdx = i
			break
		}
	}

	if closingLineIdx == -1 {
		// No closing --- found, treat entire content as body (no frontmatter)
		return map[string]any{}, content, nil
	}

	// Extract YAML block (lines between the two ---)
	var yamlLines []string
	for i := 1; i < closingLineIdx; i++ {
		yamlLines = append(yamlLines, lines[i])
	}
	yamlBlock := strings.Join(yamlLines, "")

	// Extract body (lines after the closing ---)
	var bodyLines []string
	for i := closingLineIdx + 1; i < len(lines); i++ {
		bodyLines = append(bodyLines, lines[i])
	}
	body := strings.Join(bodyLines, "")

	props := make(map[string]any)
	if strings.TrimSpace(yamlBlock) != "" {
		if err := yaml.Unmarshal([]byte(yamlBlock), &props); err != nil {
			return nil, "", fmt.Errorf("failed to parse frontmatter YAML: %w", err)
		}
	}

	return props, body, nil
}

// SetFrontmatterProperty sets a property in the frontmatter.
// If no frontmatter exists, one is created.
func (s *FrontmatterService) SetFrontmatterProperty(content string, name string, value any) (string, error) {
	props, body, err := s.ParseFrontmatter(content)
	if err != nil {
		return "", err
	}

	props[name] = value
	return s.renderFrontmatter(props, body)
}

// RemoveFrontmatterProperty removes a property from the frontmatter.
// If the property does not exist, the content is returned unchanged.
// If removing the last property, the frontmatter block is removed entirely.
func (s *FrontmatterService) RemoveFrontmatterProperty(content string, name string) (string, error) {
	props, body, err := s.ParseFrontmatter(content)
	if err != nil {
		return "", err
	}

	if _, exists := props[name]; !exists {
		return content, nil
	}

	delete(props, name)

	if len(props) == 0 {
		// Remove frontmatter entirely
		return body, nil
	}

	return s.renderFrontmatter(props, body)
}

// renderFrontmatter serializes the properties map back into a frontmatter block
// prepended to the body.
func (s *FrontmatterService) renderFrontmatter(props map[string]any, body string) (string, error) {
	yamlBytes, err := yaml.Marshal(props)
	if err != nil {
		return "", fmt.Errorf("failed to serialize frontmatter: %w", err)
	}

	yamlStr := strings.TrimRight(string(yamlBytes), "\n")

	var sb strings.Builder
	sb.WriteString("---\n")
	sb.WriteString(yamlStr)
	sb.WriteString("\n---\n")
	sb.WriteString(body)

	return sb.String(), nil
}
