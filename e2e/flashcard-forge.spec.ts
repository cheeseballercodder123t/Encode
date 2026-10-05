import { test, expect, type Page } from '@playwright/test';
import {
  FORGE_CONDENSE_RESPONSE,
  FORGE_CONFLICT_RESPONSE,
  FORGE_MEDIA_RESPONSE,
  FORGE_MORE_RESPONSE,
  FORGE_RESPONSE,
  FORGE_RETRY_RESPONSE,
} from './helpers/fixtures';
import { forgePayloadForRequest, mockAiApis } from './helpers/mocks';

/**
 * Flashcards Only: the path for when you do not want a workout.
 *
 * Every other entry point teaches first. This one takes many sources (notes,
 * PDFs, YouTube lectures, a lecture recording), merges them into one deduped
 * deck, and hands that deck to the export surface the learner picked — with no
 * stages, no paradoxes and no examiner anywhere in the loop.
 *
 * The four things a REPEAT ingest needs are covered here too: a video with no
 * captions is transcribed instead of dropped, two sources that disagree become
 * one explicit conflict card, cards the topic already exported (or already in
 * Anki) are counted as such, and the whole setup can be saved and re-run as a
 * recipe.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * AnkiConnect, mocked at its real address. `offline` is the default here so a
 * forge test never depends on whatever the machine running it has listening on
 * 127.0.0.1:8765; a test that wants a real deck registers this again with
 * `frontTexts` and its route wins.
 */
async function mockAnkiConnect(page: Page, opts: { frontTexts?: string[]; offline?: boolean } = {}) {
  await page.route(
    (url) => url.hostname === '127.0.0.1' && url.port === '8765',
    async (route) => {
      if (opts.offline) {
        await route.abort('connectionrefused');
        return;
      }
      if (route.request().method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: CORS_HEADERS });
        return;
      }
      const body = route.request().postDataJSON();
      const fronts = opts.frontTexts || [];
      const result = (() => {
        switch (body.action) {
          case 'deckNames':
            return ['Default', 'DeepEncode::Renal Physiology'];
          case 'findNotes':
            return fronts.map((_, i) => 100 + i);
          case 'notesInfo':
            return (body.params.notes as number[]).map((noteId, i) => ({
              noteId,
              modelName: 'Basic',
              tags: [],
              cards: [noteId],
              fields: {
                Front: { value: fronts[i] ?? '', order: 0 },
                Back: { value: 'forgotten', order: 1 },
              },
            }));
          default:
            return null;
        }
      })();
      await route.fulfill({
        status: 200,
        headers: CORS_HEADERS,
        contentType: 'application/json',
        body: JSON.stringify({ result, error: null }),
      });
    }
  );
}

async function mockForge(page: Page, payload: any = FORGE_RESPONSE) {
  await mockAiApis(page);
  await page.route('**/api/forge', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(forgePayloadForRequest(payload, route.request())),
    })
  );
  await mockAnkiConnect(page, { offline: true });
}

/**
 * The same route answering per `mode`, so one test can forge a deck, ask it for
 * more cards, and then condense it, without re-registering routes.
 */
async function mockForgeModes(page: Page) {
  await mockAiApis(page);
  await page.route('**/api/forge', (route) => {
    const body = route.request().postDataJSON() as { mode?: string } | null;
    const payload =
      body?.mode === 'more'
        ? FORGE_MORE_RESPONSE
        : body?.mode === 'condense'
          ? FORGE_CONDENSE_RESPONSE
          : body?.mode === 'retry'
            ? FORGE_RETRY_RESPONSE
            : FORGE_RESPONSE;
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(forgePayloadForRequest(payload, route.request())),
    });
  });
  await mockAnkiConnect(page, { offline: true });
}

/** Launchpad -> Forge, ready for sources to be added. */
async function openForge(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: /flashcards only/i }).click();
  await expect(page.getByText('Flashcard Forge · no encoding')).toBeVisible();
}

async function addTextSource(page: Page, text: string) {
  await page.getByPlaceholder(/Paste a topic's notes/).fill(text);
  await page.getByRole('button', { name: /add text source/i }).click();
}

/** Launchpad -> Forge -> two sources (notes + a lecture) -> deck forged. */
async function forgeDeck(page: Page) {
  await openForge(page);
  await addTextSource(page, 'Loop of Henle countercurrent multiplication.');

  await page.getByPlaceholder('https://www.youtube.com/watch?v=…').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: /add videos/i }).click();

  await expect(page.getByText('Sources (2/12)')).toBeVisible();
  await page.getByTestId('forge-run').click();
  await expect(page.getByTestId('forge-result')).toBeVisible();
}

