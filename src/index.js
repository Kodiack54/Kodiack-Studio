#!/usr/bin/env node

/**
 * Kodiack Studio - MCP Server
 * Bridges Claude Code to Susan's memory system
 *
 * This gives Claude persistent memory across sessions by connecting
 * to Susan (the AI Team Cataloger) on the development server.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';

// Susan's API on the dev server
const SUSAN_URL = process.env.SUSAN_URL || 'http://161.35.229.220:5403';
const DEFAULT_PROJECT = process.env.KODIACK_PROJECT || '/var/www/NextBid_Dev/dev-studio-5000';

// Server Claude terminal WebSocket
const CLAUDE_SERVER_WS = process.env.CLAUDE_SERVER_WS || 'ws://161.35.229.220:5400';

// WebSocket connection to server Claude
let serverClaudeWs = null;
let serverClaudeBuffer = '';
let serverClaudeConnected = false;

/**
 * Fetch from Susan's API
 */
async function susanFetch(endpoint, options = {}) {
  const url = `${SUSAN_URL}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Susan returned ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`[Kodiack Studio] Susan API error: ${error.message}`);
    throw error;
  }
}

/**
 * Connect to server Claude's terminal
 */
function connectToServerClaude(projectPath = DEFAULT_PROJECT) {
  return new Promise((resolve, reject) => {
    if (serverClaudeWs && serverClaudeConnected) {
      resolve(true);
      return;
    }

    const wsUrl = `${CLAUDE_SERVER_WS}?path=${encodeURIComponent(projectPath)}&mode=claude`;
    console.error(`[Kodiack Studio] Connecting to server Claude: ${wsUrl}`);

    serverClaudeWs = new WebSocket(wsUrl);
    serverClaudeBuffer = '';

    serverClaudeWs.on('open', () => {
      serverClaudeConnected = true;
      console.error('[Kodiack Studio] Connected to server Claude terminal');
      resolve(true);
    });

    serverClaudeWs.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'output') {
          // Strip ANSI codes for cleaner output
          const clean = msg.data
            .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
            .replace(/\x1b\[\?[0-9;]*[a-zA-Z]/g, '')
            .replace(/\x1b\][^\x07]*\x07/g, '')
            .replace(/\x1b/g, '');
          serverClaudeBuffer += clean;
          // Keep buffer manageable
          if (serverClaudeBuffer.length > 50000) {
            serverClaudeBuffer = serverClaudeBuffer.slice(-30000);
          }
        }
      } catch (e) {
        // Raw data
        serverClaudeBuffer += data.toString();
      }
    });

    serverClaudeWs.on('error', (err) => {
      console.error('[Kodiack Studio] Server Claude WebSocket error:', err.message);
      serverClaudeConnected = false;
      reject(err);
    });

    serverClaudeWs.on('close', () => {
      console.error('[Kodiack Studio] Server Claude disconnected');
      serverClaudeConnected = false;
      serverClaudeWs = null;
    });

    // Timeout after 10 seconds
    setTimeout(() => {
      if (!serverClaudeConnected) {
        reject(new Error('Connection timeout'));
      }
    }, 10000);
  });
}

/**
 * Send command to server Claude
 */
async function sendToServerClaude(command) {
  if (!serverClaudeWs || !serverClaudeConnected) {
    await connectToServerClaude();
  }

  // Clear buffer before sending so we capture the response
  serverClaudeBuffer = '';

  // Send the command
  serverClaudeWs.send(JSON.stringify({ type: 'input', data: command }));
  serverClaudeWs.send(JSON.stringify({ type: 'input', data: '\r' }));

  // Wait for response to accumulate
  await new Promise(resolve => setTimeout(resolve, 3000));

  return serverClaudeBuffer;
}

/**
 * Get recent output from server Claude
 */
function getServerClaudeOutput() {
  return serverClaudeBuffer;
}

/**
 * Create the MCP server
 */
const server = new Server(
  {
    name: 'kodiack-studio',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * List available tools
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'susan_get_briefing',
        description: 'Get full context briefing from Susan - includes last session, recent conversation, todos, knowledge, ports, schemas, and file structure. Call this at the start of each session to restore memory.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Project path (defaults to dev-studio-5000)',
            },
          },
        },
      },
      {
        name: 'susan_get_todos',
        description: 'Get current pending todos/tasks from Susan',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Project path',
            },
            status: {
              type: 'string',
              enum: ['pending', 'in_progress', 'completed', 'all'],
              description: 'Filter by status (defaults to pending)',
            },
          },
        },
      },
      {
        name: 'susan_search_knowledge',
        description: 'Search Susan\'s knowledge base for relevant information',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            category: {
              type: 'string',
              description: 'Optional category filter (e.g., "architecture", "bug-fix", "config")',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'susan_log_session',
        description: 'Log session activity to Susan for memory persistence',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Project path',
            },
            summary: {
              type: 'string',
              description: 'Summary of what was accomplished',
            },
            messages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  content: { type: 'string' },
                },
              },
              description: 'Key conversation messages to remember',
            },
          },
          required: ['summary'],
        },
      },
      {
        name: 'susan_add_knowledge',
        description: 'Add new knowledge to Susan\'s database for future reference',
        inputSchema: {
          type: 'object',
          properties: {
            title: {
              type: 'string',
              description: 'Title of the knowledge entry',
            },
            content: {
              type: 'string',
              description: 'The knowledge content',
            },
            category: {
              type: 'string',
              description: 'Category (e.g., "architecture", "bug-fix", "config", "workflow")',
            },
            project: {
              type: 'string',
              description: 'Project path',
            },
          },
          required: ['title', 'content', 'category'],
        },
      },
      {
        name: 'susan_get_ports',
        description: 'Get the port assignments for all services in the dev environment',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'server_claude_connect',
        description: 'Connect to the server-side Claude terminal at :5400. Call this before sending commands.',
        inputSchema: {
          type: 'object',
          properties: {
            project: {
              type: 'string',
              description: 'Project path on the server (defaults to dev-studio-5000)',
            },
          },
        },
      },
      {
        name: 'server_claude_send',
        description: 'Send a command/message to server-side Claude and get the response. Server Claude will execute directly on the server codebase.',
        inputSchema: {
          type: 'object',
          properties: {
            command: {
              type: 'string',
              description: 'The command or message to send to server Claude',
            },
            waitMs: {
              type: 'number',
              description: 'How long to wait for response (default 5000ms)',
            },
          },
          required: ['command'],
        },
      },
      {
        name: 'server_claude_output',
        description: 'Get the recent output buffer from server Claude terminal',
        inputSchema: {
          type: 'object',
          properties: {
            lines: {
              type: 'number',
              description: 'Number of recent lines to return (default all)',
            },
          },
        },
      },
      {
        name: 'server_claude_status',
        description: 'Check if connected to server Claude terminal',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ],
  };
});

/**
 * Handle tool calls
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'susan_get_briefing': {
        const project = args?.project || DEFAULT_PROJECT;
        const context = await susanFetch(`/api/context?project=${encodeURIComponent(project)}`);

        // Format the briefing nicely
        let briefing = '# Susan\'s Memory Briefing\n\n';

        if (context.greeting) {
          briefing += context.greeting + '\n\n';
        }

        if (context.lastSession) {
          briefing += '## Last Session\n';
          briefing += `- Started: ${context.lastSession.startedAt}\n`;
          briefing += `- Ended: ${context.lastSession.endedAt}\n`;
          if (context.lastSession.summary) {
            briefing += `- Summary: ${context.lastSession.summary}\n`;
          }
          briefing += '\n';
        }

        if (context.todos?.length > 0) {
          briefing += '## Pending Todos\n';
          context.todos.forEach(todo => {
            briefing += `- [${todo.priority}] ${todo.title}: ${todo.description}\n`;
          });
          briefing += '\n';
        }

        if (context.ports?.length > 0) {
          briefing += '## Port Assignments\n';
          context.ports.forEach(p => {
            briefing += `- :${p.port} - ${p.service}: ${p.description}\n`;
          });
          briefing += '\n';
        }

        return {
          content: [{ type: 'text', text: briefing }],
        };
      }

      case 'susan_get_todos': {
        const project = args?.project || DEFAULT_PROJECT;
        const status = args?.status || 'pending';
        const data = await susanFetch(`/api/todos?project=${encodeURIComponent(project)}&status=${status}`);

        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        };
      }

      case 'susan_search_knowledge': {
        const { query, category } = args;
        let endpoint = `/api/query?q=${encodeURIComponent(query)}`;
        if (category) {
          endpoint += `&category=${encodeURIComponent(category)}`;
        }
        const data = await susanFetch(endpoint);

        return {
          content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        };
      }

      case 'susan_log_session': {
        const project = args?.project || DEFAULT_PROJECT;
        const data = await susanFetch('/api/sessions', {
          method: 'POST',
          body: JSON.stringify({
            project,
            summary: args.summary,
            messages: args.messages || [],
          }),
        });

        return {
          content: [{ type: 'text', text: `Session logged: ${JSON.stringify(data)}` }],
        };
      }

      case 'susan_add_knowledge': {
        const project = args?.project || DEFAULT_PROJECT;
        const data = await susanFetch('/api/remember', {
          method: 'POST',
          body: JSON.stringify({
            projectPath: project,
            title: args.title,
            summary: args.content,
            category: args.category,
            importance: 8,
          }),
        });

        return {
          content: [{ type: 'text', text: `Knowledge added: ${JSON.stringify(data)}` }],
        };
      }

      case 'susan_get_ports': {
        const data = await susanFetch('/api/ports');

        let text = '# Port Assignments\n\n';
        if (Array.isArray(data)) {
          data.forEach(p => {
            text += `- **:${p.port}** - ${p.service}: ${p.description}\n`;
          });
        } else {
          text = JSON.stringify(data, null, 2);
        }

        return {
          content: [{ type: 'text', text }],
        };
      }

      // Server Claude tools
      case 'server_claude_connect': {
        const project = args?.project || DEFAULT_PROJECT;
        await connectToServerClaude(project);
        return {
          content: [{ type: 'text', text: `Connected to server Claude at ${CLAUDE_SERVER_WS} for project ${project}` }],
        };
      }

      case 'server_claude_send': {
        const { command, waitMs } = args;
        if (!command) {
          throw new Error('command is required');
        }

        // Connect if not already connected
        if (!serverClaudeConnected) {
          await connectToServerClaude();
        }

        // Clear buffer and send command
        serverClaudeBuffer = '';
        serverClaudeWs.send(JSON.stringify({ type: 'input', data: command }));
        serverClaudeWs.send(JSON.stringify({ type: 'input', data: '\r' }));

        // Wait for response
        const wait = waitMs || 5000;
        await new Promise(resolve => setTimeout(resolve, wait));

        return {
          content: [{ type: 'text', text: serverClaudeBuffer || '(no output yet - server Claude may still be processing)' }],
        };
      }

      case 'server_claude_output': {
        const lines = args?.lines;
        let output = serverClaudeBuffer;

        if (lines && lines > 0) {
          const allLines = output.split('\n');
          output = allLines.slice(-lines).join('\n');
        }

        return {
          content: [{ type: 'text', text: output || '(buffer empty)' }],
        };
      }

      case 'server_claude_status': {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            connected: serverClaudeConnected,
            wsUrl: CLAUDE_SERVER_WS,
            bufferSize: serverClaudeBuffer.length,
          }, null, 2) }],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

/**
 * Start the server
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Kodiack Studio] MCP server running - Claude now has Susan\'s memory');
}

main().catch(console.error);
