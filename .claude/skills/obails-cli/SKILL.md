# Obails CLI Skill

Interact with an Obsidian-compatible vault from the command line. This skill is designed for AI Agent usage (JSON output by default) and works without the Obails desktop app running.

## Binary Location

```
ob
```

If not in PATH, build with: `cd <project_root> && go build -tags cli -o bin/ob ./cmd/cli`

## Syntax

Supports both standard flags and Obsidian-compatible `key=value` syntax:

```bash
ob <command> [key=value...] [--flags...]
```

Examples:
```bash
ob read file="MyNote"
ob read --file MyNote
ob append file="MyNote" content="Hello" section="## Notes"
```

## Global Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--format` | `json` | Output format: `json` or `text` |
| `--vault` | (from config) | Override vault path |

## Commands

### App Control

#### `open` - Open a note in the Obails app
```bash
ob open file=<name>              # Open app with specific note
ob open path=<relative_path>     # Open app with specific path
ob open                          # Just launch the app
```

### Read Operations

#### `read` - Read a note
```bash
ob read file=<name>          # Wiki-link resolution
ob read path=<relative_path> # Direct path
ob read file=<name> --section "## Heading"  # Extract section only
```

#### `outline` - Extract headings
```bash
ob outline file=<name>
ob outline file=<name> style=md    # Markdown list
ob outline file=<name> --total     # Count only
```

#### `properties` - Read frontmatter
```bash
ob properties file=<name>
ob properties file=<name> name=title  # Single property
```

#### `search` - Search vault
```bash
ob search query=<text>              # File name search
ob search query=<text> --matches    # Content search
ob search query=<text> limit=10 --case  # Case-sensitive, limit results
```

### Write Operations

#### `create` - Create a new note
```bash
ob create name=<name>
ob create name=<name> content="Initial content"
ob create name=<name> template=<template_name>
ob create name=<name> folder=subfolder --overwrite --silent
```

#### `append` - Append to a note
```bash
ob append file=<name> content="New line"
ob append file=<name> content="In section" section="## Notes"
ob append file=<name> content=" inline text" --inline  # No newline prefix
ob append file=<name> content="Line 1\nLine 2"  # \n = newline
```

#### `prepend` - Prepend to a note
```bash
ob prepend file=<name> content="At the top"
ob prepend file=<name> content=" inline" --inline
```
Inserts after frontmatter if present.

#### `upsert` - Create or append
```bash
ob upsert file=<name> content="Text"
ob upsert file=<name> content="Text" section="## Log"
ob upsert file=<name> content="Text" template=<tmpl>
```
If note exists: appends. If not: creates (optionally from template), then appends.

### Daily Notes

#### `daily read` - Read today's daily note
```bash
ob daily read
ob daily read --date 2025-01-15
```
Creates the note if it doesn't exist.

#### `daily append` - Append to daily note
```bash
ob daily append content="Meeting notes"
ob daily append content="In section" section="## Notes"
```

#### `daily prepend` - Prepend to daily note
```bash
ob daily prepend content="Priority item"
```

#### `daily timeline` - Add timestamped entry
```bash
ob daily timeline content="Started working on feature X"
ob daily timeline content="Review PR" --todo  # Creates checkbox: - [ ] HH:MM text
```
Adds entry to the configured Memos section with auto-timestamp.

### Tasks

#### `tasks` - List tasks
```bash
ob tasks                        # All tasks in vault
ob tasks file=<name>            # Tasks in specific file
ob tasks --daily                # Tasks in today's daily note
ob tasks --todo                 # Uncompleted only
ob tasks --done                 # Completed only
ob tasks --total                # Count only
```

#### `task` - Modify a task
```bash
ob task file=<name> line=18 --toggle     # Toggle done/undone
ob task file=<name> line=18 --done        # Mark done
ob task file=<name> line=18 --todo        # Mark undone
ob task file=<name> line=18 status=/       # Custom status (e.g., in-progress)
```

### Link Analysis

#### `links` - Outgoing links from a file
```bash
ob links file=<name>
ob links file=<name> --total
```

#### `backlinks` - Files linking to a file
```bash
ob backlinks file=<name>
ob backlinks file=<name> --total
```

#### `orphans` - Files with no incoming links
```bash
ob orphans
ob orphans --total
```

#### `deadends` - Files with no outgoing links
```bash
ob deadends
ob deadends --total
```

#### `unresolved` - Broken wiki-links
```bash
ob unresolved
ob unresolved --total
```

## Configuration

Config file: `~/.config/obails/config.toml`

```toml
[vault]
  path = "/path/to/your/vault"

[daily_notes]
  folder = "02_dailynotes"
  format = "2006-01-02"

[timeline]
  section = "## Memos"
  time_format = "15:04"

[templates]
  folder = "99_template"
```

## Common Patterns for AI Agents

### Append a learning to a knowledge note
```bash
ob upsert file="Go Best Practices" \
  content="## Error Handling\n\nAlways wrap errors with context using fmt.Errorf." \
  section="## Notes"
```

### Log daily work progress
```bash
ob daily timeline content="Implemented CLI for obails project"
```

### Find related notes
```bash
ob backlinks file="Architecture"
```

### Create a new note from template
```bash
ob create name="Meeting 2025-01-15" template="meeting"
```

### Read a section of a note
```bash
ob read file="ProjectPlan" --section "## Phase 2"
```
