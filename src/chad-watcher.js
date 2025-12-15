#!/usr/bin/env node

/**
 * Chad Local Watcher
 * Monitors Claude Code terminal and sends transcripts to Susan
 *
 * Runs independently of Claude Code - survives crashes
 * Sends conversation chunks to Susan every 30 minutes
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

// Configuration
const SUSAN_URL = process.env.SUSAN_URL || 'http://161.35.229.220:5403';
const CHECKPOINT_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const PROJECT_PATH = process.env.KODIACK_PROJECT || '/var/www/NextBid_Dev/dev-studio-5000';
const LOG_DIR = process.env.CHAD_LOG_DIR || path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'chad-logs');

// State
let conversationBuffer = [];
let lastCheckpoint = Date.now();
let sessionId = `local-${Date.now()}`;

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Log to file and console
 */
function log(message, data = {}) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message} ${JSON.stringify(data)}`;
  console.log(logLine);

  const logFile = path.join(LOG_DIR, `chad-${new Date().toISOString().split('T')[0]}.log`);
  fs.appendFileSync(logFile, logLine + '\n');
}

/**
 * Send transcript to Susan
 */
async function sendToSusan(messages, summary = '') {
  try {
    const response = await fetch(`${SUSAN_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: PROJECT_PATH,
        source: 'chad-local',
        sessionId,
        summary: summary || `Local Claude Code session checkpoint at ${new Date().toISOString()}`,
        messages,
        metadata: {
          checkpoint: true,
          timestamp: Date.now(),
          messageCount: messages.length
        }
      })
    });

    if (response.ok) {
      const result = await response.json();
      log('Checkpoint sent to Susan', { messageCount: messages.length, result });
      return true;
    } else {
      log('Susan rejected checkpoint', { status: response.status });
      return false;
    }
  } catch (error) {
    log('Failed to send to Susan', { error: error.message });
    return false;
  }
}

/**
 * Process a line of terminal output
 */
function processLine(line) {
  const trimmed = line.trim();
  if (!trimmed) return;

  // Skip common noise
  if (trimmed.startsWith('[') && trimmed.includes('ClaudeTerminal]')) return;
  if (trimmed.includes('node_modules')) return;
  if (/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+/.test(trimmed)) return;

  // Detect user input (prompt lines)
  const isUserInput = trimmed.startsWith('>') ||
                      trimmed.startsWith('$') ||
                      trimmed.startsWith('Human:') ||
                      trimmed.startsWith('You:');

  // Detect Claude response markers
  const isClaudeResponse = trimmed.startsWith('Assistant:') ||
                           trimmed.startsWith('Claude:') ||
                           trimmed.includes('I\'ll') ||
                           trimmed.includes('Let me');

  if (isUserInput || isClaudeResponse || trimmed.length > 50) {
    conversationBuffer.push({
      timestamp: Date.now(),
      content: trimmed,
      type: isUserInput ? 'user' : 'assistant'
    });
  }
}

/**
 * Checkpoint - send buffered conversation to Susan
 */
async function checkpoint() {
  if (conversationBuffer.length === 0) {
    log('Checkpoint skipped - no new messages');
    return;
  }

  const messages = conversationBuffer.map(m => ({
    role: m.type,
    content: m.content,
    timestamp: new Date(m.timestamp).toISOString()
  }));

  const success = await sendToSusan(messages);

  if (success) {
    // Save local backup
    const backupFile = path.join(LOG_DIR, `checkpoint-${Date.now()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({ sessionId, messages }, null, 2));

    // Clear buffer after successful send
    conversationBuffer = [];
    lastCheckpoint = Date.now();
  }
}

/**
 * Watch Claude Code's history file for changes
 */
function watchHistoryFile() {
  const historyFile = path.join(process.env.HOME || process.env.USERPROFILE, '.claude', 'history.jsonl');

  if (!fs.existsSync(historyFile)) {
    log('History file not found, waiting...', { path: historyFile });
    setTimeout(watchHistoryFile, 5000);
    return;
  }

  let lastSize = fs.statSync(historyFile).size;
  log('Watching Claude history file', { path: historyFile, size: lastSize });

  // Check for changes every 5 seconds
  setInterval(() => {
    try {
      const stat = fs.statSync(historyFile);
      if (stat.size > lastSize) {
        // File grew - read new content
        const fd = fs.openSync(historyFile, 'r');
        const buffer = Buffer.alloc(stat.size - lastSize);
        fs.readSync(fd, buffer, 0, buffer.length, lastSize);
        fs.closeSync(fd);

        const newContent = buffer.toString('utf8');
        const lines = newContent.split('\n').filter(l => l.trim());

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.message) {
              processLine(entry.message);
            }
            if (entry.role && entry.content) {
              conversationBuffer.push({
                timestamp: Date.now(),
                content: entry.content.slice(0, 2000), // Truncate long messages
                type: entry.role
              });
            }
          } catch (e) {
            // Not JSON, process as plain text
            processLine(line);
          }
        }

        lastSize = stat.size;
        log('Processed new history entries', { newBytes: buffer.length, bufferSize: conversationBuffer.length });
      }
    } catch (error) {
      log('Error reading history', { error: error.message });
    }
  }, 5000);
}

/**
 * Alternative: Watch stdin if piped
 */
function watchStdin() {
  if (process.stdin.isTTY) {
    log('No stdin pipe detected, using history file watcher');
    watchHistoryFile();
    return;
  }

  log('Watching stdin for terminal output');

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    const lines = chunk.split('\n');
    for (const line of lines) {
      processLine(line);
    }
  });
}

/**
 * Main entry point
 */
async function main() {
  log('Chad Local Watcher starting', {
    sessionId,
    susanUrl: SUSAN_URL,
    checkpointInterval: CHECKPOINT_INTERVAL_MS / 1000 / 60 + ' minutes',
    logDir: LOG_DIR
  });

  // Set up checkpoint interval
  setInterval(checkpoint, CHECKPOINT_INTERVAL_MS);

  // Also checkpoint on exit
  process.on('SIGINT', async () => {
    log('Shutting down, final checkpoint...');
    await checkpoint();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    log('Terminated, final checkpoint...');
    await checkpoint();
    process.exit(0);
  });

  // Start watching
  watchStdin();

  log('Chad Local Watcher running - will checkpoint every 30 minutes');
}

main().catch(error => {
  log('Fatal error', { error: error.message });
  process.exit(1);
});
