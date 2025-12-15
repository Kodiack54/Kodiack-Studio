# Kodiack Studio

**AI-Powered Development Platform with Persistent Memory**

Kodiack Studio is a standalone development environment that gives AI assistants persistent memory, team collaboration, and cross-session context. It works with any IDE that supports terminal-based AI tools.

---

## Table of Contents

- [Overview](#overview)
- [The AI Team](#the-ai-team)
- [Architecture](#architecture)
- [Supported Systems](#supported-systems)
- [Installation](#installation)
- [Configuration](#configuration)
- [MCP Server Tools](#mcp-server-tools)
- [Chad Watcher](#chad-watcher)
- [Port Assignments](#port-assignments)
- [API Reference](#api-reference)
- [Roadmap](#roadmap)

---

## Overview

### The Problem

AI coding assistants like Claude Code are powerful, but they have no memory between sessions. Every time you start a new conversation, you lose:

- Context about what you were working on
- Knowledge of past decisions and why they were made
- Awareness of your codebase architecture
- Understanding of bugs you've fixed before

### The Solution

Kodiack Studio creates a persistent AI development team that remembers everything:

- **Deep Memory** - Knowledge base of your project, decisions, and patterns
- **Session Continuity** - Pick up exactly where you left off
- **Team Collaboration** - Multiple AI workers with specialized roles
- **Cross-IDE Support** - Works with VS Code, JetBrains, terminals, and more
- **Crash Resilience** - 24/7 monitoring survives AI crashes

---

## The AI Team

Kodiack Studio uses a team of specialized AI workers, each with a specific role:

### Susan - The Cataloger (Deep Memory)
**Port: 5403**

Susan is your AI team's long-term memory. She:
- Maintains knowledge base of architecture decisions
- Catalogs bugs, fixes, and patterns
- Tracks database schemas and API structures
- Provides context briefings at session start
- Remembers conversations across all sessions

### Chad - The Transcriber (Short-Term Memory)
**Port: 5401**

Chad captures everything in real-time:
- Monitors all AI terminal sessions 24/7
- Sends conversation chunks to Susan every 30 minutes
- Survives AI crashes (runs independently)
- Works on both local and server terminals
- Creates searchable transcripts

### Tiffany - The QA Engineer (Quality Assurance)
**Port: 5402** *(Planned)*

Tiffany handles testing and documentation:
- Runs automated test suites
- Reports bugs and regressions
- Generates API documentation
- Validates code changes
- Maintains test coverage reports

### Ryan - The Build Engineer (DevOps)
**Port: TBD** *(Planned)*

Ryan manages builds and deployments:
- Automates build pipelines
- Manages version releases
- Handles CI/CD workflows
- Monitors performance metrics
- Packages for distribution

### Claude - The Lead Developer
**Port: 5400**

The server-side Claude instance that:
- Executes code changes on the server
- Has direct access to the codebase
- Receives commands from local Claude via MCP
- Works in the actual development environment

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                    LOCAL DEVELOPMENT MACHINE                          │
│                                                                       │
│  ┌─────────────┐     ┌──────────────────┐                           │
│  │    IDE      │     │  Kodiack Studio  │                           │
│  │             │     │   MCP Server     │                           │
│  │ - VS Code   │     │                  │──────┐                    │
│  │ - JetBrains │────▶│ Claude Code CLI  │      │                    │
│  │ - Terminal  │     │                  │      │                    │
│  │ - Cursor    │     └──────────────────┘      │                    │
│  └─────────────┘              │                │                    │
│                               │                │                    │
│  ┌─────────────────┐          │                │                    │
│  │  Chad Watcher   │──────────┼────────────────┼───────────────┐    │
│  │  (24/7 Monitor) │          │                │               │    │
│  └─────────────────┘          │                │               │    │
└───────────────────────────────┼────────────────┼───────────────┼────┘
                                │                │               │
                         WebSocket          HTTP API        HTTP API
                                │                │               │
┌───────────────────────────────┼────────────────┼───────────────┼────┐
│                    KODIACK SERVER                                    │
│                                                                       │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐      │
│  │  Claude :5400   │  │  Susan :5403    │  │   Chad :5401    │      │
│  │                 │  │                 │  │                 │      │
│  │  Lead Developer │  │  Deep Memory    │  │  Transcripts    │      │
│  │  Code Execution │  │  Knowledge Base │  │  Session Logs   │      │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘      │
│                                │                                     │
│                       ┌────────┴────────┐                           │
│                       │    Database     │                           │
│                       │   (Supabase)    │                           │
│                       │                 │                           │
│                       │ - Knowledge     │                           │
│                       │ - Sessions      │                           │
│                       │ - Schemas       │                           │
│                       │ - Decisions     │                           │
│                       └─────────────────┘                           │
│                                                                       │
│  ┌─────────────────┐  ┌─────────────────┐                           │
│  │ Tiffany :5402   │  │   Ryan :????    │                           │
│  │   (Planned)     │  │   (Planned)     │                           │
│  │  QA Engineer    │  │  Build Engineer │                           │
│  └─────────────────┘  └─────────────────┘                           │
└──────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Session Start**: Claude Code calls `susan_get_briefing` via MCP to restore memory
2. **During Work**: Conversations are captured by Chad Watcher locally
3. **Every 30 Minutes**: Chad sends transcript chunks to Susan for cataloging
4. **Remote Execution**: Commands sent to Server Claude via `server_claude_send`
5. **Session End**: Final checkpoint saves everything to Susan's knowledge base

---

## Supported Systems

Kodiack Studio works with any development environment that supports Claude Code CLI:

### IDEs & Editors

| Platform | Support | Notes |
|----------|---------|-------|
| **Visual Studio Code** | ✅ Full | Native terminal integration |
| **JetBrains IDEs** | ✅ Full | IntelliJ, Rider, WebStorm, PyCharm, etc. |
| **Cursor** | ✅ Full | Fork of VS Code with AI features |
| **Neovim** | ✅ Full | Terminal-based |
| **Sublime Text** | ✅ Full | Via terminal panel |
| **Terminal/CMD** | ✅ Full | Direct CLI usage |
| **Windows Terminal** | ✅ Full | PowerShell, CMD, WSL |
| **iTerm2 / macOS Terminal** | ✅ Full | macOS native |

### Operating Systems

| OS | Support | Notes |
|----|---------|-------|
| **Windows 10/11** | ✅ Full | PowerShell or CMD |
| **macOS** | ✅ Full | Intel and Apple Silicon |
| **Linux** | ✅ Full | Any distribution |
| **WSL/WSL2** | ✅ Full | Windows Subsystem for Linux |

### Project Types

Kodiack Studio is language and framework agnostic:

- Web Development (React, Vue, Angular, Node.js)
- Game Development (Unity, Unreal, Godot)
- Mobile Development (React Native, Flutter)
- Backend Services (Python, Go, Rust, Java)
- Desktop Applications (.NET, Electron)
- Data Science (Jupyter, pandas, TensorFlow)

---

## Installation

### Prerequisites

- **Node.js** 18+
- **npm** or **yarn**
- **Claude Code CLI** installed and authenticated

### Quick Start

```bash
# Clone the repository
git clone https://github.com/Kodiack54/Kodiack-Studio.git

# Navigate to directory
cd Kodiack-Studio

# Install dependencies
npm install

# Verify installation
npm start
```

### Global Installation (Optional)

```bash
npm install -g .

# Now available as commands:
kodiack-studio  # Start MCP server
chad-watcher    # Start 24/7 transcript monitor
```

---

## Configuration

### Claude Code Settings

Add Kodiack Studio to your Claude Code configuration:

**Windows**: `%USERPROFILE%\.claude\settings.json`
**macOS/Linux**: `~/.claude/settings.json`

```json
{
  "mcpServers": {
    "kodiack-studio": {
      "command": "node",
      "args": ["C:/path/to/kodiack-studio/src/index.js"],
      "env": {
        "SUSAN_URL": "http://your-server:5403",
        "KODIACK_PROJECT": "/path/to/your/project",
        "CLAUDE_SERVER_WS": "ws://your-server:5400"
      }
    }
  }
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SUSAN_URL` | `http://161.35.229.220:5403` | Susan API endpoint |
| `KODIACK_PROJECT` | `/var/www/NextBid_Dev/dev-studio-5000` | Default project path |
| `CLAUDE_SERVER_WS` | `ws://161.35.229.220:5400` | Server Claude WebSocket |
| `CHAD_LOG_DIR` | `~/.claude/chad-logs` | Local transcript backup directory |

---

## MCP Server Tools

The Kodiack Studio MCP server provides these tools to Claude Code:

### Memory Tools (Susan)

#### `susan_get_briefing`
Get full context briefing at session start.

```javascript
// Returns: greeting, last session, todos, knowledge, ports, schemas
{
  project: "optional/project/path"
}
```

#### `susan_get_todos`
Get pending tasks and todos.

```javascript
{
  project: "optional/project/path",
  status: "pending" | "in_progress" | "completed" | "all"
}
```

#### `susan_search_knowledge`
Search the knowledge base.

```javascript
{
  query: "search terms",
  category: "optional-category"  // architecture, bug-fix, config, workflow
}
```

#### `susan_add_knowledge`
Add new knowledge entry.

```javascript
{
  title: "Knowledge Title",
  content: "The knowledge content...",
  category: "architecture",
  project: "optional/project/path"
}
```

#### `susan_log_session`
Log session activity for memory persistence.

```javascript
{
  summary: "What was accomplished",
  messages: [
    { role: "user", content: "..." },
    { role: "assistant", content: "..." }
  ],
  project: "optional/project/path"
}
```

#### `susan_get_ports`
Get port assignments for all services.

```javascript
{}  // No parameters required
```

### Remote Execution Tools (Server Claude)

#### `server_claude_connect`
Connect to the server-side Claude terminal.

```javascript
{
  project: "optional/project/path"
}
```

#### `server_claude_send`
Send a command to server Claude and get response.

```javascript
{
  command: "The command or message to send",
  waitMs: 5000  // How long to wait for response (default 5000ms)
}
```

#### `server_claude_output`
Get recent output from server Claude's terminal.

```javascript
{
  lines: 100  // Number of recent lines (default: all)
}
```

#### `server_claude_status`
Check connection status to server Claude.

```javascript
{}  // No parameters required
```

---

## Chad Watcher

Chad Watcher is a separate process that monitors your Claude Code sessions 24/7, independent of Claude itself.

### Why Separate?

- **Crash Resilience**: Claude Code crashes frequently. Chad survives.
- **Continuous Capture**: Never miss a conversation
- **Background Operation**: Runs silently in the background

### Starting Chad Watcher

```bash
# Start the watcher
npm run chad

# Or globally installed
chad-watcher
```

### How It Works

1. **Monitors** `~/.claude/history.jsonl` for new entries
2. **Buffers** conversation messages locally
3. **Checkpoints** every 30 minutes to Susan
4. **Backs up** locally to `~/.claude/chad-logs/`
5. **Saves** on graceful shutdown (SIGINT/SIGTERM)

### Running as Background Service

**Windows (Task Scheduler)**:
```cmd
schtasks /create /tn "Chad Watcher" /tr "node C:\path\to\chad-watcher.js" /sc onstart
```

**macOS/Linux (systemd)**:
```ini
# /etc/systemd/system/chad-watcher.service
[Unit]
Description=Chad Watcher - Kodiack Studio Transcript Monitor
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/chad-watcher.js
Restart=always
User=youruser

[Install]
WantedBy=multi-user.target
```

**macOS (launchd)**:
```xml
<!-- ~/Library/LaunchAgents/com.kodiack.chad-watcher.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.kodiack.chad-watcher</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/path/to/chad-watcher.js</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
```

---

## Port Assignments

| Port | Service | Status | Description |
|------|---------|--------|-------------|
| 5400 | Claude Terminal | Active | Server-side Claude Code execution |
| 5401 | Chad | Active | Transcript relay and monitoring |
| 5402 | Tiffany | Planned | QA testing and documentation |
| 5403 | Susan | Active | Knowledge base and deep memory |
| 5404 | Ryan | Planned | Build and deployment automation |
| 5405 | Dev Studio Web | Active | Web-based development interface |

---

## API Reference

### Susan API (HTTP REST)

Base URL: `http://server:5403`

#### GET /api/context
Get full context for a project.

```bash
curl "http://server:5403/api/context?project=/path/to/project"
```

Response:
```json
{
  "greeting": "Welcome back! Last session was 2 hours ago.",
  "lastSession": {
    "startedAt": "2024-01-15T10:00:00Z",
    "endedAt": "2024-01-15T12:00:00Z",
    "summary": "Implemented user authentication"
  },
  "todos": [...],
  "knowledge": [...],
  "ports": [...],
  "schemas": [...]
}
```

#### POST /api/message
Log a conversation message.

```bash
curl -X POST "http://server:5403/api/message" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "local-123456",
    "projectPath": "/path/to/project",
    "message": {
      "role": "user",
      "content": "Fix the login bug",
      "timestamp": "2024-01-15T10:30:00Z"
    }
  }'
```

#### POST /api/remember
Save a knowledge note.

```bash
curl -X POST "http://server:5403/api/remember" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "bug-fix",
    "title": "Fixed login redirect loop",
    "summary": "The issue was caused by...",
    "projectPath": "/path/to/project",
    "tags": ["auth", "bug"],
    "importance": 4
  }'
```

#### GET /api/query
Query the knowledge base.

```bash
curl "http://server:5403/api/query?q=authentication&category=architecture"
```

#### GET /api/ports
Get all port assignments.

```bash
curl "http://server:5403/api/ports"
```

### Chad WebSocket (Real-time)

Connect: `ws://server:5401?path=/project/path&mode=claude`

Message format:
```json
{
  "type": "input" | "output",
  "data": "message content"
}
```

### Server Claude WebSocket

Connect: `ws://server:5400?path=/project/path&mode=claude`

Send commands:
```json
{"type": "input", "data": "your command here"}
{"type": "input", "data": "\r"}  // Enter key
```

Receive output:
```json
{"type": "output", "data": "terminal output..."}
```

---

## Roadmap

### Phase 1: Core Infrastructure (Current)
- [x] Susan - Knowledge base and memory
- [x] Chad - Transcript capture and relay
- [x] MCP Server - Claude Code integration
- [x] Local Chad Watcher - 24/7 monitoring
- [x] Server Claude connection

### Phase 2: QA Integration
- [ ] Tiffany - QA worker on port 5402
- [ ] Automated test running
- [ ] Bug reporting integration
- [ ] Documentation generation
- [ ] Test coverage tracking

### Phase 3: Build Automation
- [ ] Ryan - Build engineer on port TBD
- [ ] CI/CD pipeline management
- [ ] Multi-platform builds
- [ ] Version management
- [ ] Release automation

### Phase 4: Advanced Features
- [ ] Voice integration
- [ ] Project templates
- [ ] Team collaboration (multiple developers)
- [ ] Analytics dashboard
- [ ] Plugin system

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

## Contributing

Contributions welcome! Please read our contributing guidelines before submitting PRs.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/Kodiack54/Kodiack-Studio/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Kodiack54/Kodiack-Studio/discussions)

---

*Built with persistence by the Kodiack Team*
