const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert/strict');

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('file://' + path.resolve('index.html'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  assert.match(await page.locator('#card-area').innerText(), /Waiting for Dex/);
  await page.locator('#load-demo').click();
  assert.match(await page.locator('#progress').innerText(), /round 1 · 1 \/ 12/);
  assert.equal(await page.getByRole('button', { name: 'Article Lab' }).isVisible(), true);
  for (let score = 1; score <= 4; score++) await page.keyboard.press(String(score));
  assert.match(await page.locator('#progress').innerText(), /5 \/ 12/);
  await page.keyboard.press('s');
  await page.keyboard.press('z');
  await page.reload();
  assert.match(await page.locator('#progress').innerText(), /round 1 · 5 \/ 12/);

  await page.getByRole('button', { name: 'Data & handoff' }).click();
  const round2 = page.locator('#round-list .entry').filter({ hasText: 'Isolated demo · round 2' });
  await round2.getByRole('button', { name: 'Open round' }).click();
  await page.keyboard.press('3');
  const secondRoundCard = await page.locator('.sentence').innerText();
  await page.reload();
  assert.match(await page.locator('#progress').innerText(), /round 2 · 2 \/ 12/);
  assert.equal(await page.locator('.sentence').innerText(), secondRoundCard);

  await page.getByRole('button', { name: 'Data & handoff' }).click();
  const deck = {
    kind: 'writing-gym-deck', version: 1, id: 'test-deck', title: 'Test round', seed: '1',
    cards: [
      { id: 'test-one', sentence: '<img src=x onerror=alert(1)>', context: 'test', pairId: 'x' },
      { id: 'test-two', sentence: 'A second test sentence.', context: 'test', pairId: 'y' }
    ]
  };
  await page.locator('#import-text').fill(JSON.stringify(deck));
  await page.locator('#import').click();
  assert.match(await page.locator('#import-status').innerText(), /imported/);
  await page.locator('#import').click();
  assert.match(await page.locator('#import-status').innerText(), /already exists/);
  await page.locator('#import-text').fill('{');
  await page.locator('#import').click();
  assert.match(await page.locator('#import-status').innerText(), /Invalid JSON/);
  const duplicate = { ...deck, id: 'other', cards: [deck.cards[0], deck.cards[0]] };
  await page.locator('#import-text').fill(JSON.stringify(duplicate));
  await page.locator('#import').click();
  assert.match(await page.locator('#import-status').innerText(), /Duplicate/);
  await page.locator('#import-text').fill(' '.repeat(5000001));
  await page.locator('#import').click();
  assert.match(await page.locator('#import-status').innerText(), /exceeds 5 MB/);

  const imported = page.locator('#round-list .entry').filter({ hasText: 'Test round' });
  await imported.getByRole('button', { name: 'Open round' }).click();
  const importedFirst = await page.locator('.sentence').innerText();
  assert.equal(await page.locator('.sentence img').count(), 0);
  await page.keyboard.press('4');
  const importedSecond = await page.locator('.sentence').innerText();
  assert.notEqual(importedFirst, importedSecond);
  await page.reload();
  assert.match(await page.locator('#progress').innerText(), /Test round · 2 \/ 2/);
  assert.equal(await page.locator('.sentence').innerText(), importedSecond);
  assert.equal(await page.locator('.sentence img').count(), 0);

  await page.getByRole('button', { name: 'Article Lab' }).click();
  await page.locator('#demo').click();
  await page.locator('#candidate').fill('A rejected candidate.');
  await page.locator('#article-scores [data-score="2"]').click();
  await page.locator('#candidate').fill('A first sentence.');
  await page.locator('#candidate').press('1');
  assert.match(await page.locator('#candidate').inputValue(), /1$/);
  await page.locator('#candidate').fill('A first sentence.');
  await page.locator('#section-name').fill('Opening');
  await page.locator('#article-scores [data-score="3"]').click();
  assert.equal(await page.locator('#manuscript').innerText(), 'No accepted lines yet.');
  await page.locator('#accept').click();
  await page.locator('#candidate').fill('A middle sentence.');
  await page.locator('#section-name').fill('Middle');
  await page.locator('#article-scores [data-score="4"]').click();
  await page.locator('#accept').click();
  await page.locator('#candidate').fill('A return to the opening.');
  await page.locator('#section-name').fill('Opening');
  await page.locator('#article-scores [data-score="3"]').click();
  await page.locator('#accept').click();
  const stitched = await page.locator('#manuscript .entry p').allTextContents();
  assert.deepEqual(stitched, ['A first sentence.', 'A middle sentence.', 'A return to the opening.']);
  await page.locator('#whole-read').click();
  assert.equal(await page.locator('#whole').innerText(),
    'A first sentence. A middle sentence. A return to the opening.');

  await page.getByRole('button', { name: 'Data & handoff' }).click();
  await page.locator('#preview-agent').click();
  const handoff = JSON.parse(await page.locator('#export-preview').inputValue());
  assert.deepEqual(handoff.article.attempts[0],
    { sentence: 'A rejected candidate.', score: 2, section: 'Opening' });
  await page.locator('#preview-backup').click();
  const backup = JSON.parse(await page.locator('#export-preview').inputValue());
  for (const selection of [undefined, 'missing-round', 'test-deck']) {
    backup.state.selectedRound = selection;
    await page.locator('#import-text').fill(JSON.stringify(backup));
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#import').click();
    assert.match(await page.locator('#import-status').innerText(), /restored/);
    await page.getByRole('button', { name: 'Calibration' }).click();
    assert.match(await page.locator('#progress').innerText(),
      selection === 'test-deck' ? /Test round/ : /round 1/);
    await page.reload();
    assert.match(await page.locator('#progress').innerText(),
      selection === 'test-deck' ? /Test round/ : /round 1/);
    await page.getByRole('button', { name: 'Data & handoff' }).click();
  }
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#reset').click();
  assert.match(await page.locator('#round-list').innerText(), /Test round/);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('button', { name: 'Calibration' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log('Browser checks passed: scoring, resume, imports, backups, article handoff and stitched order.');
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
