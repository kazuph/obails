package services

import (
	"fmt"
	"net/url"
	"path/filepath"
	"sort"
	"strings"

	"github.com/kazuph/obails/models"
)

// GraphService provides graph data for the knowledge graph view.
type GraphService struct {
	linkService   *LinkService
	fileService   *FileService
	configService *ConfigService
}

func NewGraphService(linkService *LinkService, fileService *FileService, configService *ConfigService) *GraphService {
	return &GraphService{linkService: linkService, fileService: fileService, configService: configService}
}

// GetFullGraph returns graph data from the latest complete index generation.
func (s *GraphService) GetFullGraph() models.Graph {
	return s.GetFullGraphSnapshot().Graph
}

// GetFullGraphSnapshot identifies the index generation used for the graph material.
func (s *GraphService) GetFullGraphSnapshot() models.GraphSnapshot {
	return s.GetGraphFromLinkSnapshot(s.linkService.GetLinkIndexSnapshot())
}

// GetGraph returns a filtered graph from the latest published index generation.
func (s *GraphService) GetGraph(options models.GraphOptions) (models.Graph, error) {
	snapshot, err := s.GetGraphSnapshot(options)
	return snapshot.Graph, err
}

// GetGraphSnapshot returns filtered graph material derived from one immutable generation.
func (s *GraphService) GetGraphSnapshot(options models.GraphOptions) (models.GraphSnapshot, error) {
	return s.GetGraphFromLinkSnapshotWithOptions(s.linkService.GetLinkIndexSnapshot(), options)
}

// GetGraphFromLinkSnapshot derives a graph only from the supplied immutable link-index generation.
func (s *GraphService) GetGraphFromLinkSnapshot(snapshot models.LinkIndexSnapshot) models.GraphSnapshot {
	result, _ := s.GetGraphFromLinkSnapshotWithOptions(snapshot, models.GraphOptions{})
	return result
}

// GetGraphFromLinkSnapshotWithOptions never reads the vault: all link and tag data come from snapshot.
func (s *GraphService) GetGraphFromLinkSnapshotWithOptions(snapshot models.LinkIndexSnapshot, options models.GraphOptions) (models.GraphSnapshot, error) {
	result := models.GraphSnapshot{LinkIndexState: snapshot.LinkIndexState, Graph: models.Graph{Nodes: []models.GraphNode{}, Edges: []models.GraphEdge{}}}
	if !snapshot.Ready {
		return result, nil
	}
	if options.Depth < 0 {
		return result, fmt.Errorf("graph depth must be zero or greater")
	}

	nodeMap := make(map[string]*models.GraphNode, len(snapshot.Links))
	baseNameCount := make(map[string]int, len(snapshot.Links))
	for filePath := range snapshot.Links {
		if isMarkdownSource(filePath) {
			baseNameCount[displayName(filePath)]++
		}
	}
	ensureNote := func(filePath string) {
		if _, exists := nodeMap[filePath]; exists {
			return
		}
		label := displayName(filePath)
		if baseNameCount[label] > 1 {
			label = strings.TrimSuffix(filepath.ToSlash(filePath), filepath.Ext(filePath))
		}
		nodeMap[filePath] = &models.GraphNode{ID: filePath, Path: filePath, Label: label, Type: "note", Tags: append([]string(nil), snapshot.Metadata[filePath].Tags...)}
	}

	edges := make([]models.GraphEdge, 0)
	seenEdges := make(map[string]bool)
	for sourcePath, links := range snapshot.Links {
		if !isMarkdownSource(sourcePath) {
			continue
		}
		ensureNote(sourcePath)
		for _, link := range links {
			targetID := ""
			if !link.Exists {
				if !options.IncludeUnresolved {
					continue
				}
				targetID = graphUnresolvedID(link.Text)
				if _, exists := nodeMap[targetID]; !exists {
					nodeMap[targetID] = &models.GraphNode{ID: targetID, Label: link.Text, Type: "unresolved"}
				}
			} else if isMarkdownSource(link.TargetPath) {
				targetID = link.TargetPath
				ensureNote(link.TargetPath)
			} else {
				if !options.IncludeAttachments {
					continue
				}
				targetID = graphAttachmentID(link.TargetPath)
				if _, exists := nodeMap[targetID]; !exists {
					nodeMap[targetID] = &models.GraphNode{ID: targetID, Path: link.TargetPath, Label: displayName(link.TargetPath), Type: "attachment"}
				}
			}
			key := sourcePath + "\x00" + targetID
			if seenEdges[key] {
				continue
			}
			seenEdges[key] = true
			edges = append(edges, models.GraphEdge{Source: sourcePath, Target: targetID})
			nodeMap[sourcePath].LinkCount++
			nodeMap[targetID].LinkCount++
		}
	}
	filterGraph(&result.Graph, nodeMap, edges, options)
	return result, nil
}

