# socials-mcp

A small **[Model Context Protocol](https://modelcontextprotocol.io/)** (MCP) server that connects **[Claude](https://www.anthropic.com/claude)** ([Desktop](https://claude.ai/download) or [Claude Code](https://docs.anthropic.com/en/docs/claude-code)) to the **[Socials](https://socials.brainrotcreations.com)** browser extension so Claude can help with X, LinkedIn, and Reddit in Chrome (or another supported browser).

This repo is meant to be **cloned or copied as its own GitHub project**: install dependencies, build once, point Claude at `dist/index.js`, turn on **Agent Mode** in Socials, and you’re set.

## What you need

| Requirement | Notes |
|-------------|--------|
| **Node.js** | v18 or newer |
| **Socials extension** | Install from the [Chrome Web Store](https://chromewebstore.google.com/) (search for “Socials” by Brainrot Creations, or use the link on [socials.brainrotcreations.com](https://socials.brainrotcreations.com)) |
| **Agent Mode** | In the extension, enable **Agent Mode** (paid plans where applicable). The extension connects to this MCP over `ws://127.0.0.1:9847`. |
| **Claude** | Claude Desktop and/or Claude Code with MCP support |

## Quick start

```bash
git clone https://github.com/BrainrotCreations/socials-mcp.git
cd socials-mcp
npm install
npm run build
```

The runnable entrypoint is **`dist/index.js`**.

If you **fork** this repo, update the `repository` and `bugs` fields in `package.json` to match your GitHub URL.

## How it works

1. Claude starts this process as an **MCP server** over **stdio**.
2. The server opens a **WebSocket** on **`127.0.0.1:9847`**.
3. With Agent Mode on, the Socials extension connects to that socket.
4. Tool calls from Claude are forwarded to the extension, which controls the browser.

## Claude Desktop

1. Open your Claude Desktop MCP config file.

   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`  
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

2. Add a server (use the **absolute** path to `dist/index.js` on your machine). See **`claude_desktop_config.example.json`** in this repo for a full example.

```json
{
  "mcpServers": {
    "socials": {
      "command": "node",
      "args": ["/absolute/path/to/socials-mcp/dist/index.js"]
    }
  }
}
```

Do **not** commit your real config file (`claude_desktop_config.json` is gitignored); keep paths local to your machine.

3. Fully quit and reopen Claude Desktop.

Optional env on the server entry:

- **`SOCIALS_MCP_RECLAIM_PORT=1`** — If port `9847` is stuck by a stale process, this tries to clear listeners before binding (see source in `extension-bridge.ts`).

## Claude Code

Add a **stdio** MCP server whose command runs Node against this **`dist/index.js`**. Exact steps depend on your Claude Code version (global config, project config, or CLI). Point it at the same path as in the Desktop example.

Example shape (adjust paths and config location per [Claude Code docs](https://docs.anthropic.com/en/docs/claude-code)):

```json
{
  "mcpServers": {
    "socials": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/socials-mcp/dist/index.js"]
    }
  }
}
```

## Optional: `npx` / global binary

After `npm run build`, you can run the published binary name if `node_modules/.bin` is on your `PATH`:

```bash
npx socials-mcp
# or, from this directory after npm link:
socials-mcp
```

Claude config would use `"command": "socials-mcp"` and `"args": []` only if the binary resolves correctly.

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| **Port 9847 in use** | `lsof -nP -iTCP:9847` (macOS/Linux) or close duplicate Claude / old `node` processes. Set **`SOCIALS_MCP_RECLAIM_PORT=1`** on the MCP server env if needed. |
| **Extension not connecting** | Toggle Agent Mode, reload the extension, keep a Socials-supported tab open. |
| **Tools say not Pro / not connected** | Socials **Pro** may be required for some tools; extension must show as connected in **`socials_check_access`**. |

## Repo layout

```
socials-mcp/
├── src/
│   ├── index.ts           # MCP tools + stdio entry
│   ├── extension-bridge.ts # WebSocket bridge to the extension
│   └── types.ts
├── dist/                  # produced by `npm run build`
├── package.json
├── tsconfig.json
├── LICENSE
└── README.md
```

## License

MIT — see [LICENSE](./LICENSE).

## Security

See [SECURITY.md](./SECURITY.md) (local WebSocket trust model, env vars, no secrets in this repo).

## Disclaimer

Socials and this MCP are provided by Brainrot Creations. Use automation responsibly and in line with each platform’s terms of service.
