const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { JSDOM } = require('jsdom');
const html = readFileSync(resolve('public/index.html'), 'utf8');
const script = readFileSync(resolve('public/scripts.js'), 'utf8');

function game(t, { saved, blocked = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const w = dom.window;
  let now = 0;
  let nextId = 1;
  const timeouts = new Map();
  const intervals = new Map();
  w.setTimeout = (fn) => { const id = nextId++; timeouts.set(id, fn); return id; };
  w.clearTimeout = (id) => timeouts.delete(id);
  w.setInterval = (fn) => { const id = nextId++; intervals.set(id, fn); return id; };
  w.clearInterval = (id) => intervals.delete(id);
  Object.defineProperty(w.performance, 'now', { value: () => now });
  if (saved !== undefined) w.localStorage.setItem('memory-game.best.v1', saved);
  if (blocked) Object.defineProperty(w, 'localStorage', { get() { throw new Error('Unavailable'); } });
  w.Math.random = () => 0.2;
  w.eval(script);
  const d = w.document;
  const cards = [...d.querySelectorAll('.memory-card')];
  return {
    w, d, cards, intervals, timeouts,
    text: (selector) => d.querySelector(selector).textContent,
    tick(seconds) { now += seconds * 1000; [...intervals.values()].forEach((fn) => fn()); },
    flush() { const queue = [...timeouts.values()]; timeouts.clear(); queue.forEach((fn) => fn()); },
    restart() { d.querySelector('#restart').click(); },
    solve() {
      for (const framework of new Set(cards.map((c) => c.dataset.framework))) {
        cards.filter((c) => c.dataset.framework === framework).forEach((c) => c.click());
      }
    }
  };
}

test('deck contains six complete pairs, accessible buttons and deployable local assets', (t) => {
  const g = game(t);
  assert.equal(g.cards.length, 12);
  for (const framework of new Set(g.cards.map((c) => c.dataset.framework))) {
    assert.equal(g.cards.filter((c) => c.dataset.framework === framework).length, 2);
  }
  g.cards.forEach((c, index) => {
    assert.equal(c.tagName, 'BUTTON');
    assert.equal(c.getAttribute('aria-label'), `Card ${index + 1}, face down`);
    assert.equal(c.getAttribute('aria-pressed'), 'false');
  });
  for (const node of g.d.querySelectorAll('[src], link[href]')) {
    const path = node.getAttribute('src') || node.getAttribute('href');
    if (!path.startsWith('http')) assert.ok(existsSync(resolve('public', path)), path);
  }
  assert.equal(g.intervals.size, 0);
  assert.equal(g.text('#moves'), '0');
  assert.equal(g.text('#pairs'), '0 / 6');
});

test('duplicate clicks and third clicks cannot corrupt a pending mismatch', (t) => {
  const g = game(t);
  const [a] = g.cards;
  const b = g.cards.find((c) => c.dataset.framework !== a.dataset.framework);
  const third = g.cards.find((c) => c !== a && c !== b);
  a.click(); a.click();
  assert.equal(g.text('#moves'), '0');
  g.tick(65);
  assert.equal(g.text('#time'), '1:05');
  b.click(); third.click();
  assert.equal(g.text('#moves'), '1');
  assert.equal(third.classList.contains('flip'), false);
  g.flush();
  assert.equal(a.classList.contains('flip'), false);
  assert.equal(b.classList.contains('flip'), false);
  third.click();
  assert.equal(third.classList.contains('flip'), true);
});

test('restart cancels an outstanding mismatch and timer without hiding a new choice', (t) => {
  const g = game(t);
  g.cards[0].click();
  g.cards.find((c) => c.dataset.framework !== g.cards[0].dataset.framework).click();
  assert.equal(g.timeouts.size, 1);
  g.restart();
  assert.equal(g.timeouts.size, 0);
  assert.equal(g.intervals.size, 0);
  assert.equal(g.text('#moves'), '0');
  assert.equal(g.text('#time'), '0:00');
  assert.equal(g.cards.filter((c) => c.classList.contains('flip')).length, 0);
  g.cards[0].click();
  g.flush();
  assert.equal(g.cards[0].classList.contains('flip'), true);
  assert.equal(g.intervals.size, 1);
});

test('completion stops the clock, records a best and ignores already matched cards', (t) => {
  const g = game(t);
  g.cards[0].click();
  g.tick(12);
  g.solve();
  assert.equal(g.text('#pairs'), '6 / 6');
  assert.equal(g.text('#moves'), '6');
  assert.equal(g.intervals.size, 0);
  assert.match(g.text('#status'), /All six pairs found/);
  assert.deepEqual(JSON.parse(g.w.localStorage.getItem('memory-game.best.v1')), { moves: 6, seconds: 12 });
  g.cards.forEach((c) => c.click());
  g.tick(20);
  assert.equal(g.text('#moves'), '6');
  assert.equal(g.text('#time'), '0:12');
  g.restart();
  assert.match(g.text('#best'), /6 moves/);
  g.solve();
  assert.equal(g.text('#pairs'), '6 / 6');
});

test('best score survives reloads and resolves ties by elapsed time', (t) => {
  const g = game(t, { saved: '{"moves":6,"seconds":20}' });
  assert.equal(g.text('#best'), '6 moves · 0:20');
  g.cards[0].click();g.tick(30);g.solve();
  assert.equal(g.text('#best'), '6 moves · 0:20');
  g.restart();g.cards[0].click();g.tick(10);g.solve();
  assert.equal(g.text('#best'), '6 moves · 0:10');
});

test('invalid saved scores are ignored', (t) => {
  for (const saved of ['broken', 'null', '{"moves":0,"seconds":-1}', '{"moves":"6","seconds":2}']) {
    const g = game(t, { saved });
    assert.equal(g.text('#best'), 'No completed game yet');
    g.solve();
    assert.equal(g.text('#pairs'), '6 / 6');
  }
});

test('blocked browser storage does not prevent starting or completing a game', (t) => {
  const g = game(t, { blocked: true });
  g.solve();
  assert.equal(g.text('#pairs'), '6 / 6');
  assert.match(g.text('#best'), /6 moves/);
});
