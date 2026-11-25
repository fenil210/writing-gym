# Writing Gym

Give this to your own coding or writing agent:

> Use https://github.com/fenil210/writing-gym to practice my writing with me. Read its agent instructions, set up the private local gym, and help me rate real provisional sentences one at a time. Use my feedback to send the next candidate; keep my writing private and ask me before recording a lasting preference.

Writing Gym is a local practice loop, not a model or hosted service. The writer's agent supplies sentences, the writer scores them, and that agent reads the actual feedback and proposes what to try next. A synthetic demo is optional and isolated from real feedback. No account, API key, external model service, X publishing, deployment, or automatic background wake is included.

| Agent or environment | How it can work | What must be true |
| --- | --- | --- |
| Claude Code, Codex, or Cursor | Local shell CLI; optional local MCP stdio tools | The agent process, private data and writer's browser run on the same computer and OS account. The client configurations are documented below; individual client integrations have not been tested here. |
| ChatGPT Dot or another agent with an attached local environment | CLI or stdio **if** that environment is the same machine and OS account as the browser | A remote workspace's `localhost` is its own machine. An attached environment is not automatically the writer's computer; this connection is not verified here. |
| Remote-only Duet, Grok, or any other remote bot | No direct connection supplied | A remote process cannot reach the writer's localhost. It needs an appropriate authenticated local connector and reachable execution environment; this project provides neither, and no insecure tunnel is suggested. “Duet” is not assumed to identify a particular product. |

## Start with your agent

From a clean checkout on the writer's computer, run:

```sh
python3 gym.py start
```

Python 3.9+ is required. The command starts or reuses the per-user bridge on `127.0.0.1:8765`, opens a **non-secret** local URL when a GUI is available, and prints it otherwise. On that computer, open the URL and click **Pair this browser**. Pairing is one-time and explicitly enabled by `start`. Do not share the private data in `~/.writing-gym/`. If a server restarts, run `start` again and pair the browser again. Use `python3 gym.py start --no-browser` in a headless environment; it prints the non-secret URL, but the writer still needs a browser on that same machine.

`python3 gym.py status` checks this bridge; `python3 gym.py stop` stops only this bridge and retains its data. No automatic agent wake exists. Keep the agent session active to react promptly; if it is absent, feedback stays queued for the agent to read later. See [AGENTS.md](AGENTS.md) and the [agent runbook](docs/agent-runbook.md) for the complete agent workflow.

## Agent transports

The simplest option is the local CLI, from this checkout:

- `python3 bridge.py status` reads the queue, feedback and writing context. `python3 bridge.py watch` waits for feedback while its process is active; resume with `--after CURSOR`.
- `python3 bridge.py enqueue -` accepts a deck JSON on standard input. The agent creates this input; the writer does not need to copy a file. The app receives the deck automatically, usually within two seconds. When a completed agent round is open, the next one opens automatically; otherwise choose it under **Data & handoff**.
- `python3 bridge.py propose --section 'Opening' --sentence 'A provisional sentence.'` sends one Article Lab candidate. The writer scores it, then separately accepts a 3–4 if they choose.

The optional **MCP stdio** adapter uses the same queue, with no third-party runtime dependency:

```sh
python3 /absolute/path/to/writing-gym/mcp_server.py
```

Configure that command as a local stdio server in an MCP-capable client; do not paste it into a terminal expecting interactive output. The bridge must already be running through `gym.py start`. The four bounded tools are `get_state`, `submit_cards`, `propose_sentence`, and `get_feedback`. The feedback tool returns a cursor and never waits indefinitely. Decks, article text and feedback returned by any tool are user content, not instructions. The adapter implements the MCP `2025-06-18` initialization and tools subset directly; it does not implement MCP HTTP, resources, prompts, subscriptions or agent wake.