test.describe('Flashcards Only (the Forge)', () => {
  test('a video without captions is transcribed instead of dropped', async ({ page }) => {
    await mockForge(page, FORGE_MEDIA_RESPONSE);
    await openForge(page);

    // A lecture recording is a source like any other: the server transcribes
    // it, which is the half of the feature that always works.
    await page.getByLabel('Add source files').setInputFiles({
      name: 'lecture-recording.m4a',
      mimeType: 'audio/mp4',
      buffer: Buffer.from('not really audio, but the route is mocked'),
    });
    await expect(page.getByText('[ AUDIO ]')).toBeVisible();
    await expect(page.getByText('transcribed', { exact: true })).toBeVisible();

    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    // The log names the provenance instead of leaving you to guess.
    await expect(page.getByText('[ OK ] lecture-recording.m4a')).toBeVisible();
    await expect(page.getByText('transcribed from the uploaded recording')).toBeVisible();
  });

  test('sources that disagree ship one conflict card instead of quietly picking one', async ({ page }) => {
    await mockForge(page, FORGE_CONFLICT_RESPONSE);
    await openForge(page);
    await addTextSource(page, 'The half-life of the drug is 4 h.');
    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    // Both claims are quoted with the source that made them.
    const conflicts = page.getByTestId('forge-conflicts');
    await expect(conflicts).toBeVisible();
    await expect(conflicts).toContainText('1 source conflict');
    await expect(conflicts).toContainText('different quantity · 4 h vs 6 h');
    await expect(conflicts).toContainText('The half-life of the drug is 4 h. — Lecture 4 slides');
    await expect(conflicts).toContainText('The half-life of the drug is 6 h. — handout.pdf');

    // The deck carries ONE card, and it is the conflict.
    await expect(page.getByText('1 facts · 0 mechanisms · 0 drills · 0 examples')).toBeVisible();
    await expect(page.getByText('1 claim merged into a conflict card').first()).toBeVisible();
  });

  test('a re-forge says what is already in the deck and can ship only the new cards', async ({ page }) => {
    await mockForge(page);
    await forgeDeck(page);

    // Exporting is what makes the deck "yours": it is remembered from here on.
    await page.getByTestId('forge-export-primary').click();
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
    await page.getByRole('button', { name: /close export modal/i }).click();

    // Next Monday: same sources, same deck, nothing new in it.
    await openForge(page);
    await addTextSource(page, 'Loop of Henle countercurrent multiplication.');
    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    const memory = page.getByTestId('forge-memory');
    await expect(memory).toContainText('0 new · 5 already in your deck');
    await expect(page.getByTestId('forge-skip-known')).toContainText('SHIPPING NEW CARDS ONLY');
    // Nothing new to ship: the export is held until the learner says otherwise.
    await expect(page.getByTestId('forge-export-primary')).toBeDisabled();

    await page.getByTestId('forge-skip-known').click();
    await expect(page.getByTestId('forge-skip-known')).toContainText('SHIPPING THE WHOLE DECK');
    await expect(page.getByTestId('forge-export-primary')).toBeEnabled();
  });

  test('a deck that already exists in Anki is read back and counted as already yours', async ({ page }) => {
    // A deck built by hand in Anki: this app has never exported this topic, so
    // only reading the real collection can know the card is already there.
    await mockForge(page);
    await mockAnkiConnect(page, { frontTexts: ['Which limb pumps salt out?'] });
    await openForge(page);
    await addTextSource(page, 'Loop of Henle countercurrent multiplication.');
    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    const memory = page.getByTestId('forge-memory');
    await expect(memory).toContainText('4 new · 1 already in your deck');
    await expect(page.getByTestId('forge-memory-anki')).toContainText(
      'Checked your Anki deck: 1 note in 1 deck.'
    );
    await expect(page.getByTestId('forge-skip-known')).toContainText('SHIPPING NEW CARDS ONLY');
  });

  test('with Anki closed the memory says so and stays this app\'s own', async ({ page }) => {
    await mockForge(page);
    await openForge(page);
    await addTextSource(page, 'Loop of Henle countercurrent multiplication.');
    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    await expect(page.getByTestId('forge-memory-anki')).toContainText('AnkiConnect is unreachable');
    await expect(page.getByTestId('forge-memory')).toContainText('5 new · 0 already in your deck');
    // Nothing is known, so there is nothing to hold back and nothing to toggle.
    await expect(page.getByTestId('forge-skip-known')).toHaveCount(0);
    await expect(page.getByTestId('forge-export-primary')).toBeEnabled();
  });

  test('a saved recipe re-runs the whole setup, and survives a reload', async ({ page }) => {
    await mockForge(page);
    await openForge(page);
    await addTextSource(page, 'Loop of Henle countercurrent multiplication.');
    await page.getByRole('button', { name: /^\[ REMNOTE \]/ }).click();

    await page.getByTestId('forge-recipes-toggle').click();
    await page.getByLabel('Recipe name').fill('Monday lectures');
    await page.getByTestId('forge-save-recipe').click();
    await expect(page.getByTestId('forge-recipes')).toContainText('Saved "Monday lectures"');
    await expect(page.getByTestId('forge-recipe-recipe-monday-lectures')).toContainText('REMNOTE');

    // Throw the setup away, then run the recipe: sources, sections and target
    // all come back, and it forges immediately.
    await page.getByRole('button', { name: /Remove source Loop of Henle/ }).click();
    await expect(page.getByText('Sources (0/12)')).toBeVisible();
    await page.getByTestId('forge-run-recipe-recipe-monday-lectures').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();
    await expect(page.getByTestId('forge-export-primary')).toContainText('EXPORT TO REMNOTE');

    // And it is still there after a reload.
    await page.reload();
    await openForge(page);
    await page.getByTestId('forge-recipes-toggle').click();
    await expect(page.getByTestId('forge-recipe-recipe-monday-lectures')).toContainText('Monday lectures');
  });

  test('skips encoding entirely: many sources in, one deduped deck out', async ({ page }) => {
    await mockForge(page);
    await forgeDeck(page);

    // Every source is accounted for, including what the merge dropped.
    await expect(page.getByText(/5 cards forged · 4 duplicates dropped/)).toBeVisible();
    await expect(page.getByText('2 facts · 1 mechanisms · 1 drills · 1 examples')).toBeVisible();
    await expect(page.getByText('Lecture 4 slides')).toBeVisible();
    await expect(page.getByText('youtube:renal')).toBeVisible();

    // No encoding happened anywhere: the session never left the input view, so
    // there is no stage counter and the launchpad is still the screen behind.
    await expect(page.getByText('01/02')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /build cognitive schema/i })).toBeVisible();
  });

  test('a source with no captions is reported instead of inventing cards', async ({ page }) => {
    await mockForge(page);
    await openForge(page);
    await addTextSource(page, 'Anything at all.');
    await addTextSource(page, 'A second passage that still has no video captions.');
    await expect(page.getByText('Sources (2/12)')).toBeVisible();
    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    // The fixture's YouTube source failed: the deck still ships, and the log
    // says exactly why that one source contributed nothing.
    await expect(page.getByText('[ ! ] youtube:renal')).toBeVisible();
  });

  test('a deck that came back too small can grow, and one that came back too long can condense', async ({ page }) => {
    await mockForgeModes(page);
    await forgeDeck(page);

    await expect(page.getByText(/5 cards forged · 4 duplicates dropped/)).toBeVisible();
    await expect(page.getByText('2 facts · 1 mechanisms · 1 drills · 1 examples')).toBeVisible();

    // Too few cards: the same sources run again, and only the new cards land.
    await page.getByTestId('forge-more').click();
    await expect(page.getByTestId('forge-deck-note')).toContainText('+2 more cards');
    await expect(page.getByText('3 facts · 1 mechanisms · 2 drills · 1 examples')).toBeVisible();

    // Too many cards: overlapping cards fold into fewer, denser ones.
    await page.getByTestId('forge-condense').click();
    await expect(page.getByTestId('forge-deck-note')).toContainText('Condensed 7 → 3 cards');
    await expect(page.getByText('1 facts · 1 mechanisms · 1 drills · 0 examples')).toBeVisible();

    // What exports is the reshaped deck, not the one the forge first returned.
    await page.getByTestId('forge-export-primary').click();
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
    await expect(page.getByText('1,200 mOsm').first()).toBeVisible();
  });

  test('the chosen export target opens with the forged deck', async ({ page }) => {
    await mockForge(page);
    await forgeDeck(page);

    // Default target is Anki, so the primary action is the Anki export.
    await expect(page.getByTestId('forge-export-primary')).toContainText('EXPORT TO ANKI');
    await page.getByTestId('forge-export-primary').click();
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
    // Deck name and cards come from the merged report, not from a schema.
    await expect(page.locator('input[type="text"]').first()).toHaveValue('DeepEncode::Renal_Physiology');
    await expect(page.getByText('1,200 mOsm').first()).toBeVisible();
  });

  test('the RemNote target splits the deck into one copyable document per section', async ({ page }) => {
    await mockForge(page);
    await forgeDeck(page);

    // The secondary surface is always one click away too.
    await page.getByTestId('forge-open-remnote').click();
    await expect(page.getByText('RemNote Hierarchical & Feynman Engine')).toBeVisible();
    await expect(page.getByText('Deconstruction: Renal Physiology')).toBeVisible();

    await page.getByRole('button', { name: /RemNote Markdown/i }).click();

    // One document per card section, each named after the topic it came from,
    // instead of one blob the learner has to carve up by hand.
    await expect(page.getByTestId('remnote-doc-facts')).toContainText('Renal Physiology — Declarative Facts');
    await expect(page.getByTestId('remnote-doc-mechanisms')).toContainText('Renal Physiology — Mechanisms');
    await expect(page.getByTestId('remnote-doc-drills')).toContainText('Renal Physiology — Practice Drills');
    await expect(page.getByTestId('remnote-doc-examples')).toContainText('Renal Physiology — Worked Examples');

    // The cloze fact survives as a RemNote cloze card (its deletion intact),
    // with the memory hook attached as a hint on the deletion it explains
    // instead of as a second card whose only content is the mnemonic.
    await expect(page.getByTestId('remnote-doc-facts').locator('textarea')).toContainText(
      'The loop of Henle reaches {{1,200 mOsm}}{({Hairpin = highest.})} at the hairpin.'
    );

    // A concept name keeps its reverse card: "given this definition, name the
    // concept" is a real retrieval...
    const mechanisms = page.getByTestId('remnote-doc-mechanisms').locator('textarea');
    await expect(mechanisms).toContainText('Countercurrent multiplication ::');
    // ...and the quadrants under it ride along as Extra Card Detail, which the
    // card back shows and RemNote never turns into a card of its own. As cards
    // they were five per concept, each asking for a tag back.
    await expect(mechanisms).toContainText('Why it matters: ');
    await expect(mechanisms).toContainText('#[[Extra Card Detail]]');
    await expect(mechanisms).not.toContainText('Why it matters >>');
    await expect(mechanisms).not.toContainText('Why it matters ::');

    await expect(page.getByTestId('remnote-direction-summary')).toContainText('1 two-way');

    // What RemNote will actually ASK, per card, with the direction it asks it
    // in — and which fronts can only ever be asked one way.
    await expect(page.getByTestId('remnote-card-list')).toContainText('Countercurrent multiplication');
    await expect(page.getByTestId('remnote-front-quality')).toContainText('cards have a labelled or question front');
    await expect(page.getByTestId('remnote-front-quality')).toContainText('one way');

    // The per-card control: the deck-wide toggle cannot express one line you DO
    // want reversed, and this is where that exception is made.
    await page.getByTestId('remnote-direction-mechanisms-0-one').click();
    await expect(mechanisms).toContainText('Countercurrent multiplication >>');
    await expect(page.getByTestId('remnote-direction-summary')).toContainText('0 two-way');
    // Clicking the same direction again restores the renderer's own decision.
    await page.getByTestId('remnote-direction-mechanisms-0-one').click();
    await expect(mechanisms).toContainText('Countercurrent multiplication ::');

    // Explanations as cards again, for anyone who wants the old shape.
    await page.getByTestId('remnote-explanations-detail').uncheck();
    await expect(mechanisms).toContainText('Why it matters >>');
    await expect(mechanisms).not.toContainText('#[[Extra Card Detail]]');
    await page.getByTestId('remnote-explanations-detail').check();
    await expect(mechanisms).toContainText('#[[Extra Card Detail]]');

    // One click copies one document — the whole point of the split.
    await page.getByTestId('remnote-copy-facts').click();
    await expect(page.getByTestId('remnote-copy-facts')).toContainText('Copied');

    // The toggle is the escape hatch: turn every card forward-only.
    await page.getByTestId('remnote-two-way').uncheck();
    await expect(page.getByTestId('remnote-direction-summary')).toContainText('0 two-way');
    await expect(mechanisms).toContainText('Countercurrent multiplication >>');
  });

  test('a source that was already forged can be skipped before it costs a call', async ({ page }) => {
    await mockForge(page);
    await openForge(page);
    await addTextSource(page, 'Loop of Henle countercurrent multiplication.');
    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    // Next Monday: the same lecture ingests again. The forge remembers which
    // sources built a deck, so the setup says so BEFORE the model call is spent
    // instead of re-cutting it and diffing the repeats back out afterwards.
    await page.getByRole('button', { name: /close forge/i }).click();
    await page.getByRole('button', { name: /flashcards only/i }).click();

    await expect(page.getByTestId('forge-known-sources')).toBeVisible();
    await expect(page.getByTestId('forge-known-sources')).toContainText('1 of 1 source already cut into a deck');
    // The row says where it landed, so "skip" is an informed click.
    const forged = page.getByTitle(/Already forged into "Renal Physiology"/);
    await expect(forged).toBeVisible();
    await expect(forged).toContainText('FORGED');

    // Nothing is skipped silently: the offer is one click, and it is counted.
    await expect(page.getByTestId('forge-run')).toContainText('FORGE 1 SOURCE');
    await page.getByTestId('forge-skip-forged').click();
    await expect(page.getByTestId('forge-known-sources')).toContainText('1 skipped, 0 will run');
    await expect(page.getByTitle('Include this source in the next pass')).toContainText('[ USE ]');
    // Nothing left to pay for, so there is nothing to run — and the pre-flight
    // says so in calls rather than sources.
    await expect(page.getByTestId('forge-run')).toBeDisabled();
    await expect(page.getByText(/0 sources · ~0 model calls · 1 skipped/)).toBeVisible();

    // And it is reversible: a source you DO want re-cut is one click away.
    await page.getByTestId('forge-skip-forged').click();
    await expect(page.getByTestId('forge-run')).toBeEnabled();
    await expect(page.getByTestId('forge-run')).toContainText('FORGE 1 SOURCE');
  });

  test('target BOTH stacks RemNote behind Anki instead of opening two modals', async ({ page }) => {
    await mockForge(page);
    await openForge(page);

    // The target is chosen before forging; the result panel then offers both
    // surfaces regardless.
    await addTextSource(page, 'Loop of Henle countercurrent multiplication.');
    await page.getByRole('button', { name: 'BOTH' }).click();
    await page.getByTestId('forge-run').click();
    await expect(page.getByTestId('forge-result')).toBeVisible();

    await expect(page.getByTestId('forge-export-primary')).toContainText('ANKI, THEN REMNOTE');
    await page.getByTestId('forge-export-primary').click();
    await expect(page.getByText('Anki & SM-2 Spaced Repetition Exporter')).toBeVisible();
    // RemNote is queued, not stacked on top of the Anki modal.
    await expect(page.getByText('RemNote Hierarchical & Feynman Engine')).toHaveCount(0);

    await page.getByRole('button', { name: /close export modal/i }).click();
    await expect(page.getByText('RemNote Hierarchical & Feynman Engine')).toBeVisible();
  });

  test('the deck summary reports the post-Wozniak count instead of the raw batch', async ({ page }) => {
    await mockForge(page);
    await forgeDeck(page);

    // The modal claims cards go through the Wozniak pass; the pass runs at
    // export, so the number it actually produces is shown next to the deck.
    const wozniak = page.getByTestId('forge-wozniak');
    await expect(wozniak).toBeVisible();
    await expect(wozniak).toContainText('Wozniak pass:');
    await expect(wozniak).toContainText('after sanitizing');
  });

  test('a section that came back empty is named, and generate-more is aimed at it', async ({ page }) => {
    await mockForge(page, {
      ...FORGE_RESPONSE,
      coverage: {
        sections: [
          { section: 'facts', requested: true, cards: 2 },
          { section: 'mechanisms', requested: true, cards: 1 },
          { section: 'drills', requested: true, cards: 1 },
          { section: 'examples', requested: true, cards: 0 },
        ],
        gaps: ['examples'],
        note: '0 cards for examples — "generate more" will target that gap.',
        silentSources: ['youtube:renal'],
        gapOwners: [
          {
            section: 'examples',
            silentIn: ['Slides', 'youtube:renal'],
            note: 'no source produced examples (Slides, youtube:renal) — ask again only if the material really contains it',
          },
        ],
      },
    });
    await forgeDeck(page);

    const coverage = page.getByTestId('forge-coverage');
    await expect(coverage).toBeVisible();
    await expect(coverage).toContainText('[ ! ] 0 cards for examples');
    // "0 cards for examples" is a fact about the deck; naming the sources that
    // came back without any is the part you can act on.
    await expect(page.getByTestId('forge-gap-owners')).toContainText('no source produced examples (Slides, youtube:renal)');

    // The next "more" batch asks only for the missing section, rather than
    // re-earning the sections that already arrived.
    const requested: string[] = [];
    await page.route('**/api/forge', (route) => {
      const body = route.request().postDataJSON() as { include?: string[] } | null;
      requested.push(...(body?.include || []));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...FORGE_MORE_RESPONSE, coverage: undefined }),
      });
    });
    await page.getByTestId('forge-more').click();
    await expect(page.getByTestId('forge-deck-note')).toContainText('+2 more cards');
    expect(requested).toEqual(['examples']);
  });

  test('one failed source can be re-forged on its own', async ({ page }) => {
    await mockForgeModes(page);
    await forgeDeck(page);

    // The YouTube source failed; re-running everything would re-pay for the
    // sources that already worked, so the row offers a targeted retry.
    await expect(page.getByText('[ ! ] youtube:renal')).toBeVisible();
    await page.getByTestId('forge-retry-src_4').click();

    await expect(page.getByTestId('forge-deck-note')).toContainText('Retried');
    await expect(page.getByTestId('forge-deck-note')).toContainText('+2 cards');
    // The row is no longer a failure: it says what it finally contributed.
    await expect(page.getByText('[ OK ] youtube:renal')).toBeVisible();
    await expect(page.getByText('transcribed from the audio')).toBeVisible();
  });

  test('growing the deck keeps going on its own until the target, then stops', async ({ page }) => {
    await mockForgeModes(page);
    await forgeDeck(page);

    // One batch is a guess at how much is missing. The loop keeps asking until
    // the deck is the size you named — and stops after two empty batches,
    // because at that point the sources genuinely have nothing left.
    await page.getByTestId('forge-target').fill('100');
    await page.getByTestId('forge-grow-loop').click();

    await expect(page.getByTestId('forge-loop-note')).toContainText('exhausted at 7 cards (+2)', {
      timeout: 20_000,
    });
    await expect(page.getByText('3 facts · 1 mechanisms · 2 drills · 1 examples')).toBeVisible();
  });

  test('a reshape of the deck can be undone in one step', async ({ page }) => {
    await mockForgeModes(page);
    await forgeDeck(page);

    await page.getByTestId('forge-condense').click();
    await expect(page.getByTestId('forge-deck-note')).toContainText('Condensed 5 → 3 cards');
    await expect(page.getByText('1 facts · 1 mechanisms · 1 drills · 0 examples')).toBeVisible();

    // Folding a deck you disagree with must not cost a re-forge.
    await page.getByTestId('forge-undo').click();
    await expect(page.getByTestId('forge-deck-note')).toContainText('Undone — the deck is back to 5 cards');
    await expect(page.getByText('2 facts · 1 mechanisms · 1 drills · 1 examples')).toBeVisible();
  });
});

/**
 * The forge sheet is mounted on the first paint and only hides itself while
 * `isOpen` is false, so EVERY hook it owns has to run on every render. A hook
 * that sat below its early `return null` made the component render one more
 * hook the instant it opened: React #310, "Rendered more hooks than during the
 * previous render", thrown the moment "Flashcards only" was pressed — the
 * sheet never appeared at all.
 *
 * Nothing else in this file can catch that, because a render that throws is
 * invisible to assertions that only look for text; and a single open passes,
 * since the mismatch only exists on the render that changes the branch. So this
 * spec opens, closes and reopens the sheet with a page-error listener attached.
 */
test('opening and reopening the forge never changes its hook count', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await mockForge(page);
  await openForge(page);

  const opener = page.getByRole('button', { name: /flashcards only/i });

  await page.getByRole('button', { name: /close forge/i }).click();
  await expect(page.getByText('Flashcard Forge · no encoding')).toBeHidden();

  await opener.click();
  await expect(page.getByText('Flashcard Forge · no encoding')).toBeVisible();

  expect(errors).toEqual([]);
});