func graphUnresolvedID(target string) string {
	return "unresolved:" + url.PathEscape(target)
}

func graphAttachmentID(path string) string {
	return "attachment:" + url.PathEscape(path)
}

func filterGraph(graph *models.Graph, nodeMap map[string]*models.GraphNode, edges []models.GraphEdge, options models.GraphOptions) {
	allowed := make(map[string]bool, len(nodeMap))
	for id, node := range nodeMap {
		if !matchesGraphFilters(*node, options) {
			continue
		}
		allowed[id] = true
	}
	if options.RootPath != "" {
		root := normalizeVaultPath(options.RootPath)
		if !allowed[root] {
			allowed = map[string]bool{}
		} else {
			allowed = localGraphNodes(root, options.Depth, allowed, edges)
		}
	}
	if options.ExcludeOrphans {
		connected := make(map[string]bool)
		for _, edge := range edges {
			if allowed[edge.Source] && allowed[edge.Target] {
				connected[edge.Source] = true
				connected[edge.Target] = true
			}
		}
		for id := range allowed {
			if nodeMap[id].Type == "note" && !connected[id] {
				delete(allowed, id)
			}
		}
	}
	filteredEdges := make([]models.GraphEdge, 0, len(edges))
	for _, edge := range edges {
		if allowed[edge.Source] && allowed[edge.Target] {
			filteredEdges = append(filteredEdges, edge)
		}
	}
	nodesByID := make(map[string]models.GraphNode, len(allowed))
	for id := range allowed {
		node := *nodeMap[id]
		node.LinkCount = 0
		nodesByID[id] = node
	}
	for _, edge := range filteredEdges {
		source := nodesByID[edge.Source]
		source.LinkCount++
		nodesByID[edge.Source] = source
		target := nodesByID[edge.Target]
		target.LinkCount++
		nodesByID[edge.Target] = target
	}
	nodes := make([]models.GraphNode, 0, len(nodesByID))
	for _, node := range nodesByID {
		nodes = append(nodes, node)
	}
	sort.Slice(nodes, func(i, j int) bool { return nodes[i].ID < nodes[j].ID })
	sort.Slice(filteredEdges, func(i, j int) bool {
		if filteredEdges[i].Source == filteredEdges[j].Source {
			return filteredEdges[i].Target < filteredEdges[j].Target
		}
		return filteredEdges[i].Source < filteredEdges[j].Source
	})
	graph.Nodes, graph.Edges = nodes, filteredEdges
}

func matchesGraphFilters(node models.GraphNode, options models.GraphOptions) bool {
	if len(options.Tags) > 0 && !hasAnyTag(node.Tags, options.Tags) {
		return false
	}
	if len(options.ExcludeTags) > 0 && hasAnyTag(node.Tags, options.ExcludeTags) {
		return false
	}
	query := strings.ToLower(strings.TrimSpace(options.Search))
	if query == "" {
		return true
	}
	if strings.Contains(strings.ToLower(node.Label), query) || strings.Contains(strings.ToLower(node.Path), query) {
		return true
	}
	for _, tag := range node.Tags {
		if strings.Contains(strings.ToLower(tag), query) {
			return true
		}
	}
	return false
}

func hasAnyTag(tags, filters []string) bool {
	for _, tag := range tags {
		for _, filter := range filters {
			if strings.EqualFold(strings.TrimPrefix(strings.TrimSpace(tag), "#"), strings.TrimPrefix(strings.TrimSpace(filter), "#")) {
				return true
			}
		}
	}
	return false
}

func localGraphNodes(root string, depth int, allowed map[string]bool, edges []models.GraphEdge) map[string]bool {
	result := map[string]bool{root: true}
	frontier := map[string]bool{root: true}
	for level := 0; level < depth; level++ {
		next := make(map[string]bool)
		for _, edge := range edges {
			if frontier[edge.Source] && allowed[edge.Target] && !result[edge.Target] {
				next[edge.Target] = true
			}
			if frontier[edge.Target] && allowed[edge.Source] && !result[edge.Source] {
				next[edge.Source] = true
			}
		}
		if len(next) == 0 {
			break
		}
		for id := range next {
			result[id] = true
		}
		frontier = next
	}
	return result
}

func (s *GraphService) GetGraphStats() map[string]int {
	graph := s.GetFullGraph()
	return map[string]int{"nodeCount": len(graph.Nodes), "edgeCount": len(graph.Edges)}
}