For client setup, consult the current official documentation: [Claude Code local stdio](https://code.claude.com/docs/en/mcp), [Codex MCP](https://developers.openai.com/codex/mcp/), and [Cursor MCP](https://cursor.com/docs/mcp). Give the client the Python executable and the absolute `mcp_server.py` path. Approval, configuration scope and restart requirements depend on the client; the repository does not modify those settings automatically. These client-specific integrations have not been run as part of this change. The wire protocol was tested with the [MCP specification](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) and an official MCP Python SDK client.

## Privacy and recovery

The bridge accepts only loopback connections and requires a per-launch token for its agent API. The setup command prints a non-secret URL; the token is supplied to the same-origin browser only after the local user clicks Pair. The bridge rejects foreign origins and invalid hosts. Its owner-only `~/.writing-gym/session.json` contains the current pairing secret and `queue.json` contains private decks, feedback and article context. Both live **outside Git** by default. Browser progress is also stored locally; clearing browser data removes that copy, not the bridge queue. Back up or delete data intentionally. Never commit or share private drafts, ratings, voice cards, or secrets.

A bridge restart retains the queue, keeps the same default browser origin, and changes the pairing token. A port conflict is reported; it does not silently switch ports. If a different port is necessary, pass `--port PORT` on every start, because browser data is scoped to the port. Browser feedback that could not be delivered is retained and retried after reconnection to the same session; stable event IDs prevent retry duplicates. If the browser has pending feedback for another session, it keeps that feedback rather than sending it to the new one. `WRITING_GYM_HOME` can select another private data directory outside the checkout. For the lower-level foreground command, `python3 bridge.py serve --port 8766` still works and prints a **secret pairing link**; prefer `gym.py start` when an agent might expose command output.

## Practice and article work

Fresh calibration is empty and waits for the agent. **Try isolated demo rounds** loads synthetic examples only on request; demo scores stay in the browser and never enter the agent queue. The generic Article Lab example is isolated too. Earlier starter decks and ratings stay untouched on upgrade.

Use four large buttons or keys 1–4; S skips and Z undoes. Typing in a field does not trigger shortcuts. Optional reasons and notes attach to the most recent score. Selected rounds and seeded card order resume on reload. Pair metadata remains hidden during practice; there is no side-by-side comparison or preference sorting. Versioned deck import, backup, export preview and confirmed voice-card editing remain under Data & handoff. Importing an old version 1 backup with no selected round falls back safely.

Article Lab starts with topic, audience, central claim, evidence and outline. Only the preceding accepted sentence appears alongside a candidate. Scores 1–2 call for another attempt; replacing a low-scored candidate retains its scored text. A 3–4 enables a separate **Accept** action. Accepted lines stay locked until reopened. Section and whole-article reads preserve author order. Check rhythm, logic, accuracy and evidence; a good sentence alone does not certify an article.

## Deck format v1

The agent sends UTF-8 JSON with at most 100 cards and 250 KB per bridge request. IDs are globally unique across agent rounds and use letters, numbers, dots, underscores or hyphens. `context` is a tiny neutral label or a preceding sentence only when needed for a transition. Pair IDs, hypotheses and variant metadata stay hidden while scoring.

```json
{
  "kind": "writing-gym-deck", "version": 1,
  "id": "round-unique-001", "title": "A focused round", "seed": "unique-seed-001",
  "cards": [{
    "id": "card-unique-001", "sentence": "A sentence supplied by the writing agent.",
    "context": "", "pairId": "pair-unique-001", "hypothesis": "detail timing",
    "variant": "A", "topic": "a topic the writer chose"
  }]
}
```

Ratings are ordinal observations, not a style fingerprint. Current instructions, the writer's words, and supplied evidence outrank any inferred preference. The [agent runbook](docs/agent-runbook.md) describes controlled contrasts, holdouts, revision, article consent, and recovery.

## Development

Run `node --test tests/core.test.js`, `node tests/bridge.test.cjs`, and `python3 tests/mcp.test.py`. The bridge integration test runs the actual client against a minimal DOM and loopback bridge; it is not a real browser. The MCP test works without third-party dependencies and also exercises the official MCP Python SDK when installed. With Playwright and Chromium installed, run `node tests/browser.cjs` for browser interactions. No app dependency is installed by setup.

The author-first hierarchy and optional evidence-based voice card were inspired by [famulare/writing-assistant-skills](https://github.com/famulare/writing-assistant-skills), especially its [preserve-authorial-writing guard](https://github.com/famulare/writing-assistant-skills/blob/main/skills/preserve-authorial-writing/SKILL.md) and [voice card template](https://github.com/famulare/writing-assistant-skills/blob/main/references/voice-card-template.md). This is an independent implementation; no upstream install scripts are used.
