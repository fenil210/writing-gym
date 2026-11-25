'use strict';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const KEY = 'writing-gym-v1';
let state;
let active;
let last = null;
let previewName = 'writing-gym.json';

try {
  const raw = localStorage.getItem(KEY);
  state = raw
    ? Gym.validateBackup({ kind: 'writing-gym-backup', version: 1, state: Gym.parse(raw) })
    : Gym.blank([]);
} catch {
  state = Gym.blank([]);
  alert('Local data could not be read. It has not been overwritten. Export it from browser storage before making changes.');
}

function restoreActiveRound() {
  active = state.decks.some(deck => deck.id === state.selectedRound)
    ? state.selectedRound : state.decks[0]?.id;
  state.selectedRound = active || null;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    alert('Could not save locally. Browser storage may be unavailable or full.');
  }
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(text, action, className = 'quiet') {
  const element = node('button', text, className);
  element.addEventListener('click', action);
  return element;
}

function page(name) {
  $$('.page').forEach(element => element.hidden = element.id !== name);
  $$('nav button').forEach(element => element.classList.toggle('active', element.dataset.page === name));
  if (name === 'practice') renderPractice();
  if (name === 'library') renderLibrary();
  if (name === 'article') renderArticle();
}

$$('nav button').forEach(element => element.onclick = () => page(element.dataset.page));

function renderPractice() {
  const deck = state.decks.find(item => item.id === active) || state.decks[0];
  if (!deck) {
    $('#progress').textContent = 'Waiting for Dex';
    $('#bar').style.width = '0%';
    $('#undo').disabled = true;
    $('#card-area').replaceChildren(node('div', 'Waiting for Dex to send a private round.', 'card'));
    return;
  }
  active = deck.id;
  const round = Gym.round(state, deck.id);
  const area = $('#card-area');
  area.replaceChildren();
  $('#progress').textContent = `${deck.title} · ${Math.min(round.cursor + 1, round.order.length)} / ${round.order.length}`;
  $('#bar').style.width = `${100 * round.cursor / round.order.length}%`;
  $('#undo').disabled = !round.history.length;

  if (round.cursor >= round.order.length) {
    const card = node('div', undefined, 'card');
    card.append(node('div', 'ROUND COMPLETE', 'label'),
      node('p', 'Nice work. Your observations are ready when you are.', 'sentence'),
      node('p', 'Hypotheses and variants are available in the private agent export. Review them with your agent before proposing any rule.', 'hint'),
      button('Data & handoff', () => page('library')));
    area.append(card);
    return;
  }

  const current = deck.cards.find(item => item.id === round.order[round.cursor]);
  const card = node('div', undefined, 'card');
  if (current.context) card.append(node('div', current.context, 'label'));
  card.append(node('p', current.sentence, 'sentence'));
  area.append(card, node('p', 'How does this sentence read?', 'prompt'));
  const scores = node('div', undefined, 'scores');
  ['No', 'Needs a rewrite', 'Works', 'I’d write it'].forEach((label, index) => {
    const choice = document.createElement('button');
    choice.append(node('b', String(index + 1)), document.createTextNode(label));
    choice.onclick = () => score(index + 1);
    scores.append(choice);
  });
  area.append(scores, button('Skip this one', () => score(null)));
  area.lastChild.style.marginTop = '12px';
}

function score(value) {
  const round = Gym.round(state, active);
  if (round.cursor >= round.order.length) return;
  const id = round.order[round.cursor];
  Gym.act(round, value);
  if (window.GymBridge) GymBridge.recordRound(active, id, value === null ? 'skip' : 'score', value);
  last = value === null ? null : { deck: active, id };
  $('#after').hidden = !last;
  if (last) {
    $('#scored').textContent = `Saved ${value} / 4 · add a reason if you like`;
    $('#reason').value = '';
    $('#note').value = '';
  }
  save();
  renderPractice();
}

