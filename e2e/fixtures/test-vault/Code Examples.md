# Code Examples

Obails supports syntax highlighting for many languages.

## TypeScript

```typescript
interface Note {
  title: string;
  content: string;
  tags: string[];
}

function createNote(title: string): Note {
  return {
    title,
    content: '',
    tags: []
  };
}
```

## Go

```go
package main

import "fmt"

type Note struct {
    Title   string
    Content string
}

func main() {
    note := Note{Title: "Hello", Content: "World"}
    fmt.Println(note.Title)
}
```

## Python

```python
class Note:
    def __init__(self, title: str):
        self.title = title
        self.content = ""

    def render(self) -> str:
        return f"# {self.title}\n\n{self.content}"
```

## Shell

```bash
# Build the app
wails3 build

# Run in development
wails3 dev
```

---

Related: [[Welcome]] | [[Features]]
