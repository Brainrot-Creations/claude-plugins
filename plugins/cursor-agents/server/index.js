#!/usr/bin/env node
'use strict';

const { spawn } = require('child_process');
const readline = require('readline');
const crypto = require('crypto');

// ─── ACP Client ──────────────────────────────────────────────────────────────

class ACPClient {
  constructor(agentPath) {
    this.agentPath = agentPath;
    this.proc = null;
    this.rl = null;
    this.pending = new Map();
    this.listeners = new Map();
    this.nextId = 1;
    this.connected = false;
    this._connectPromise = null;
    this._sessionLock = Promise.resolve();
  }

  connect() {
    if (this._connectPromise) return this._connectPromise;
    this._connectPromise = this._doConnect().catch((err) => {
      this._connectPromise = null;
      throw err;
    });
    return this._connectPromise;
  }

  async _doConnect() {
    this.proc = spawn(this.agentPath, ['acp'], {
      stdio: ['pipe', 'pipe', 'inherit'],
      env: process.env,
    });

    this.proc.on('exit', () => {
      this.connected = false;
      this._connectPromise = null;
    });

    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.rl.on('line', (line) => this._dispatch(line));

    await this._rpc('initialize', {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: { name: 'cursor-agents-mcp', version: '1.0.0' },
    });

    await this._rpc('authenticate', { methodId: 'cursor_login' });
    this.connected = true;
  }

  _dispatch(line) {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }

    if (msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
      const waiter = this.pending.get(msg.id);
      if (waiter) {
        this.pending.delete(msg.id);
        msg.error
          ? waiter.reject(new Error(msg.error.message || JSON.stringify(msg.error)))
          : waiter.resolve(msg.result);
      }
      return;
    }

    if (msg.method === 'session/request_permission') {
      this._write({ jsonrpc: '2.0', id: msg.id, result: { outcome: { outcome: 'allow-once' } } });
    }