$('#reason').onchange = () => {
  if (last && state.rounds[last.deck].ratings[last.id]) {
    state.rounds[last.deck].ratings[last.id].reason = $('#reason').value;
    if (window.GymBridge) GymBridge.recordRound(last.deck, last.id, 'detail', state.rounds[last.deck].ratings[last.id]);
    save();
  }
};
$('#note').oninput = () => {
  if (last && state.rounds[last.deck].ratings[last.id]) {
    state.rounds[last.deck].ratings[last.id].note = $('#note').value;
    if (window.GymBridge) GymBridge.recordRound(last.deck, last.id, 'detail', state.rounds[last.deck].ratings[last.id]);
    save();
  }
};
function undo() {
  const round = Gym.round(state, active);
  const id = round.history.at(-1)?.id;
  if (Gym.undo(round)) {
    if (window.GymBridge) GymBridge.recordRound(active, id, 'undo', null);
    last = null;
    $('#after').hidden = true;
    save();
    renderPractice();
  }
}
$('#undo').onclick = undo;
document.addEventListener('keydown', event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.repeat ||
      event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
  if (!$('#practice').hidden) {
    if (/^[1-4]$/.test(event.key)) score(Number(event.key));
    else if (event.key.toLowerCase() === 's') score(null);
    else if (event.key.toLowerCase() === 'z') undo();
  }
});

function renderLibrary() {
  const list = $('#round-list');
  list.replaceChildren();
  state.decks.forEach(deck => {
    const round = Gym.round(state, deck.id);
    const entry = node('div', undefined, 'entry');
    entry.append(node('strong', deck.title),
      node('p', `${round.cursor} of ${deck.cards.length} seen · ${Object.keys(round.ratings).length} scored`, 'status'),
      button('Open round', () => {
        active = deck.id;
        state.selectedRound = deck.id;
        last = null;
        $('#after').hidden = true;
        save();
        page('practice');
      }));
    list.append(entry);
  });
  const rules = $('#rules');
  rules.replaceChildren();
  state.rules.forEach((rule, index) => {
    const entry = node('div', undefined, 'entry');
    entry.append(node('strong', rule.rule),
      node('p', `Scope: ${rule.scope}\nPositive: ${rule.positive}\nCounterexample: ${rule.counterexample}`),
      button('Remove / revise', () => {
        if (confirm('Remove this rule? You can add a revised rule.')) {
          state.rules.splice(index, 1);
          save();
          if (window.GymBridge) GymBridge.scheduleContext();
          renderLibrary();
        }
      }));
    rules.append(entry);
  });
  $('#hypotheses').value = state.hypotheses;
}

$('#hypotheses').oninput = event => {
  state.hypotheses = event.target.value;
  save();
  if (window.GymBridge) GymBridge.scheduleContext();
};
$('#add-rule').onclick = () => {
  const rule = $('#rule').value.trim();
  const scope = $('#scope').value.trim();
  const positive = $('#positive').value.trim();
  const counterexample = $('#counterexample').value.trim();
  if (!rule || !scope || !positive || !counterexample) {
    alert('Add the rule, scope, positive example, and counterexample.');
    return;
  }
  state.rules.push({ rule, scope, positive, counterexample });
  if (window.GymBridge) GymBridge.scheduleContext();
  ['rule', 'scope', 'positive', 'counterexample'].forEach(id => $('#' + id).value = '');
  save();
  renderLibrary();
};

$('#import-file').onchange = async event => {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > Gym.MAX) {
    $('#import-status').textContent = 'File exceeds 5 MB.';
    return;
  }
  $('#import-text').value = await file.text();
};
$('#import').onclick = () => {
  try {
    const payload = Gym.parse($('#import-text').value);
    if (payload.kind === 'writing-gym-deck') {
      Gym.validateDeck(payload);
      if (state.decks.some(deck => deck.id === payload.id)) {
        throw Error('Deck ID already exists; existing work was not changed.');
      }
      const ids = new Set(state.decks.flatMap(deck => deck.cards.map(card => card.id)));
      if (payload.cards.some(card => ids.has(card.id))) throw Error('A card ID already exists in another deck.');
      state.decks.push(payload);
      save();
      $('#import-status').textContent = 'Deck imported. Open it below.';
      renderLibrary();
    } else if (payload.kind === 'writing-gym-backup') {
      const restored = Gym.validateBackup(payload);
      if (!confirm('Replace all local data with this backup? Export a backup first if needed.')) return;
      state = restored;
      restoreActiveRound();
      last = null;
      $('#after').hidden = true;
      save();
      $('#import-status').textContent = 'Backup restored.';
      renderLibrary();
    } else {
      throw Error('Expected a version 1 deck or backup.');
    }
  } catch (error) {
    $('#import-status').textContent = error.message;
  }
};

