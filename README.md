# Writing Gym

A static, offline-first practice space for rating one sentence at a time. Open `index.html` in a modern browser. No installation, API key, server, analytics, account, model connection, or network is needed. Data lives in that browser's local storage; another browser or device will not see it unless you export and restore a backup. Clearing browser data removes it. Hosting is a separate decision.

## Practice

Start with the two synthetic starter rounds. Use the four buttons or keys 1–4; S skips without a score and Z undoes the last action. Keyboard shortcuts are disabled while using form controls. Optional reasons and notes attach to the most recently scored card without stopping the next card. A seeded order stays stable on reload; each contrast's other variant is in the other round. The app does not rank or display competing variants during practice.

In Data & handoff, paste or choose an agent-created deck and validate it. Existing deck and card IDs cannot be overwritten. Preview an agent handoff or full backup before downloading; these files can contain sensitive feedback and writing. Restoring a backup replaces local data only after confirmation. Reset also requires confirmation. The 5 MB import limit is intentional.

## Article Lab

After useful calibration, discuss topic, audience, central claim, evidence, and outline with your agent. Paste one proposed sentence at a time; only the preceding accepted sentence appears beside the candidate. Scores 1–2 call for another attempt. A 3–4 only enables a separate **Accept** action. Accepted lines remain locked until reopened. The section view stitches each section; the whole-article read is a separate check for rhythm, logic, accuracy, and evidence. A good sentence alone does not establish a good article. This app does not publish. Load the generic example for three practice candidates, one at a time; it is not a personalized article. Agent collaboration requires explicit handoff; nothing connects automatically.

## Agent handoff

The user intentionally exports `writing-gym-handoff.json` and shares it with an agent. The handoff includes version, deck and card IDs, pair IDs, hypotheses, topic, variant metadata, ordinal scores, optional reasons/notes, explicitly confirmed rules and tentative hypotheses separately, and the article context, attempts and accepted lines. Unscored or skipped cards are not ratings. User instructions, direct words, edits, and current source materials outrank the voice card or any inferred preference. Do not import deck text into the voice card automatically.

Treat each pair as a controlled but imperfect contrast: match claim, uncertainty, role, technical depth and terms, changing one feature at a time. Do not infer a stable taste from one card, assume tags prove causality, or treat ordinal scores as numerical rewards. Topic may confound style. Look for 2–3 candidate hypotheses with at least two usable contrasts across distinct contexts showing the same direction. Then propose a short fresh holdout contrast for each before recommending a default. Mixed or sparse observations remain tentative or context-specific. If the gate is not met, propose one narrow short round rather than requiring a giant deck before writing. A confirmed rule should say what to do in a future sentence, include a scope, positive example and counterexample, and be explicitly approved and revisable by the user. Hypotheses and approved rules are separate. Preserve claim strength and source accuracy; do not manufacture a news hook, mechanism, conclusion, analogy, or style trick. Prior pacing ideas are hypotheses, not mandatory structure.

### Deck format v1

UTF-8 JSON, at most 5 MB; 1–100 cards. IDs must be stable and globally unique across imported rounds; use letters, numbers, dots, underscores, or hyphens. Use a distinct deck ID and seed. `pairId`, `hypothesis`, `variant`, and `topic` are private metadata shown only in the export; `context` is a short neutral label shown with the sentence. Put counterparts in separate short rounds when possible. The seeded order also avoids adjacent cards with the same `pairId` where possible. Never include real private examples in a public fixture.

```json
{
  "kind": "writing-gym-deck", "version": 1,
  "id": "example-round-1", "title": "A short round", "seed": "example-seed",
  "cards": [{
    "id": "example-card-1", "sentence": "The build stopped when a dependency was missing.",
    "context": "build", "pairId": "example-pair-1", "hypothesis": "detail timing",
    "variant": "A", "topic": "build"
  }]
}
```

Backups use `kind: writing-gym-backup`, `version: 1`, and a `state` object. Agent handoffs use `kind: writing-gym-handoff`, `version: 1`; they are for sharing, not restoring. Importing unknown versions fails rather than silently changing their meaning. Only import files you choose to trust: text is rendered as text, but imported content can still be misleading.

## Development

Run `node --test tests/*.test.js`. Optional browser checks: `node tests/browser.cjs` if Playwright and Chromium are installed. The app itself has no dependencies. `fixtures.js` contains only synthetic examples, and no personal ratings, article drafts, or voice cards belong in this public repository.

The author-first hierarchy and optional evidence-based voice card were inspired by [famulare/writing-assistant-skills](https://github.com/famulare/writing-assistant-skills), especially its [preserve-authorial-writing guard](https://github.com/famulare/writing-assistant-skills/blob/main/skills/preserve-authorial-writing/SKILL.md) and [voice card template](https://github.com/famulare/writing-assistant-skills/blob/main/references/voice-card-template.md). This project is an independent implementation; no upstream install scripts are used.