    const handlers = this.listeners.get(msg.method) || [];
    for (const h of [...handlers]) h(msg);
  }

  on(method, handler) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(handler);
    return () => {
      const arr = this.listeners.get(method) || [];
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  _write(obj) {
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
  }

  _rpc(method, params) {
    const id = this.nextId++;
    this._write({ jsonrpc: '2.0', id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  async runSession(prompt, cwd, timeoutMs) {
    if (!this.connected) await this.connect();

    // Serialize sessions — ACP session/update notifications aren't tagged by
    // session ID in the current protocol, so we run one at a time to avoid
    // mixing output chunks from concurrent sessions.
    return (this._sessionLock = this._sessionLock.then(() =>
      this._runSessionInternal(prompt, cwd, timeoutMs)
    ));
  }

  async _runSessionInternal(prompt, cwd, timeoutMs = 300000) {
    const { sessionId } = await this._rpc('session/new', {
      cwd: cwd || process.cwd(),
      mcpServers: [],
    });

    const chunks = [];
    const unsub = this.on('session/update', (msg) => {
      const u = msg.params?.update;
      if (u?.sessionUpdate === 'agent_message_chunk' && u.content?.text) {
        chunks.push(u.content.text);
      }
    });

    try {
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Cursor agent timed out after ${timeoutMs}ms`)), timeoutMs)
      );
      const result = await Promise.race([
        this._rpc('session/prompt', {
          sessionId,
          prompt: [{ type: 'text', text: prompt }],
        }),
        timeout,
      ]);
      return { text: chunks.join(''), stopReason: result?.stopReason, sessionId };
    } finally {
      unsub();
    }
  }

  disconnect() {
    this.connected = false;
    this._connectPromise = null;
    this.proc?.stdin.end();
    this.proc?.kill();
  }
}

// ─── Task Registry ───────────────────────────────────────────────────────────

const tasks = new Map();

function submitTask(name, prompt, cwd) {
  const id = crypto.randomUUID();
  const task = {
    id,
    name,
    status: 'pending',
    prompt,
    cwd: cwd || null,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  tasks.set(id, task);

  (async () => {
    task.status = 'running';
    try {
      const res = await acp.runSession(prompt, cwd);
      task.result = res.text;
      task.status = 'completed';
    } catch (err) {
      task.error = err.message;
      task.status = 'failed';
    }
    task.completedAt = new Date().toISOString();
  })();

  return id;
}

// ─── Tool Definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'cursor_run',
    description:
      'Delegate a task to a Cursor agent and wait for the result. Use for synchronous sub-tasks where you need the output before continuing.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'The full task description and instructions for the Cursor agent',
        },
        cwd: {
          type: 'string',
          description: 'Working directory the agent should operate in (defaults to current)',
        },
        timeout_ms: {
          type: 'number',
          description: 'Max milliseconds to wait for the agent (default 300000 = 5 min)',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'cursor_task_submit',
    description:
      'Submit a named task to a Cursor agent in the background. Returns a task_id immediately. Use cursor_task_status to poll and cursor_task_result to fetch output.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Short descriptive name for this task' },
        prompt: {
          type: 'string',
          description: 'The full task description and instructions for the Cursor agent',
        },
        cwd: {
          type: 'string',
          description: 'Working directory the agent should operate in',
        },
      },
      required: ['name', 'prompt'],
    },
  },
  {
    name: 'cursor_task_status',
    description: "Check the current status of a background Cursor task (pending | running | completed | failed).",
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID returned by cursor_task_submit' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'cursor_task_result',
    description: 'Retrieve the full output of a completed Cursor task.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: 'Task ID returned by cursor_task_submit' },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'cursor_tasks_list',
    description: 'List all submitted Cursor tasks with their name, status, and timestamps.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

async function callTool(name, args) {
  switch (name) {
    case 'cursor_run': {
      const res = await acp.runSession(args.prompt, args.cwd, args.timeout_ms);
      return JSON.stringify({ text: res.text, stop_reason: res.stopReason });
    }

    case 'cursor_task_submit': {
      const id = submitTask(args.name, args.prompt, args.cwd);
      return JSON.stringify({
        task_id: id,
        status: 'pending',
        message: `Task "${args.name}" submitted. Poll with cursor_task_status("${id}").`,
      });
    }

    case 'cursor_task_status': {
      const t = tasks.get(args.task_id);
      if (!t) return JSON.stringify({ error: 'Task not found' });
      return JSON.stringify({
        id: t.id,
        name: t.name,
        status: t.status,
        created_at: t.createdAt,
        completed_at: t.completedAt,
      });
    }

    case 'cursor_task_result': {
      const t = tasks.get(args.task_id);
      if (!t) return JSON.stringify({ error: 'Task not found' });
      if (t.status === 'pending' || t.status === 'running')
        return JSON.stringify({ status: t.status, message: 'Task not yet complete' });
      if (t.status === 'failed') return JSON.stringify({ status: 'failed', error: t.error });
      return JSON.stringify({ status: 'completed', result: t.result });
    }

    case 'cursor_tasks_list': {
      const list = [...tasks.values()].map((t) => ({
        id: t.id,
        name: t.name,
        status: t.status,
        created_at: t.createdAt,
        completed_at: t.completedAt,
      }));
      return JSON.stringify({ tasks: list });
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP stdio Server ─────────────────────────────────────────────────────────

function mcpSend(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function handleMcp(msg) {
  if (!msg.id) return;

  switch (msg.method) {
    case 'initialize':
      mcpSend({
        jsonrpc: '2.0',
        id: msg.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'cursor-agents', version: '1.0.0' },
        },
      });
      break;

    case 'tools/list':
      mcpSend({ jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } });
      break;

    case 'tools/call': {
      const { name, arguments: toolArgs } = msg.params;
      try {
        const text = await callTool(name, toolArgs || {});
        mcpSend({
          jsonrpc: '2.0',
          id: msg.id,
          result: { content: [{ type: 'text', text }] },
        });
      } catch (err) {
        mcpSend({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            content: [{ type: 'text', text: `Error: ${err.message}` }],
            isError: true,
          },
        });
      }
      break;
    }

    default:
      mcpSend({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32601, message: 'Method not found' },
      });
  }
}

// ─── Startup ──────────────────────────────────────────────────────────────────

const AGENT_PATH = process.env.CURSOR_AGENT_PATH || 'agent';
const acp = new ACPClient(AGENT_PATH);

acp.connect().catch((err) => {
  process.stderr.write(`[cursor-agents] ACP connect failed on startup: ${err.message}\n`);
});

process.on('SIGTERM', () => { acp.disconnect(); process.exit(0); });
process.on('SIGINT', () => { acp.disconnect(); process.exit(0); });

process.stdin.setEncoding('utf8');
const mcpRl = readline.createInterface({ input: process.stdin });
mcpRl.on('line', async (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  await handleMcp(msg);
});