function preview(payload, name) {
  $('#export-preview').value = JSON.stringify(payload, null, 2);
  previewName = name;
  $('#download').disabled = false;
}
$('#preview-agent').onclick = () => preview(Gym.handoff(state), 'writing-gym-handoff.json');
$('#preview-backup').onclick = () => preview({ kind: 'writing-gym-backup', version: 1, state }, 'writing-gym-backup.json');
$('#download').onclick = () => {
  const url = URL.createObjectURL(new Blob([$('#export-preview').value], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = previewName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#reset').onclick = () => {
  if (confirm('Delete all Writing Gym data in this browser? Export a backup first.')) {
    localStorage.removeItem(KEY);
    state = Gym.blank([]);
    restoreActiveRound();
    last = null;
    $('#after').hidden = true;
    $('#export-preview').value = '';
    $('#download').disabled = true;
    renderLibrary();
  }
};

const article = () => state.article;
$$('[data-article]').forEach(element => element.oninput = () => {
  article()[element.dataset.article] = element.value;
  save();
  if (window.GymBridge) GymBridge.scheduleContext();
});
$('#candidate').oninput = event => {
  const draft = article();
  if (draft.candidateScore && draft.candidateScore <= 2 && draft.candidate.trim()) {
    draft.attempts.push({ sentence: draft.candidate, score: draft.candidateScore, section: draft.section });
    delete draft.bridgeProposalId;
  }
  draft.candidate = event.target.value;
  draft.candidateScore = null;
  save();
  if (window.GymBridge) GymBridge.scheduleContext();
  renderArticleStatus();
};
$('#section-name').oninput = event => {
  article().section = event.target.value;
  save();
  if (window.GymBridge) GymBridge.scheduleContext();
  renderArticleStatus();
};
$('#new-article').onclick = () => {
  if ((article().topic || article().candidate || article().lines.length) &&
      !confirm('Start a new private article? Export a backup first if needed.')) return;
  state.article = Gym.blank([]).article;
  save();
  if (window.GymBridge) GymBridge.scheduleContext();
  renderArticle();
};
$('#demo').onclick = () => {
  if ((article().topic || article().lines.length) &&
      !confirm('Replace this article with the generic practice example? Export a backup first if needed.')) return;
  state.article = {
    demo: true,
    topic: 'A small release checklist',
    audience: 'A software team',
    claim: 'A short checklist can make routine releases easier to coordinate.',
    evidence: 'Example premise for practice only; verify any real claim.',
    outline: 'Opening: name the coordination problem. Middle: describe a short checklist. Close: note its limits.',
    candidate: 'A release takes coordination across several small steps.',
    candidateScore: null,
    section: 'Opening',
    lines: [],
    attempts: [],
    demoQueue: [
      { section: 'Middle', sentence: 'A short checklist can make those steps visible to everyone involved.' },
      { section: 'Close', sentence: 'The checklist still needs to change when the release process changes.' }
    ]
  };
  save();
  renderArticle();
};
$('#article-scores').onclick = event => {
  const choice = event.target.closest('[data-score]');
  if (!choice) return;
  if (!article().candidate.trim()) {
    alert('Add a candidate sentence first.');
    return;
  }
  article().candidateScore = Number(choice.dataset.score);
  if (window.GymBridge) GymBridge.recordArticle('score', article());
  save();
  renderArticleStatus();
};
function renderArticleStatus() {
  const score = article().candidateScore;
  $('#article-rating').textContent = score
    ? `Scored ${score} / 4. ${score < 3 ? 'Try a different line.' : 'Accept separately if this is the line you want.'}`
    : 'Choose a score. Scores 1–2 call for a different line; 3–4 can be accepted separately.';
  $('#accept').disabled = !(score >= 3 && article().candidate.trim() && article().section.trim());
}
$('#try-again').onclick = () => {
  const draft = article();
  if (draft.candidate.trim()) {
    draft.attempts.push({ sentence: draft.candidate, score: draft.candidateScore, section: draft.section });
  }
  draft.candidate = '';
  draft.candidateScore = null;
  delete draft.bridgeProposalId;
  save();
  if (window.GymBridge) GymBridge.scheduleContext();
  renderArticle();
};
$('#accept').onclick = () => {
  const draft = article();
  if (!(draft.candidateScore >= 3 && draft.candidate.trim() && draft.section.trim())) return;
  if (window.GymBridge) GymBridge.recordArticle('accept', draft);
  const line = {
    id: 'line-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    section: draft.section, sentence: draft.candidate, score: draft.candidateScore
  };
  if (Number.isInteger(draft.editIndex)) {
    draft.lines.splice(draft.editIndex, 0, line);
    delete draft.editIndex;
  } else {
    draft.lines.push(line);
  }
  draft.candidate = '';
  draft.candidateScore = null;
  delete draft.bridgeProposalId;
  if (draft.demoQueue?.length) {
    const next = draft.demoQueue.shift();
    draft.candidate = next.sentence;
    draft.section = next.section;
  }
  save();
  if (window.GymBridge) GymBridge.scheduleContext();
  renderArticle();
};

function renderArticle() {
  const draft = article();
  $$('[data-article]').forEach(element => element.value = draft[element.dataset.article] || '');
  $('#candidate').value = draft.candidate || '';
  $('#section-name').value = draft.section || '';
  $('#previous').textContent = (Number.isInteger(draft.editIndex)
    ? draft.lines[draft.editIndex - 1] : draft.lines.at(-1))?.sentence || 'None yet.';
  renderArticleStatus();

  const list = $('#manuscript');
  list.replaceChildren();
  if (!draft.lines.length) list.append(node('p', 'No accepted lines yet.', 'hint'));
  // Only join consecutive lines. A later return to a section stays in place.
  const groups = [];
  for (const line of draft.lines) {
    let group = groups.at(-1);
    if (!group || group.section !== line.section) {
      group = { section: line.section, lines: [] };
      groups.push(group);
    }
    group.lines.push(line);
  }
  for (const group of groups) {
    const entry = node('div', undefined, 'entry');
    entry.append(node('strong', group.section), node('p', group.lines.map(line => line.sentence).join(' ')));
    for (const line of group.lines) {
      entry.append(button('Reopen: ' + line.sentence.slice(0, 35), () => {
        if (Number.isInteger(draft.editIndex)) {
          alert('Finish the reopened line first.');
          return;
        }
        if (draft.candidate.trim() && !confirm('Replace the current candidate with this line?')) return;
        if (!confirm('Reopen this accepted line? It will leave the manuscript until accepted again.')) return;
        if (draft.candidateScore && draft.candidateScore <= 2 && draft.candidate.trim()) {
          draft.attempts.push({ sentence: draft.candidate, score: draft.candidateScore, section: draft.section });
        }
        draft.editIndex = draft.lines.findIndex(item => item.id === line.id);
        draft.lines.splice(draft.editIndex, 1);
        draft.candidate = line.sentence;
        draft.section = line.section;
        draft.candidateScore = null;
        delete draft.bridgeProposalId;
        save();
        if (window.GymBridge) GymBridge.scheduleContext();
        renderArticle();
      }));
    }
    list.append(entry);
  }
  $('#whole').replaceChildren();
}
$('#whole-read').onclick = () => {
  $('#whole').replaceChildren(node('p', article().lines.map(line => line.sentence).join(' ')));
};

$('#load-demo').onclick = () => {
  const ids = new Set(state.decks.flatMap(deck => deck.cards.map(card => card.id)));
  for (const deck of FIXTURES) {
    if (!state.decks.some(existing => existing.id === deck.id) &&
        !deck.cards.some(card => ids.has(card.id))) state.decks.push(deck);
  }
  active = FIXTURES[0].id;
  state.selectedRound = active;
  save();
  renderPractice();
};
restoreActiveRound();
renderPractice();
