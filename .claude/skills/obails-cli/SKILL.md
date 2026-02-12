# Obails CLI Skill

Interact with an Obsidian-compatible vault from the command line. This skill is designed for AI Agent usage (JSON output by default) and works without the Obails desktop app running.

## Binary Location

```
obails-cli
```

If not in PATH, build with: `cd <project_root> && go build -tags cli -o bin/obails-cli ./cmd/cli`

## Syntax

Supports both standard flags and Obsidian-compatible `key=value` syntax:

```bash
obails-cli <command> [key=value...] [--flags...]
```

Examples:
```bash
obails-cli read file="MyNote"
obails-cli read --file MyNote
obails-cli append file="MyNote" content="Hello" section="## Notes"
```

## Global Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--format` | `json` | Output format: `json` or `text` |
| `--vault` | (from config) | Override vault path |

## Commands

### Read Operations

#### `read` - Read a note
```bash
obails-cli read file=<name>          # Wiki-link resolution
obails-cli read path=<relative_path> # Direct path
obails-cli read file=<name> --section "## Heading"  # Extract section only
```

#### `outline` - Extract headings
```bash
obails-cli outline file=<name>
obails-cli outline file=<name> style=md    # Markdown list
obails-cli outline file=<name> --total     # Count only
```

#### `properties` - Read frontmatter
```bash
obails-cli properties file=<name>
obails-cli properties file=<name> name=title  # Single property
```

#### `search` - Search vault
```bash
obails-cli search query=<text>              # File name search
obails-cli search query=<text> --matches    # Content search
obails-cli search query=<text> limit=10 --case  # Case-sensitive, limit results
```

### Write Operations

#### `create` - Create a new note
```bash
obails-cli create name=<name>
obails-cli create name=<name> content="Initial content"
obails-cli create name=<name> template=<template_name>
obails-cli create name=<name> folder=subfolder --overwrite --silent
```

#### `append` - Append to a note
```bash
obails-cli append file=<name> content="New line"
obails-cli append file=<name> content="In section" section="## Notes"
obails-cli append file=<name> content=" inline text" --inline  # No newline prefix
obails-cli append file=<name> content="Line 1\nLine 2"  # \n = newline
```

#### `prepend` - Prepend to a note
```bash
obails-cli prepend file=<name> content="At the top"
obails-cli prepend file=<name> content=" inline" --inline
```
Inserts after frontmatter if present.

#### `upsert` - Create or append
```bash
obails-cli upsert file=<name> content="Text"
obails-cli upsert file=<name> content="Text" section="## Log"
obails-cli upsert file=<name> content="Text" template=<tmpl>
```
If note exists: appends. If not: creates (optionally from template), then appends.

### Daily Notes

#### `daily read` - Read today's daily note
```bash
obails-cli daily read
obails-cli daily read --date 2025-01-15
```
Creates the note if it doesn't exist.

#### `daily append` - Append to daily note
```bash
obails-cli daily append content="Meeting notes"
obails-cli daily append content="In section" section="## Notes"
```

#### `daily prepend` - Prepend to daily note
```bash
obails-cli daily prepend content="Priority item"
```

#### `daily timeline` - Add timestamped entry
```bash
obails-cli daily timeline content="Started working on feature X"
obails-cli daily timeline content="Review PR" --todo  # Creates checkbox: - [ ] HH:MM text
```
Adds entry to the configured Memos section with auto-timestamp.

### Tasks

#### `tasks` - List tasks
```bash
obails-cli tasks                        # All tasks in vault
obails-cli tasks file=<name>            # Tasks in specific file
obails-cli tasks --daily                # Tasks in today's daily note
obails-cli tasks --todo                 # Uncompleted only
obails-cli tasks --done                 # Completed only
obails-cli tasks --total                # Count only
```

#### `task` - Modify a task
```bash
obails-cli task file=<name> line=18 --toggle     # Toggle done/undone
obails-cli task file=<name> line=18 --done        # Mark done
obails-cli task file=<name> line=18 --todo        # Mark undone
obails-cli task file=<name> line=18 status=/       # Custom status (e.g., in-progress)
```

### Link Analysis

#### `links` - Outgoing links from a file
```bash
obails-cli links file=<name>
obails-cli links file=<name> --total
```

#### `backlinks` - Files linking to a file
```bash
obails-cli backlinks file=<name>
obails-cli backlinks file=<name> --total
```

#### `orphans` - Files with no incoming links
```bash
obails-cli orphans
obails-cli orphans --total
```

#### `deadends` - Files with no outgoing links
```bash
obails-cli deadends
obails-cli deadends --total
```

#### `unresolved` - Broken wiki-links
```bash
obails-cli unresolved
obails-cli unresolved --total
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
obails-cli upsert file="Go Best Practices" \
  content="## Error Handling\n\nAlways wrap errors with context using fmt.Errorf." \
  section="## Notes"
```

### Log daily work progress
```bash
obails-cli daily timeline content="Implemented CLI for obails project"
```

### Find related notes
```bash
obails-cli backlinks file="Architecture"
```

### Create a new note from template
```bash
obails-cli create name="Meeting 2025-01-15" template="meeting"
```

### Read a section of a note
```bash
obails-cli read file="ProjectPlan" --section "## Phase 2"
```
