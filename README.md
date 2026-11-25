# Writing Gym

Writing Gym is a private, local practice loop between a writer and an active writing agent. Dex supplies provisional sentences, the writer scores one at a time, and the agent reads the actual feedback to choose the next test. There is no model, cloud service, background agent wake, account, analytics, API key, X publishing, or hosted deployment in this project.

## Start on Fenil's Mac

1. Clone this repository and open a Terminal in its folder. Python 3.9+ is required; no app dependencies need installing.
2. Run `python3 bridge.py serve`. Leave it running. Open the **private pairing link** printed by this command in a browser on that same Mac. Treat the link like a password; do not post it, commit it, or share it with another person. It is removed from the browser address bar after pairing. If the server is restarted, open the newly printed link in the same browser tab to pair again.
3. Give Dex access to a terminal on that Mac and this repository. Dex can run `python3 bridge.py status` to read the current local queue, feedback and article context, and `python3 bridge.py watch` to wait for new feedback. **Keep Dex's watch process active** if it should react immediately. If no agent is watching, the app says so; feedback is still stored for Dex to read with `status` later. A watch command does not itself reason or generate a new deck.
4. Dex creates a short version 1 deck JSON using the contract below, then runs `python3 bridge.py enqueue /private/path/round.json` (or pipes JSON into `python3 bridge.py enqueue -`). The paired app receives the round automatically, usually within two seconds. If another round is already open, select the new one under **Data & handoff**. Rate a sentence with one tap or keys 1–4. Ratings and optional details go to the local bridge automatically; the writer does not need to copy files.
5. Dex reads the feedback, interprets it with the writer, and sends a fresh targeted round. To propose an Article Lab sentence after agreeing on the topic and outline, Dex runs `python3 bridge.py propose --section 'Opening' --sentence 'The proposed sentence.'`. It appears when Article Lab has no current candidate. A score is feedback; accepting a line is a separate action. `status` exposes the local article context, accepted lines, explicitly confirmed rules, and hypotheses to the paired agent. The current user instructions still take precedence.

The app, browser, bridge and Dex must run on the same Mac. This is not a verified connection to a cloud Dot or an always-on agent. If Dex runs elsewhere, no connection is implied; bringing a suitable private connector or agent wake mechanism is a separate decision. Keep the server and, for immediate reactions, the agent session running while practicing.

The bridge listens only on `127.0.0.1`. API calls require a random per-launch token, validate the local host and reject foreign browser origins. Its files are created under `~/.writing-gym/`, with a private directory and files; `session.json` contains the current pairing secret, and `queue.json` contains private decks, feedback and article context. These files are **outside the repository** by default. Back up or delete that directory intentionally; do not commit or share it. The browser also stores its progress locally. Clearing browser data removes that copy, not the bridge's queue. A server restart keeps the queue and changes the pairing link. Pending browser feedback is retained and retried after reconnection; event IDs prevent retry duplicates. A bridge queue from a different session will not receive pending events intended for the original session.

`WRITING_GYM_HOME` can select another private data directory when necessary. To use a different loopback port, run `python3 bridge.py serve --port 8766`. Keep the directory outside the repository. A single data directory supports one server at a time.

## Practice and private handoff

Fresh calibration opens empty and waits for Dex. **Try isolated demo rounds** loads synthetic examples only on request. Demo scores stay in the browser and are never sent to the agent bridge. The generic Article Lab example is isolated too; use **Start a private article** to leave it. Earlier starter decks and any scores saved in the browser remain untouched after upgrading.

Use the four large buttons or keys 1–4; S skips and Z undoes. Typing in a field does not trigger shortcuts. Optional reasons and notes attach to the most recently scored card without blocking the next one. The selected round and seeded card order resume on reload. Contrast metadata is hidden during play; no side-by-side comparison or preference sorting is shown.

Local-only imports and exports remain available under Data & handoff. They are useful for backup or an explicitly shared handoff, but are not required for the paired loop. Preview exports before downloading: they may contain private material. Restoring a backup or resetting local browser data requires confirmation. Version 1 backups created before the bridge remain supported; a missing selected round falls back safely. JSON imports are limited to 5 MB.

Article Lab starts with topic, audience, central claim, evidence and outline. Discuss these with Dex before drafting. Only the preceding accepted sentence appears alongside the candidate. Scores 1–2 call for another attempt; replacing a low-scored candidate retains its scored text in the private handoff. A 3–4 enables a separate **Accept** action. Accepted lines stay locked until reopened. Consecutive section reads preserve author line order, as does the whole-article read. Check sections and then the complete article for rhythm, logic, accuracy and evidence; a good sentence alone does not certify an article.

## Agent contract

For current state, run `python3 bridge.py status`. To wait, run `python3 bridge.py watch`; each JSON line includes an event and cursor. Resume a stopped watch with `python3 bridge.py watch --after CURSOR`. Events include card IDs, actions (`score`, `skip`, `undo`, or updated `detail`) and values, or an article proposal ID, text, score and separate acceptance. Apply undo and later detail events in order. Re-reading `status` or reconnecting is safe; don't infer a preference from a transient event without reconciling later undo or edits.

Create a small controlled deck, no more than 100 cards and no more than 250 KB per bridge request:

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

IDs must be stable and globally unique across queued rounds; use letters, numbers, dots, underscores or hyphens. `context` is a short neutral label or a preceding sentence when needed for a transition. Pair ID, hypothesis, variant and topic remain private metadata during practice. Match claim, uncertainty, role, technical depth and terms; vary one deliberate choice. Put counterparts in separate short rounds where possible. The order is seeded and avoids adjacent same-pair cards where possible.

The writer's current instructions, words, edits and source materials outrank a voice card or an inferred preference. Ratings are ordinal observations, not reward scores or a guaranteed style fingerprint; subject matter can confound style. Look for 2–3 candidate hypotheses with at least two usable contrasts across distinct contexts showing the same direction, then test a fresh holdout before recommending a default. Mixed or sparse observations stay tentative or context-specific. If the gate is not met, propose a short focused round. An approved rule should change a future sentence, include a scope, positive example and counterexample, and remain revisable. Never add a rule automatically from a deck or single rating. Preserve claim strength and source accuracy; do not manufacture hooks, evidence, conclusions, analogies or a forced style.

## Development

Run `node --test tests/core.test.js` and `node tests/bridge.test.cjs`. The latter starts a private temporary loopback bridge, runs the actual app client against a minimal DOM, and exercises agent enqueue, scoring, watch, article proposal and demo isolation. It is not a real browser. With Playwright and Chromium installed, also run `node tests/browser.cjs` for actual browser interactions. The app itself has no JavaScript dependencies. Keep real drafts, ratings, secrets and personal voice cards out of this public repository.

The author-first hierarchy and evidence-based optional voice card were inspired by [famulare/writing-assistant-skills](https://github.com/famulare/writing-assistant-skills), especially its [preserve-authorial-writing guard](https://github.com/famulare/writing-assistant-skills/blob/main/skills/preserve-authorial-writing/SKILL.md) and [voice card template](https://github.com/famulare/writing-assistant-skills/blob/main/references/voice-card-template.md). This is an independent implementation; no upstream install scripts are used.
