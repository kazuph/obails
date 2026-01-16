# Ideas

## Feature Ideas

1. Full-text search
2. Graph view
3. Plugin system

## Architecture

```mermaid
flowchart LR
    subgraph Frontend
        UI[TypeScript/Vite]
    end
    subgraph Backend
        Go[Go Services]
        FS[File System]
    end
    UI <--> Go
    Go <--> FS
```
