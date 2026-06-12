---
name: ob
description: CLI for Obsidian-compatible vaults. Read, write, search, and manage notes. Use when the user asks to interact with their vault, daily notes, or knowledge base.
allowed-tools: Bash, Read
---

# ob - Obsidian Vault CLI

Interact with an Obsidian-compatible vault from the command line.
JSON output by default (for AI Agent integration). Works without the desktop app.

## Prerequisites

Requires Go 1.21+ installed. On first use, build the binary:

```bash
cd ${CLAUDE_PLUGIN_ROOT} && go build -tags cli -o /usr/local/bin/ob ./cmd/cli
```

Then configure your vault:

```bash
mkdir -p ~/.config/obails
cat > ~/.config/obails/config.toml << 'TOML'
[vault]
  path = "/path/to/your/vault"

[daily_notes]
  folder = "daily"
  format = "2006-01-02"

[timeline]
  section = "## Memos"
  time_format = "15:04"

[templates]
  folder = "templates"
TOML
```

## Syntax

```bash
ob <command> [key=value...] [--flags...]
```

Both standard flags (`--file MyNote`) and Obsidian-compatible `key=value` syntax (`file=MyNote`) are supported.

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
ob read file=<name>                            # Wiki-link resolution
ob read path=<relative_path>                   # Direct path
ob read file=<name> --section "## Heading"     # Extract section only
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
ob search query=<text>                # File name search
ob search query=<text> --matches      # Content search
ob search query=<text> limit=10 --case
```

### Write Operations

#### `create` - Create a new note
```bash
ob create name=<name>
ob create name=<name> content="Initial content"
ob create name=<name> --content-file note.md
cat note.md | ob create name=<name> --content-file -
ob create name=<name> template=<template_name>
ob create name=<name> folder=subfolder --overwrite --silent
```

`content=` and `--content-file` cannot be used together. `--content-file` reads bytes verbatim; `--content-file -` reads stdin verbatim.

#### `append` - Append to a note
```bash
ob append file=<name> content="New line"
ob append file=<name> --content-file paragraph.md
cat paragraph.md | ob append file=<name> --content-file -
ob append file=<name> content="In section" section="## Notes"
ob append file=<name> content=" inline text" --inline
ob append file=<name> content="Line 1\nLine 2"
```

`content=` and `--content-file` cannot be used together. `--content-file` reads bytes verbatim; `--content-file -` reads stdin verbatim.

#### `prepend` - Prepend to a note (after frontmatter)
```bash
ob prepend file=<name> content="At the top"
ob prepend file=<name> content=" inline" --inline
```

#### `upsert` - Create or append
```bash
ob upsert file=<name> content="Text"
ob upsert file=<name> --content-file entry.md
cat entry.md | ob upsert file=<name> --content-file -
ob upsert file=<name> content="Text" section="## Log"
ob upsert file=<name> content="Text" template=<tmpl>
```

`content=` and `--content-file` cannot be used together. `--content-file` reads bytes verbatim; `--content-file -` reads stdin verbatim.

#### `delete` - Delete a note
```bash
ob delete file=<name>              # Move to Trash
ob delete path=<relative_path>     # Move to Trash
ob delete file=<name> --force      # Permanently delete
```

#### `move` - Move or rename a note
```bash
ob move file=<name> to=Archive/<name>
ob move path=folder/old.md to=folder/new.md
ob move file=<name> to=<new_name>
```

### Daily Notes

#### `daily read` - Read today's daily note
```bash
ob daily read
ob daily read --date 2025-01-15
```

#### `daily append` / `daily prepend`
```bash
ob daily append content="Meeting notes"
ob daily append content="Notes item" section="## Notes"
ob daily prepend content="Priority item"
```

#### `daily timeline` - Add timestamped entry
```bash
ob daily timeline content="Started working on feature X"
ob daily timeline content="Review PR" --todo
```

### Tasks

#### `tasks` - List tasks
```bash
ob tasks                        # All tasks in vault
ob tasks file=<name>            # Tasks in specific file
ob tasks --daily                # Today's daily note only
ob tasks --todo                 # Uncompleted only
ob tasks --done                 # Completed only
ob tasks --total                # Count only
```

#### `task` - Modify a task
```bash
ob task file=<name> line=18 --toggle
ob task file=<name> line=18 --done
ob task file=<name> line=18 status=/
```

### Link Analysis

```bash
ob links file=<name>            # Outgoing links
ob backlinks file=<name>        # Incoming links
ob orphans                      # Files with no incoming links
ob deadends                     # Files with no outgoing links
ob unresolved                   # Broken wiki-links
```

All link commands support `--total` for count only.

## Common AI Agent Patterns

```bash
# Log work progress
ob daily timeline content="Implemented auth module"

# Append learnings to a knowledge note without shell escaping surprises
cat notes.md | ob upsert file="Go Best Practices" --content-file - section="## Tips"

# Find related notes
ob backlinks file="Architecture"

# Move a finished note into an archive folder
ob move file="Draft Plan" to=Archive/DraftPlan

# Read a specific section
ob read file="ProjectPlan" --section "## Phase 2"

# Open note in the app after writing
ob daily timeline content="Done for today" && ob open
```
