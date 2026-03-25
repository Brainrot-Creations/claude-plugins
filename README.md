# Socials Claude Code plugin

## Quick Install (copy this to Claude Code)

```
Clone https://github.com/BrainrotCreations/socials-claude-code-plugin, run npm install && npm run build, then add it to my plugins in settings.json
```

---

**`socials`** — a **[Model Context Protocol](https://modelcontextprotocol.io/)** (MCP) server and **[Claude Code plugin](https://code.claude.com/docs/en/plugins.md)** that connects **[Claude](https://www.anthropic.com/claude)** ([Desktop](https://claude.ai/download) or [Claude Code](https://docs.anthropic.com/en/docs/claude-code)) to the **[Socials](https://socials.brainrotcreations.com)** browser extension so Claude can help with X, LinkedIn, and Reddit in Chrome (or another supported browser).

The repo follows the same layout as [Anthropic’s official plugins](https://github.com/anthropics/claude-code/tree/main/plugins): `.claude-plugin/plugin.json` plus root `.mcp.json` so enabling the plugin starts the MCP server automatically. You can still run it as a plain stdio MCP server (Desktop or manual Claude Code config).

**Former name:** this project used to be published as **`socials-mcp`**; the GitHub repository is now **`BrainrotCreations/socials-claude-code-plugin`**.

## What you need

| Requirement | Notes |
|-------------|--------|
| **Node.js** | v18 or newer |
| **Socials extension** | Install from the [Chrome Web Store](https://chromewebstore.google.com/) (search for “Socials” by Brainrot Creations, or use the link on [socials.brainrotcreations.com](https://socials.brainrotcreations.com)) |
| **Paid plan** | On a **non-free** Socials plan, the extension connects to this MCP over `ws://127.0.0.1:9847` automatically (no toggle). Free tier cannot use the bridge. |
| **Claude** | Claude Desktop and/or Claude Code with MCP support |

## Quick start

```bash
git clone https://github.com/BrainrotCreations/socials-claude-code-plugin.git
cd socials-claude-code-plugin
npm install
npm run build
```

The runnable entrypoint is **`dist/index.js`**.

If you **fork** this repo, update the `repository` and `bugs` fields in `package.json` to match your GitHub URL.

## How it works

1. Claude starts this process as an **MCP server** over **stdio**.
2. The server opens a **WebSocket** on **`127.0.0.1:9847`**.
3. On a paid plan, the Socials extension connects to that socket automatically.
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
      "args": ["/absolute/path/to/socials-claude-code-plugin/dist/index.js"]
    }
  }
}
```

Do **not** commit your real config file (`claude_desktop_config.json` is gitignored); keep paths local to your machine.

3. Fully quit and reopen Claude Desktop.

Optional env on the server entry:

- **`SOCIALS_MCP_RECLAIM_PORT=1`** — If port `9847` is stuck by a stale process, this tries to clear listeners before binding (see source in `extension-bridge.ts`).

## Claude Code (plugin)

This matches the [plugin directory structure](https://github.com/anthropics/claude-code/tree/main/plugins) (`plugin-name/.claude-plugin/plugin.json`, optional `commands/`, `agents/`, `skills/`, `hooks/`, **`.mcp.json`**).

**Install from GitHub**

1. Clone and build the repository:

   ```bash
   git clone https://github.com/BrainrotCreations/socials-claude-code-plugin.git
   cd socials-claude-code-plugin
   npm install
   npm run build
   ```

2. Choose one of these options:

   **Option A: Permanent install (recommended)**

   Add to your Claude Code settings (`~/.claude/settings.json` or project `.claude/settings.json`):

   ```json
   {
     "plugins": ["/absolute/path/to/socials-claude-code-plugin"]
   }
   ```

   **Option B: Load for current session only**

   ```bash
   claude --plugin-dir /absolute/path/to/socials-claude-code-plugin
   ```

3. Enable the **socials** plugin. The bundled `.mcp.json` starts **`node ${CLAUDE_PLUGIN_ROOT}/dist/index.js`** with **`SOCIALS_MCP_RECLAIM_PORT=1`** (see [plugin MCP docs](https://code.claude.com/docs/en/plugins-reference.md#mcp-servers)).

> **Note:** The `/plugin install` command expects a marketplace URL, not a GitHub URL. Use the clone method above for GitHub-hosted plugins.

**Developing in this repo**

Root `.mcp.json` uses **`${CLAUDE_PLUGIN_ROOT}`**, which Claude Code sets when the directory is loaded **as a plugin**. If you open this folder as a normal project and rely on project-scoped MCP, either run with **`claude --plugin-dir .`** from the repo root or add a **user/project** MCP server manually (absolute path below).

**Plugin skills** ([quickstart pattern](https://code.claude.com/docs/en/plugins.md#create-your-first-plugin))

After `/reload-plugins`, namespaced slash skills are available:

| Skill | Invocation | Purpose |
|-------|------------|---------|
| **setup** | `/socials:setup` | User-triggered setup / troubleshooting checklist (`disable-model-invocation`). Optional text after the command is treated as a platform hint (`$ARGUMENTS`). |
| **using-socials** | *(model-invoked)* | Agent Skill: when to use which **`socials_*`** MCP tool and in what order. |
| **engagement-workflow** | *(model-invoked)* | Agent Skill: find relevant posts and build an engagement routine for growth. |
| **persona-guide** | *(model-invoked)* | Agent Skill: choose the right persona for content, understand system vs custom personas. |
| **product-promotion** | *(model-invoked)* | Agent Skill: promote products authentically without being spammy, platform-specific rules. |

**Plugin agents** (invoke with `@socials:agent`):

| Agent | Purpose |
|-------|---------|
| **@socials:manager** | Full-service social media manager — creates content, posts, engages, and grows your audience. |
| **@socials:creator** | Crafts engaging posts with your chosen persona and style. |
| **@socials:engage** | Finds relevant posts and crafts thoughtful replies to grow your presence. |
| **@socials:growth** | Creates growth strategies, content calendars, and optimization plans. |

## Claude Code (manual MCP)

Add a **stdio** MCP server that runs Node against **`dist/index.js`** if you are not using the plugin. Same shape as Desktop; paths are machine-specific.

```json
{
  "mcpServers": {
    "socials": {
      "command": "node",
      "args": ["/absolute/path/to/socials-claude-code-plugin/dist/index.js"],
      "env": {
        "SOCIALS_MCP_RECLAIM_PORT": "1"
      }
    }
  }
}
```

## Optional: `npx` / global binary

After `npm run build`, you can run the published binary if `node_modules/.bin` is on your `PATH`:

```bash
npx socials
# or, from this directory after npm link:
socials
```

Claude config can use `"command": "socials"` and `"args": []` if the binary resolves on your `PATH`.

## Troubleshooting

| Issue | What to try |
|-------|-------------|
| **Port 9847 in use** | `lsof -nP -iTCP:9847` (macOS/Linux) or close duplicate Claude / old `node` processes. Set **`SOCIALS_MCP_RECLAIM_PORT=1`** on the MCP server env if needed. |
| **Extension not connecting** | Confirm you are on a **paid** Socials plan, signed in, extension loaded (open the side panel once), then reload the extension if needed. |
| **Tools say not Pro / not connected** | Socials **Pro** may be required for some tools; extension must show as connected in **`socials_check_access`**. |

## Repo layout

```
socials-claude-code-plugin/
├── .claude-plugin/
│   └── plugin.json        # Claude Code plugin manifest
├── .mcp.json              # MCP server config for the plugin (${CLAUDE_PLUGIN_ROOT})
├── agents/
│   ├── manager/AGENT.md    # @socials:manager — full-service manager
│   ├── creator/AGENT.md    # @socials:creator — post creation
│   ├── engage/AGENT.md     # @socials:engage — find & reply
│   └── growth/AGENT.md     # @socials:growth — strategy & planning
├── skills/
│   ├── setup/SKILL.md           # Slash skill — setup & troubleshooting
│   ├── using-socials/SKILL.md   # Agent Skill — MCP tool workflow
│   ├── engagement-workflow/SKILL.md  # Agent Skill — find & engage with posts
│   ├── persona-guide/SKILL.md   # Agent Skill — choosing personas
│   └── product-promotion/SKILL.md    # Agent Skill — authentic promotion
├── scripts/
│   └── run-claude-mcp.sh  # Optional launcher for manual MCP (non-plugin) setups
├── src/
│   ├── index.ts           # MCP tools + stdio entry
│   ├── extension-bridge.ts # WebSocket bridge to the extension
│   └── types.ts
├── dist/                  # produced by `npm run build` (commit for plugin installs without build)
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
