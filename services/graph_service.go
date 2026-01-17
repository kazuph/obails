package services

import (
	"path/filepath"
	"strings"

	"github.com/kazuph/obails/models"
)

// GraphService provides graph data for the knowledge graph view
type GraphService struct {
	linkService   *LinkService
	fileService   *FileService
	configService *ConfigService
}

// NewGraphService creates a new GraphService
func NewGraphService(linkService *LinkService, fileService *FileService, configService *ConfigService) *GraphService {
	return &GraphService{
		linkService:   linkService,
		fileService:   fileService,
		configService: configService,
	}
}

// GetFullGraph returns the complete knowledge graph
func (s *GraphService) GetFullGraph() models.Graph {
	forwardIndex := s.linkService.ExportForwardIndex()

	nodeMap := make(map[string]*models.GraphNode)
	var edges []models.GraphEdge

	// Build nodes from forwardIndex (all files that have been indexed)
	for filePath, links := range forwardIndex {
		// Create node for this file
		if _, exists := nodeMap[filePath]; !exists {
			nodeMap[filePath] = &models.GraphNode{
				ID:        filePath,
				Label:     s.getNodeLabel(filePath),
				LinkCount: 0,
			}
		}

		// Process outgoing links
		for _, linkText := range links {
			// Try to resolve the link to a file path
			targetPath, exists := s.linkService.ResolveLink(linkText)
			if !exists {
				// Use the link text as-is for unresolved links
				targetPath = linkText
				if !strings.HasSuffix(targetPath, ".md") {
					targetPath += ".md"
				}
			}

			// Create target node if not exists
			if _, exists := nodeMap[targetPath]; !exists {
				nodeMap[targetPath] = &models.GraphNode{
					ID:        targetPath,
					Label:     s.getNodeLabel(targetPath),
					LinkCount: 0,
				}
			}

			// Create edge
			edges = append(edges, models.GraphEdge{
				Source: filePath,
				Target: targetPath,
			})

			// Increment link counts
			nodeMap[filePath].LinkCount++
			nodeMap[targetPath].LinkCount++
		}
	}

	// Convert map to slice
	nodes := make([]models.GraphNode, 0, len(nodeMap))
	for _, node := range nodeMap {
		nodes = append(nodes, *node)
	}

	return models.Graph{
		Nodes: nodes,
		Edges: edges,
	}
}

// GetGraphStats returns statistics about the graph
func (s *GraphService) GetGraphStats() map[string]int {
	graph := s.GetFullGraph()
	return map[string]int{
		"nodeCount": len(graph.Nodes),
		"edgeCount": len(graph.Edges),
	}
}

// getNodeLabel extracts a display label from a file path
func (s *GraphService) getNodeLabel(filePath string) string {
	// Remove .md extension and get base name
	baseName := filepath.Base(filePath)
	return strings.TrimSuffix(baseName, ".md")
}
