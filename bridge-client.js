'use strict';

// The bridge is a local queue, not an agent or a background wake mechanism.
(() => {
  const status = document.querySelector('#bridge-status');
  const pairing = new URLSearchParams(location.hash.slice(1)).get('pair');
  if (pairing) {
    sessionStorage.setItem('writing-gym-pair', pairing);
    history.replaceState(null, '', location.pathname + location.search);
  }
  const token = sessionStorage.getItem('writing-gym-pair');
  let sessionId = state.bridgeSessionId || null;
  let connected = false;
  let sending = false;
  let contextTimer;

  function message(text) {
    status.textContent = text;
  }

  async function request(path, body) {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('Bridge unavailable or pairing expired');
    return response.json();
  }

  function queue(event) {
    const targetSession = state.bridgeSessionId;
    if (!targetSession) return;
    state.bridgeOutbox ||= [];
    state.bridgeOutbox.push({
      id: crypto.randomUUID(), sessionId: targetSession, ...event
    });
    save();
    flush();
  }

  async function flush() {
    if (!connected || sending || !state.bridgeOutbox?.length) return;
    sending = true;
    try {
      while (state.bridgeOutbox.length && state.bridgeOutbox[0].sessionId === sessionId) {
        const event = state.bridgeOutbox[0];
        await request('/api/events', event);
        if (state.bridgeOutbox?.[0]?.id === event.id) state.bridgeOutbox.shift();
        save();
      }
    } catch {
      connected = false;
      message('Bridge disconnected. Feedback is queued in this browser and will retry when paired again.');
    } finally {
      sending = false;
    }
  }

  function recordRound(deckId, cardId, action, value) {
    if (state.bridgeDecks?.[deckId] !== state.bridgeSessionId) return;
    queue({ type: 'calibration', deckId, cardId, action, value });
  }

  function recordArticle(action, draft) {
    if (draft.demo) return;
    queue({ type: 'article', action, proposalId: draft.bridgeProposalId || null,
      sentence: draft.candidate, score: draft.candidateScore, section: draft.section });
  }

  function scheduleContext() {
    clearTimeout(contextTimer);
    contextTimer = setTimeout(async () => {
      if (!connected) return;
      try {
        const draft = state.article;
        await request('/api/context', {
          article: draft.demo ? null : {
            topic: draft.topic, audience: draft.audience, claim: draft.claim,
            evidence: draft.evidence, outline: draft.outline, lines: draft.lines,
            candidate: draft.candidate, section: draft.section
          },
          voiceCard: { confirmedRules: state.rules, hypothesesToTest: state.hypotheses }
        });
      } catch {
        connected = false;
      }
    }, 500);
  }

  async function poll() {
    try {
      const remote = await request('/api/state');
      const wasConnected = connected;
      connected = true;
      sessionId = remote.sessionId;
      // Pending feedback from a different session is retained, never sent to this one.
      if (state.bridgeSessionId && state.bridgeSessionId !== sessionId && state.bridgeOutbox?.length) {
        message('Different bridge session detected. Pending feedback remains in this browser; restore the original bridge to deliver it.');
        return;
      }
      state.bridgeSessionId = sessionId;
      state.bridgeDecks ||= {};
      let added = false;
      let collision = false;
      for (const deck of remote.decks) {
        Gym.validateDeck(deck);
        const existing = state.decks.find(item => item.id === deck.id);
        if (existing) {
          if (JSON.stringify(existing) === JSON.stringify(deck)) state.bridgeDecks[deck.id] = sessionId;
          else collision = true;
          continue;
        }
        const ids = new Set(state.decks.flatMap(item => item.cards.map(card => card.id)));
        if (deck.cards.some(card => ids.has(card.id))) {
          collision = true;
          continue;
        }
        state.decks.push(deck);
        state.bridgeDecks[deck.id] = sessionId;
        added = true;
        const previous = state.decks.find(item => item.id === active);
        const previousRound = previous && state.rounds[previous.id];
        if (!active || (state.bridgeDecks[active] === sessionId && previousRound &&
                        previousRound.cursor >= previousRound.order.length)) {
          active = deck.id;
          state.selectedRound = active;
        }
      }
      const draft = state.article;
      state.bridgeSeenProposals ||= {};
      const seen = state.bridgeSeenProposals[sessionId] ||= [...(draft.seenProposals || [])];
      const proposal = !draft.demo && remote.proposals.find(item => !seen.includes(item.id));
      if (proposal && !draft.candidate.trim() && !Number.isInteger(draft.editIndex)) {
        seen.push(proposal.id);
        draft.candidate = proposal.sentence;
        draft.candidateScore = null;
        draft.section = proposal.section;
        draft.bridgeProposalId = proposal.id;
        if (!document.querySelector('#article').hidden) renderArticle();
        scheduleContext();
      }
      save();
      if (added && !document.querySelector('#practice').hidden) renderPractice();
      if (added && !document.querySelector('#library').hidden) renderLibrary();
      if (collision) {
        message('A Dex round conflicts with a local deck or card ID. It was not imported; ask Dex for new IDs.');
      } else if (remote.listening) {
        message('Local bridge connected · an agent listener is waiting for feedback. Agent rounds are in Data & handoff.');
      } else {
        message('Local bridge connected · no agent is currently waiting. Feedback is saved to the bridge for Dex to read. Agent rounds are in Data & handoff.');
      }
      flush();
      if (!wasConnected) scheduleContext();
    } catch {
      connected = false;
      message('Waiting for the local bridge. Start it and open its private pairing link; feedback already queued in this browser will retry.');
    }
  }

  window.GymBridge = { recordRound, recordArticle, scheduleContext };
  if (!token || location.protocol !== 'http:' || location.hostname !== '127.0.0.1') {
    message('Waiting for Dex. Start the local bridge and open its private pairing link. The demo below is separate.');
    return;
  }
  poll();
  setInterval(poll, 2000);
})();
