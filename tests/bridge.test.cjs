// Runs the real app and bridge client with a minimal DOM and a real loopback server.
// This is an integration check, not a replacement for the Playwright browser test.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const net = require('node:net');
const readline = require('node:readline');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'writing-gym-test-'));
const env = { ...process.env, WRITING_GYM_HOME: dir };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, message) {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await pause(50);
  }
  throw Error('Timed out: ' + message);
}
function cli(args, input) {
  const result = spawnSync('python3', ['bridge.py', ...args], { cwd: root, env, input, encoding: 'utf8' });
  if (result.status !== 0) throw Error(result.stderr);
  return result.stdout;
}

class Element {
  constructor(tag = 'div') {
    this.tag = tag;
    this.children = [];
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.style = {};
    this.dataset = {};
    this.classList = { toggle() {} };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(name, callback) { this['on' + name] = callback; }
  get lastChild() { return this.children.at(-1); }
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

async function main() {
  const port = await freePort();
  const startup = spawnSync('python3', ['gym.py', 'start', '--no-browser', '--port', String(port)],
    { cwd: root, env, encoding: 'utf8' });
  assert.equal(startup.status, 0, startup.stderr);
  let watcher;
  let mcp;
  try {
    await until(() => fs.existsSync(path.join(dir, 'session.json')), 'bridge startup');
    const session = JSON.parse(fs.readFileSync(path.join(dir, 'session.json')));
    const base = 'http://127.0.0.1:' + session.port;
    assert.ok(!startup.stdout.includes(session.token));
    assert.match(startup.stdout, /Pair this browser/);
    const html = await (await fetch(base + '/')).text();
    assert.match(html, /Calibration/);
    assert.match(html, /Article Lab/);
    assert.match(html, /bridge-client\.js/);
    const unauthorized = await fetch(base + '/api/state');
    assert.equal(unauthorized.status, 403);
    const hostile = await fetch(base + '/api/state', {
      headers: { Authorization: 'Bearer ' + session.token, Origin: 'https://example.com' }
    });
    assert.equal(hostile.status, 403);
    assert.equal(fs.statSync(path.join(dir, 'session.json')).mode & 0o077, 0);

    const elements = new Map();
    const document = {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, new Element());
        return elements.get(selector);
      },
      querySelectorAll(selector) {
        if (selector === '.page') return ['practice', 'article', 'library'].map(id => this.querySelector('#' + id));
        return [];
      },
      createElement: tag => new Element(tag),
      createTextNode: text => ({ textContent: text }),
      addEventListener(name, callback) { this['on' + name] = callback; }
    };
    document.querySelector('#article').hidden = true;
    document.querySelector('#library').hidden = true;
    const memory = new Map();
    const paired = new Map();
    const storage = { getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value),
      removeItem: key => memory.delete(key) };
    const intervals = [];
    let blockEvents = false;
    const context = {
      document, localStorage: storage,
      sessionStorage: { getItem: key => paired.get(key) || null, setItem: (key, value) => paired.set(key, value) },
      location: { hash: '', pathname: '/', search: '', protocol: 'http:', hostname: '127.0.0.1' },
      history: { replaceState() {} }, URLSearchParams, TextEncoder, crypto: webcrypto,
      fetch: (url, options) => {
        if (blockEvents && url === '/api/events') return Promise.reject(Error('simulated disconnect'));
        if (url === '/api/pair') options = { ...options, headers: { Origin: base, 'Sec-Fetch-Site': 'same-origin' } };
        return fetch(base + url, options);
      },
      setTimeout, clearTimeout, setInterval: callback => { intervals.push(callback); },
      alert: message => { throw Error('Unexpected alert: ' + message); }, confirm: () => true,
      Blob, URL, console
    };
    context.window = context;
    vm.createContext(context);
    for (const file of ['core.js', 'fixtures.js', 'app.js', 'bridge-client.js']) {
      vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
    }
    assert.match(document.querySelector('#card-area').children[0].textContent, /Waiting for your agent/);
    assert.equal(document.querySelector('#pair-browser').hidden, false);
    await document.querySelector('#pair-browser').onclick();
    assert.equal(paired.get('writing-gym-pair'), session.token);
    await until(() => intervals.length > 0, 'paired polling started');
    const deck = {
      kind: 'writing-gym-deck', version: 1, id: 'agent-round', title: 'Agent round', seed: 'seed',
      cards: [{ id: 'agent-card', sentence: 'A provisional sentence from the agent.', topic: 'test' }]
    };
    mcp = spawn('python3', ['mcp_server.py'], { cwd: root, env, stdio: ['pipe', 'pipe', 'ignore'] });
    const pending = new Map();
    readline.createInterface({ input: mcp.stdout }).on('line', line => {
      const message = JSON.parse(line);
      const resolve = pending.get(message.id);
      if (resolve) { pending.delete(message.id); resolve(message); }
    });
    let requestId = 0;
    function rpc(method, params) {
      const id = ++requestId;
      return new Promise(resolve => {
        pending.set(id, resolve);
        mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      });
    }
    const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {},
      clientInfo: { name: 'acceptance-test', version: '1' } });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    mcp.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    assert.equal((await rpc('tools/list', {})).result.tools.length, 4);
    async function tool(name, args) {
      const response = await rpc('tools/call', { name, arguments: args });
      assert.equal(response.result.isError, undefined, JSON.stringify(response));
      return response.result.structuredContent.data;
    }
    await tool('submit_cards', { deck });
    watcher = spawn('python3', ['bridge.py', 'watch'], { cwd: root, env, stdio: ['ignore', 'pipe', 'ignore'] });
    let observed = '';
    watcher.stdout.on('data', chunk => { observed += chunk; });
    intervals[0]();
    await until(() => vm.runInContext('state.decks.some(d => d.id === "agent-round")', context), 'agent deck in UI');
    const area = document.querySelector('#card-area');
    const scores = area.children.find(child => child.className === 'scores');
    assert.ok(scores, 'score buttons were rendered');
    scores.children[1].onclick();
    await until(() => observed.includes('agent-card'), 'agent received score');
    let data = JSON.parse(cli(['status']));
    assert.equal(data.events[0].type, 'calibration');
    assert.equal(data.events[0].value, 2);
    assert.equal(data.events[0].cardId, 'agent-card');
    const mcpFeedback = await tool('get_feedback', { after: 0 });
    assert.equal(mcpFeedback.events[0].value, 2);
    await until(async () => Boolean((await tool('get_state', {})).context.voiceCard), 'voice context synchronized');
    assert.deepEqual((await tool('get_state', {})).context.voiceCard.confirmedRules, [],
      'a single score must not create a rule');
    document.querySelector('#rule').value = 'Use a named actor when the register calls for it.';
    document.querySelector('#scope').value = 'Technical blog';
    document.querySelector('#positive').value = 'card-positive';
    document.querySelector('#counterexample').value = 'card-counterexample';
    document.querySelector('#add-rule').onclick();
    await until(async () => (await tool('get_state', {})).context.voiceCard.confirmedRules.length === 1,
      'author-approved rule synchronized');
    const guide = (await tool('get_state', {})).context.voiceCard.confirmedRules[0];
    assert.equal(guide.scope, 'Technical blog');
    assert.equal(guide.positive, 'card-positive');
    assert.equal(guide.counterexample, 'card-counterexample');
    const duplicate = await fetch(base + '/api/events', {
      method: 'POST', headers: { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' },
      body: JSON.stringify(data.events[0])
    });
    assert.equal(duplicate.status, 200);
    assert.equal(JSON.parse(cli(['status'])).events.length, 1, 'retries are idempotent');

    blockEvents = true;
    document.querySelector('#undo').onclick();
    await until(() => vm.runInContext('state.bridgeOutbox.length', context) === 1, 'offline undo queued');
    blockEvents = false;
    intervals[0]();
    await until(() => JSON.parse(cli(['status'])).events.some(event => event.action === 'undo'), 'queued undo retried');
    await until(() => vm.runInContext('state.bridgeOutbox.length', context) === 0, 'outbox drained');
    document.querySelector('#card-area').children.find(child => child.className === 'scores').children[2].onclick();
    const nextDeck = { ...deck, id: 'next-round', title: 'Next round',
      cards: [{ id: 'next-card', sentence: 'A fresh follow-up sentence.' }] };
    await tool('submit_cards', { deck: nextDeck });
    intervals[0]();
    await until(() => vm.runInContext('active', context) === 'next-round', 'next agent round opens');

    vm.runInContext(`state.selectedRound = 'agent-round'; save(); active = undefined;
      state = Gym.validateBackup({kind:'writing-gym-backup', version:1, state:JSON.parse(localStorage.getItem('writing-gym-v1'))});
      restoreActiveRound(); renderPractice();`, context);
    assert.equal(vm.runInContext('active', context), 'agent-round');
    vm.runInContext("state.selectedRound = 'missing'; restoreActiveRound()", context);
    assert.equal(vm.runInContext('active', context), 'agent-round');
    vm.runInContext('delete state.selectedRound; restoreActiveRound()', context);
    assert.equal(vm.runInContext('active', context), 'agent-round');

    cli(['propose', '--section', 'Opening', '--sentence', 'An agent-proposed article sentence.']);
    intervals[0]();
    await until(() => vm.runInContext('state.article.candidate', context) === 'An agent-proposed article sentence.', 'article proposal in UI');
    const scoreTarget = { closest: () => ({ dataset: { score: '1' } }) };
    document.querySelector('#article-scores').onclick({ target: scoreTarget });
    document.querySelector('#candidate').oninput({ target: { value: 'A replacement sentence.' } });
    await until(() => observed.includes('An agent-proposed article sentence.'), 'article score sent to agent');
    data = JSON.parse(cli(['status']));
    const articleEvent = data.events.find(event => event.type === 'article');
    assert.equal(articleEvent.score, 1);
    assert.ok(articleEvent.proposalId);
    const attempts = vm.runInContext('JSON.stringify(state.article.attempts)', context);
    assert.deepEqual(JSON.parse(attempts), [{ sentence: 'An agent-proposed article sentence.', score: 1, section: 'Opening' }]);
    await until(() => JSON.parse(cli(['status'])).context.article?.candidate === 'A replacement sentence.', 'article context');

    vm.runInContext(`state.article.lines = [
      {id:'l1', section:'Opening', sentence:'First.'},
      {id:'l2', section:'Middle', sentence:'Second.'},
      {id:'l3', section:'Opening', sentence:'Third.'}
    ]; renderArticle();`, context);
    const stitched = document.querySelector('#manuscript').children.map(entry => entry.children[1].textContent);
    assert.deepEqual(stitched, ['First.', 'Second.', 'Third.']);

    const eventCount = JSON.parse(cli(['status'])).events.length;
    document.querySelector('#load-demo').onclick();
    const demoScores = document.querySelector('#card-area').children.find(child => child.className === 'scores');
    demoScores.children[2].onclick();
    document.querySelector('#demo').onclick();
    document.querySelector('#article-scores').onclick({ target: scoreTarget });
    await pause(200);
    assert.equal(JSON.parse(cli(['status'])).events.length, eventCount, 'demo scores remain isolated');
    console.log('Bridge integration passed: authenticated loopback, agent deck and proposal, UI scores, watcher, article feedback, context, demo isolation.');
  } finally {
    if (watcher) watcher.kill();
    if (mcp) mcp.kill();
    spawnSync('python3', ['gym.py', 'stop'], { cwd: root, env, encoding: 'utf8' });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
