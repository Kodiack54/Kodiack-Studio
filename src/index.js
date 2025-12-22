#!/usr/bin/env node

/**
 * Kodiack Studio - MCP Server v1.1
 * Bridges Claude Code to Susan (memory) AND Chad (session logging)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';

const SUSAN_URL = process.env.SUSAN_URL || 'http://161.35.229.220:5403';
const RYAN_URL = process.env.RYAN_URL || 'http://161.35.229.220:5407';
const CHAD_WS_URL = process.env.CHAD_WS_URL || 'ws://161.35.229.220:5401';
const CLAUDE_SERVER_WS = process.env.CLAUDE_SERVER_WS || 'ws://161.35.229.220:5400';

// Use current working directory as project path - no hardcoded fallback
const DEFAULT_PROJECT = process.cwd();

let serverClaudeWs = null, serverClaudeBuffer = '', serverClaudeConnected = false;
let chadWs = null, chadConnected = false;

function connectToChad() {
  if (chadWs && chadConnected) return;
  const wsUrl = `${CHAD_WS_URL}/ws?project=${encodeURIComponent(DEFAULT_PROJECT)}&userId=claude-mcp`;
  console.error(`[Kodiack] Connecting to Chad: ${wsUrl}`);
  chadWs = new WebSocket(wsUrl);
  chadWs.on('open', () => { chadConnected = true; console.error('[Kodiack] Chad connected'); });
  chadWs.on('error', (e) => { console.error('[Kodiack] Chad error:', e.message); chadConnected = false; });
  chadWs.on('close', () => { chadConnected = false; chadWs = null; setTimeout(connectToChad, 5000); });
}

function logToChad(role, content) {
  if (!chadWs || !chadConnected) return;
  try { chadWs.send(JSON.stringify({ type: 'message', role, content, project: DEFAULT_PROJECT, ts: new Date().toISOString() })); } catch (e) {}
}

async function susanFetch(endpoint, options = {}) {
  const res = await fetch(`${SUSAN_URL}${endpoint}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } });
  if (!res.ok) throw new Error(`Susan ${res.status}`);
  return res.json();
}

function connectToServerClaude(projectPath = DEFAULT_PROJECT) {
  return new Promise((resolve, reject) => {
    if (serverClaudeWs && serverClaudeConnected) return resolve(true);
    const wsUrl = `${CLAUDE_SERVER_WS}?path=${encodeURIComponent(projectPath)}&mode=claude`;
    console.error(`[Kodiack] Connecting to server Claude: ${wsUrl}`);
    serverClaudeWs = new WebSocket(wsUrl);
    serverClaudeBuffer = '';
    serverClaudeWs.on('open', () => { serverClaudeConnected = true; console.error('[Kodiack] Server Claude connected'); resolve(true); });
    serverClaudeWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'output') {
          const clean = msg.data.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '').replace(/\x1b/g, '');
          serverClaudeBuffer += clean;
          if (serverClaudeBuffer.length > 50000) serverClaudeBuffer = serverClaudeBuffer.slice(-30000);
        }
      } catch (e) { serverClaudeBuffer += data.toString(); }
    });
    serverClaudeWs.on('error', (e) => { serverClaudeConnected = false; reject(e); });
    serverClaudeWs.on('close', () => { serverClaudeConnected = false; serverClaudeWs = null; });
    setTimeout(() => { if (!serverClaudeConnected) reject(new Error('Timeout')); }, 10000);
  });
}

const server = new Server({ name: 'kodiack-studio', version: '1.2.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'susan_get_briefing', description: 'Get full context briefing from Susan - includes last session, recent conversation, todos, knowledge, ports, schemas, and file structure. Call this at the start of each session to restore memory.', inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project path (defaults to current working directory)' } } } },
    { name: 'susan_get_todos', description: 'Get current pending todos/tasks from Susan', inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project path' }, status: { type: 'string', enum: ['pending', 'in_progress', 'completed', 'all'], description: 'Filter by status (defaults to pending)' } } } },
    { name: 'susan_search_knowledge', description: "Search Susan's knowledge base for relevant information", inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query' }, category: { type: 'string', description: 'Optional category filter' } }, required: ['query'] } },
    { name: 'susan_log_session', description: 'Log session activity to Susan for memory persistence', inputSchema: { type: 'object', properties: { project: { type: 'string' }, summary: { type: 'string', description: 'Summary of what was accomplished' }, messages: { type: 'array', description: 'Key messages to remember' } }, required: ['summary'] } },
    { name: 'susan_add_knowledge', description: "Add new knowledge to Susan's database for future reference", inputSchema: { type: 'object', properties: { title: { type: 'string' }, content: { type: 'string' }, category: { type: 'string' }, project: { type: 'string' } }, required: ['title', 'content', 'category'] } },
    { name: 'susan_get_ports', description: 'Get the port assignments for all services in the dev environment', inputSchema: { type: 'object', properties: {} } },
    { name: 'server_claude_connect', description: 'Connect to the server-side Claude terminal at :5400. Call this before sending commands.', inputSchema: { type: 'object', properties: { project: { type: 'string', description: 'Project path on the server (defaults to current working directory)' } } } },
    { name: 'server_claude_send', description: 'Send a command/message to server-side Claude and get the response. Server Claude will execute directly on the server codebase.', inputSchema: { type: 'object', properties: { command: { type: 'string', description: 'The command or message to send to server Claude' }, waitMs: { type: 'number', description: 'How long to wait for response (default 5000ms)' } }, required: ['command'] } },
    { name: 'server_claude_output', description: 'Get the recent output buffer from server Claude terminal', inputSchema: { type: 'object', properties: { lines: { type: 'number', description: 'Number of recent lines to return (default all)' } } } },
    { name: 'server_claude_status', description: 'Check if connected to server Claude terminal', inputSchema: { type: 'object', properties: {} } },
    { name: 'chad_status', description: 'Check if connected to Chad for session logging', inputSchema: { type: 'object', properties: {} } },
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  logToChad('system', `Tool: ${name}`);
  try {
    switch (name) {
      case 'susan_get_briefing': {
        const project = args?.project || DEFAULT_PROJECT;
        const ctx = await susanFetch(`/api/context?project=${encodeURIComponent(project)}`);

        // Fetch last 6 hours of session logs from Susan
        let sessions = [];
        try {
          const sessionsRes = await susanFetch(`/api/sessions?hours=6&limit=5`);
          sessions = sessionsRes.sessions || sessionsRes || [];
        } catch (e) { console.error('Failed to fetch sessions:', e.message); }

        // Fetch Ryan's whats-next recommendation
        let ryanRec = null;
        try {
          const ryanRes = await fetch(`${RYAN_URL}/api/whats-next`);
          if (ryanRes.ok) ryanRec = await ryanRes.json();
        } catch (e) { console.error('Failed to fetch Ryan:', e.message); }

        let b = "# Welcome Back, Claude!\n\n";

        // Identity & Context Section
        b += `## Who You Are\n`;
        b += `You are **Claude** - the lead AI developer at **Kodiack Studios**. You work directly with Michael (the human founder) on building software projects.\n\n`;

        b += `## Your AI Team\n`;
        b += `You're not alone! You have AI teammates that help you:\n`;
        b += `- **Chad** (:5401) - Transcription & Capture Specialist\n`;
        b += `- **Jen** (:5402) - Scrubbing & Signal Extraction\n`;
        b += `- **Susan** (:5403) - Classification & Sorting, your long-term memory\n`;
        b += `- **Clair** (:5404) - Documentation Specialist\n`;
        b += `- **Mike** (:5405) - QA Tester\n`;
        b += `- **Tiffany** (:5406) - QA Tester\n`;
        b += `- **Ryan** (:5407) - Roadmap & Prioritization Lead\n\n`;

        b += `## Server Claude\n`;
        b += `You have a **Server-Side Claude** running on the droplet at :5400. Use these tools to work directly on server code:\n`;
        b += `- \`server_claude_connect\` - Connect to server Claude\n`;
        b += `- \`server_claude_send\` - Send commands/messages to execute on server\n`;
        b += `- \`server_claude_output\` - Get recent output from server terminal\n\n`;

        b += `## Kodiack Studios\n`;
        b += `We build software products. Current projects live on the DigitalOcean droplet at 161.35.229.220.\n`;
        b += `- **Dev Studio** (:5000) - Development IDE with AI integration (React/Next.js)\n`;
        b += `- **NextBid** (:5100) - Auction platform project\n`;
        b += `- **AI Workers** - Chad, Susan, Clair, Ryan (Express.js services)\n`;
        b += `- **Auth Service** (:7000) - Handles authentication\n\n`;

        b += `## Tech Stack\n`;
        b += `- **Frontend:** React, Next.js, TypeScript, Tailwind CSS\n`;
        b += `- **Backend:** Node.js, Express.js\n`;
        b += `- **Database:** PostgreSQL (kodiack_ai db) with dev_* tables\n`;
        b += `- **Process Manager:** PM2 for all services\n`;
        b += `- **Real-time:** WebSockets for terminal & chat\n\n`;

        b += `## Your Role\n`;
        b += `You're the **front-end lead** working from Michael's Windows machine (C:\\Projects\\...).\n`;
        b += `Server Claude handles server-side code on the droplet (/var/www/Kodiack_Studio/...).\n`;
        b += `When you need server changes, use \`server_claude_send\` to tell Server Claude what to do.\n`;
        b += `Chad logs everything, Jen extracts insights, Susan files them, Ryan tracks the roadmap.\n\n`;

        b += `## Quick Commands\n`;
        b += `- \`/server <cmd>\` - Send command to Server Claude\n`;
        b += `- \`/ports\` - See all service ports\n`;
        b += `- \`/todos\` - Check pending tasks\n`;
        b += `- \`/remember <info>\` - Save knowledge for later\n`;
        b += `- \`/search <query>\` - Search Susan's knowledge base\n\n`;

        b += `---\n\n`;

        if (ctx.greeting) b += ctx.greeting + '\n\n';

        // Last Session Summary
        if (ctx.lastSession) {
          b += '## Last Session Summary\n';
          b += `- Started: ${ctx.lastSession.startedAt}\n- Ended: ${ctx.lastSession.endedAt}\n`;
          if (ctx.lastSession.summary) b += `- Summary: ${ctx.lastSession.summary}\n`;
          b += '\n';
        }

        // Chad's Last 3 Session Logs (Full Content - cleaned)
        if (sessions.length > 0) {
          b += '## Chad\'s Session Logs (Last 3)\n\n';
          sessions.slice(0, 3).forEach((s, i) => {
            b += `### Session ${i + 1} - ${s.started_at || s.startedAt || 'Unknown'}\n`;
            if (s.summary) b += `**Summary:** ${s.summary}\n\n`;
            // Handle messages array from sessions
            if (s.messages && s.messages.length > 0) {
              const msgLog = s.messages.slice(0, 20).map(m => `[${m.role}] ${(m.content || '').slice(0, 150)}`).join('\n');
              b += `**Log (${s.messages.length} messages):**\n\`\`\`\n${msgLog}\n\`\`\`\n\n`;
            } else if (s.raw_content || s.rawContent) {
              // Clean terminal garbage from raw content
              let content = (s.raw_content || s.rawContent || '')
                .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')  // ANSI escape codes
                .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '') // ANSI modes
                .replace(/\x1b\][^\x07]*\x07/g, '')      // OSC sequences
                .replace(/\x1b/g, '')                     // Remaining escapes
                .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Control chars (keep newlines/tabs)
                .slice(0, 2000);
              b += `**Log:**\n\`\`\`\n${content}${content.length >= 2000 ? '\n...(truncated)' : ''}\n\`\`\`\n\n`;
            }
          });
        }

        // Ryan's What's Next Recommendations
        b += '## Ryan\'s Recommendations - What\'s Next\n\n';
        if (ryanRec && ryanRec.success && ryanRec.recommendation) {
          const rec = ryanRec.recommendation;
          b += `**${ryanRec.action_message || 'Focus on current task'}**\n\n`;
          b += `📍 **Current:** ${rec.phase} (${rec.project})\n`;
          if (rec.description) b += `   ${rec.description}\n`;
          if (rec.reasons?.length) b += `   ${rec.reasons.join(' ')}\n`;
          b += '\n';
          if (ryanRec.alternatives?.length) {
            b += '**Alternatives:**\n';
            ryanRec.alternatives.slice(0, 3).forEach((alt, i) => {
              b += `${i + 1}. ${alt.phase} (${alt.project}) - ${alt.reasons?.join(' ') || ''}\n`;
            });
            b += '\n';
          }
          if (ryanRec.warnings?.length) {
            b += '**⚠️ Blockers:**\n';
            ryanRec.warnings.forEach(w => b += `- ${w.message}\n`);
            b += '\n';
          }
          b += `*${ryanRec.summary?.total_phases || 0} phases tracked, ${ryanRec.summary?.actionable || 0} actionable*\n\n`;
        } else {
          b += `*Ryan is not online or has no recommendations.*\n\n`;
        }

        // Pending Todos
        if (ctx.todos?.length) {
          b += '## All Pending Todos\n';
          ctx.todos.forEach(t => b += `- [${t.priority}] ${t.title}: ${t.description || ''}\n`);
          b += '\n';
        }

        // Port Assignments
        if (ctx.ports?.length) {
          b += '## Port Assignments\n';
          ctx.ports.forEach(p => b += `- :${p.port} - ${p.service}: ${p.description}\n`);
          b += '\n';
        }

        logToChad('assistant', `Briefing for ${project}`);
        return { content: [{ type: 'text', text: b }] };
      }
      case 'susan_get_todos': { const d = await susanFetch(`/api/todos?project=${encodeURIComponent(args?.project || DEFAULT_PROJECT)}&status=${args?.status || 'pending'}`); return { content: [{ type: 'text', text: JSON.stringify(d, null, 2) }] }; }
      case 'susan_search_knowledge': { const d = await susanFetch(`/api/query?q=${encodeURIComponent(args.query)}${args.category ? '&category=' + encodeURIComponent(args.category) : ''}`); logToChad('assistant', `Search: ${args.query}`); return { content: [{ type: 'text', text: JSON.stringify(d, null, 2) }] }; }
      case 'susan_log_session': { const d = await susanFetch('/api/sessions', { method: 'POST', body: JSON.stringify({ project: args?.project || DEFAULT_PROJECT, summary: args.summary, messages: args.messages || [] }) }); logToChad('assistant', `Logged: ${args.summary}`); return { content: [{ type: 'text', text: `Session logged: ${JSON.stringify(d)}` }] }; }
      case 'susan_add_knowledge': { const d = await susanFetch('/api/remember', { method: 'POST', body: JSON.stringify({ projectPath: args?.project || DEFAULT_PROJECT, title: args.title, summary: args.content, category: args.category, importance: 8 }) }); logToChad('assistant', `Added: ${args.title}`); return { content: [{ type: 'text', text: `Knowledge added: ${JSON.stringify(d)}` }] }; }
      case 'susan_get_ports': { const d = await susanFetch('/api/ports'); let t = '# Port Assignments\n\n'; if (Array.isArray(d)) d.forEach(p => t += `- **:${p.port}** - ${p.service}: ${p.description}\n`); else t = JSON.stringify(d, null, 2); return { content: [{ type: 'text', text: t }] }; }
      case 'server_claude_connect': { const p = args?.project || DEFAULT_PROJECT; await connectToServerClaude(p); logToChad('assistant', `Connected server Claude: ${p}`); return { content: [{ type: 'text', text: `Connected to server Claude at ${CLAUDE_SERVER_WS} for ${p}` }] }; }
      case 'server_claude_send': { if (!args.command) throw new Error('command required'); if (!serverClaudeConnected) await connectToServerClaude(); serverClaudeBuffer = ''; serverClaudeWs.send(JSON.stringify({ type: 'input', data: args.command })); serverClaudeWs.send(JSON.stringify({ type: 'input', data: '\r' })); await new Promise(r => setTimeout(r, args.waitMs || 5000)); logToChad('assistant', `Sent: ${args.command.slice(0, 80)}...`); return { content: [{ type: 'text', text: serverClaudeBuffer || '(no output)' }] }; }
      case 'server_claude_output': { let o = serverClaudeBuffer; if (args?.lines > 0) o = o.split('\n').slice(-args.lines).join('\n'); return { content: [{ type: 'text', text: o || '(empty)' }] }; }
      case 'server_claude_status': { return { content: [{ type: 'text', text: JSON.stringify({ connected: serverClaudeConnected, wsUrl: CLAUDE_SERVER_WS, bufferSize: serverClaudeBuffer.length }, null, 2) }] }; }
      case 'chad_status': { return { content: [{ type: 'text', text: JSON.stringify({ connected: chadConnected, wsUrl: CHAD_WS_URL }, null, 2) }] }; }
      default: throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) { logToChad('error', `${name}: ${err.message}`); return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true }; }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Kodiack Studio] MCP server running v1.1 - Susan + Chad connected');
  connectToChad();
}

main().catch(console.error);
