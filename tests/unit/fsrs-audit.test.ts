import { describe, it, expect } from 'vitest';
import {
  stripHtml,
  countWords,
  isAmbiguousCloze,
  auditAnkiCard,
  auditDeck,
  isLeechDense,
  splitDenseCloze,
  classifyCardQuality,
  classifyDeckQuality,
  TOO_LONG_WORD_LIMIT,
} from '@/lib/fsrs-audit';
import { AnkiCardItem, sanitizeExtracted } from '@/lib/anki-exporter';

function clozeCard(front: string, id = 'c1'): AnkiCardItem {
  return {
    id,
    front,
    back: 'back',
    isCloze: true,
    tags: ['DeepEncode'],
    sm2: { repetitions: 0, interval: 1, easeFactor: 2.5, nextReviewTimestamp: 0 },
  };
}

describe('stripHtml', () => {
  it('removes tags and converts <br> to spaces', () => {
    expect(stripHtml('Hello<br>world<b>!</b>')).toBe('Hello world !');
  });
  it('decodes common entities', () => {
    expect(stripHtml('a &amp; b &lt; c')).toBe('a & b < c');
  });
});

describe('countWords', () => {
  it('counts words ignoring HTML', () => {
    expect(countWords('<b>Hello</b> world')).toBe(2);
  });
  it('counts cloze inner text as words, not markers', () => {
    expect(countWords('{{c1::HCl}} is strong')).toBe(3);
  });
  it('returns 0 for empty strings', () => {
    expect(countWords('   ')).toBe(0);
  });
});

describe('isAmbiguousCloze', () => {
  it('flags "or" inside a deletion', () => {
    expect(isAmbiguousCloze('The ion is {{c1::Na+ or K+}}.')).toBe(true);
  });
  it('flags pipe and slash separators', () => {
    expect(isAmbiguousCloze('{{c1::A|B}}')).toBe(true);
    expect(isAmbiguousCloze('{{c1::A/B}}')).toBe(true);
  });
  it('flags comma-separated candidates', () => {
    expect(isAmbiguousCloze('{{c1::A, B, or C}}')).toBe(true);
  });
  it('flags two deletions sharing the same index', () => {
    expect(isAmbiguousCloze('{{c1::X}} and {{c1::Y}}')).toBe(true);
  });
  it('accepts a clean single deletion', () => {
    expect(isAmbiguousCloze('The formula is {{c1::HCl}}.')).toBe(false);
  });
  it('flags same-index reuse across deletions', () => {
    expect(isAmbiguousCloze('{{c1::X}} reacts with {{c1::Y}}')).toBe(true);
  });
  it('accepts distinct indices', () => {
    expect(isAmbiguousCloze('{{c1::X}} reacts with {{c2::Y}}')).toBe(false);
  });
  it('does not flag a lone comma inside a number or phrase', () => {
    expect(isAmbiguousCloze('The volume is {{c1::2,500 mL}}.')).toBe(false);
  });
});

describe('auditAnkiCard', () => {
  it('flags a too-long cloze', () => {
    const longFront =
      'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane';
    const card = clozeCard(longFront);
    const issues = auditAnkiCard(card);
    expect(issues.some((i) => i.kind === 'too_long')).toBe(true);
  });
  it('flags an ambiguous cloze', () => {
    const card = clozeCard('The ion is {{c1::Na+ or K+}}.');
    const issues = auditAnkiCard(card);
    expect(issues.some((i) => i.kind === 'ambiguous')).toBe(true);
  });
  it('passes a short clean cloze', () => {
    const card = clozeCard('The formula is {{c1::HCl}}.');
    expect(auditAnkiCard(card)).toEqual([]);
  });
  it('does not flag length on basic (non-cloze) cards', () => {
    const card: AnkiCardItem = {
      ...clozeCard(''),
      isCloze: false,
      front: 'A very long question with many words that exceeds the limit significantly',
    };
    expect(auditAnkiCard(card).some((i) => i.kind === 'too_long')).toBe(false);
  });
});

describe('auditDeck', () => {
  it('returns only flagged cards, worst first', () => {
    const cards = [
      clozeCard('The formula is {{c1::HCl}}.'),
      clozeCard('The ion is {{c1::Na+ or K+}}.'),
      clozeCard(
        'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane'
      ),
    ];
    const result = auditDeck(cards);
    expect(result).toHaveLength(2);
    // Ambiguous has severity 1000 → sorts first.
    expect(result[0].issues.some((i) => i.kind === 'ambiguous')).toBe(true);
  });
});

describe('classifyCardQuality / classifyDeckQuality', () => {
  it('flags a dense cloze as leech candidate', () => {
    const dense = clozeCard(
      'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane'
    );
    expect(classifyCardQuality(dense).isLeechCandidate).toBe(true);
  });

  it('flags Unfinished by tag (skipped stages export this way)', () => {
    const skipped = clozeCard('Prompt', 'skip-1');
    skipped.tags.push('Unfinished');
    expect(classifyCardQuality(skipped).isUnfinished).toBe(true);
  });

  it('clean short cloze is FSRS-ready', () => {
    const clean = clozeCard('The formula is {{c1::HCl}}.');
    expect(classifyCardQuality(clean)).toMatchObject({
      isLeechCandidate: false,
      isUnfinished: false,
      isAmbiguous: false,
    });
  });

  it('counts exactly the cards the exporter tags LeechCandidate', () => {
    // The chip says "Dense (tagged)" and the advice is to filter on that tag, so
    // the number has to BE the tag set. Driven through the real funnel, which is
    // where the tag is applied and where the completion screen's cards come
    // from — the tag used to be applied only to user-wording cards, so a deck
    // built from a segregation report carried no LeechCandidate tag at all while
    // the screen told the learner to filter on exactly that tag.
    const denseBackOnly = clozeCard('The {{c1::thick ascending limb}} reabsorbs salt', 'cue-clean');
    denseBackOnly.back = 'sodium and chloride cross while the segment stays water-impermeable, diluting the fluid';
    const denseCue = clozeCard(
      'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane',
      'cue-dense'
    );
    const ambiguousOnly = clozeCard('The ion is {{c1::Na+ or K+}}.', 'ambiguous');
    const clean = clozeCard('{{c1::HCl}} is a strong acid.', 'clean');
    // A dense BASIC card is tagged too: the old rule gated on `isCloze`, so the
    // number on the screen skipped it while the file's tag rule did not.
    const denseBasic = { ...clozeCard('What closes the ascending limb to water?', 'basic-dense'), isCloze: false };
    denseBasic.back = 'sodium and chloride cross while the segment stays water-impermeable, diluting the fluid further';
    const overCeiling = clozeCard(
      'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane',
      'over-ceiling'
    );
    overCeiling.back = 'sodium and chloride cross while the segment stays water-impermeable, diluting the fluid further downstream';

    const shipped = sanitizeExtracted(
      [denseBackOnly, denseCue, denseBasic, ambiguousOnly, clean, overCeiling],
      { addSymmetric: false }
    );
    const tagged = shipped.cards.filter((c) => c.tags.includes('LeechCandidate'));
    const stats = classifyDeckQuality(shipped.cards);

    // One rule, two surfaces: the tag in the file and the number on the screen.
    for (const card of shipped.cards) {
      expect(card.tags.includes('LeechCandidate'), `"${card.front}" (${countWords(`${card.front} ${card.back}`)} words)`).toBe(
        isLeechDense(card)
      );
    }
    expect(stats.leechCandidates).toBe(tagged.length);
    const taggedIds = tagged.map((c) => c.id);
    expect(taggedIds.some((id) => id.startsWith('cue-dense'))).toBe(true);
    expect(taggedIds.some((id) => id.startsWith('basic-dense'))).toBe(true);
    expect(taggedIds).not.toContain('ambiguous');
    expect(taggedIds).not.toContain('clean');
    expect(taggedIds.some((id) => id.startsWith('over-ceiling'))).toBe(false);
    // The tagged set is NOT the export sheet's flagged set: a card can be dense
    // by total text while its cue is clean (and then the sheet rightly offers no
    // Split). Each surface now states which question it answers.
    expect(tagged.some((c) => auditAnkiCard(c).length === 0)).toBe(true);
    // The 20-word ceiling still withholds the truly dense card: it is neither
    // shipped nor counted, and what is withheld is named in `heldBack` (as its
    // own auto-split fragments, which is the funnel's existing behaviour).
    expect(shipped.cards.some((c) => c.id.startsWith('over-ceiling'))).toBe(false);
    expect(shipped.heldBack.length).toBeGreaterThan(0);
    expect(shipped.heldBack.every((h) => /words/.test(h.reason))).toBe(true);
    expect(shipped.heldBack.some((h) => h.card.id.startsWith('over-ceiling'))).toBe(true);
    // An ambiguous cue is counted apart from the tagged number, because it is not
    // a tag the learner can filter on — it is a flag in the export sheet.
    expect(stats.ambiguousCues).toBe(1);
    expect(ambiguousOnly.tags).toEqual(['DeepEncode']);
    // Every card lands in exactly one bucket.
    expect(stats.fsrsReady + stats.unfinished + stats.leechCandidates + stats.ambiguousCues).toBe(
      shipped.cards.length
    );
  });

  it('keeps the sheet’s cue flag and the tag’s density flag separate, and states both', () => {
    // The two questions, on one card: 18 words in total (dense — the file tags it
    // and the screen counts it) while its cue is six words (atomic — the sheet
    // says clean and offers no Split, because splitting the front could not
    // shorten the back that made it dense).
    const card = clozeCard('The {{c1::thick ascending limb}} reabsorbs salt');
    card.back = 'sodium and chloride cross while the segment stays water-impermeable, diluting the fluid';
    expect(auditAnkiCard(card)).toEqual([]);
    expect(isLeechDense(card)).toBe(true);
    expect(classifyCardQuality(card).isLeechCandidate).toBe(true);

    // The same card, made dense by its CUE instead, is flagged by both.
    const denseCue = clozeCard(
      'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane'
    );
    expect(auditAnkiCard(denseCue).some((i) => i.kind === 'too_long')).toBe(true);
    expect(isLeechDense(denseCue)).toBe(true);
  });

  it('derives both flags from one definition each, never by re-deriving a threshold', () => {
    // The generator lands on both sides of every branch: long cues, long backs,
    // deletions, `or` inside a deletion, empty backs, and non-cloze cards.
    let seed = 424242;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const words = ['the', 'loop', 'of', 'Henle', 'reabsorbs', 'sodium', 'chloride', 'or', 'ATP', 'membrane', 'water', 'impermeable'];
    let denseByCue = 0;
    let denseOtherwise = 0;
    let ambiguous = 0;

    for (let trial = 0; trial < 300; trial++) {
      const frontWords = 1 + Math.floor(rand() * 30);
      const tokens: string[] = [];
      while (tokens.length < frontWords) tokens.push(words[Math.floor(rand() * words.length)]);
      if (rand() < 0.6) {
        const at = Math.floor(rand() * tokens.length);
        const span = 1 + Math.floor(rand() * Math.min(3, tokens.length - at));
        tokens[at] = `{{c1::${tokens.slice(at, at + span).join(' ')}}}`;
        tokens.splice(at + 1, span - 1);
      }
      const backWords = Math.floor(rand() * 30);
      const backTokens: string[] = [];
      while (backTokens.length < backWords) backTokens.push(words[Math.floor(rand() * words.length)]);

      const c = clozeCard(tokens.join(' '));
      c.back = backTokens.length > 0 ? `<b>Fact Detail:</b> ${backTokens.join(' ')}` : '';
      if (rand() < 0.3) c.isCloze = false;

      const audit = auditAnkiCard(c);
      const q = classifyCardQuality(c);
      const tooLong = audit.some((i) => i.kind === 'too_long');
      const isAmbiguous = audit.some((i) => i.kind === 'ambiguous');
      expect(q.isLeechCandidate, `"${c.front}" (${q.wordCount} words)`).toBe(isLeechDense(c));
      expect(q.isAmbiguous, `"${c.front}"`).toBe(isAmbiguous);
      expect(q.wordCount).toBe(countWords(`${c.front} ${c.back}`));

      if (tooLong) denseByCue += 1;
      if (q.isLeechCandidate && !tooLong) denseOtherwise += 1;
      if (isAmbiguous) ambiguous += 1;
    }

    // Every branch really did occur, so no assertion above is vacuous.
    expect(denseByCue).toBeGreaterThan(0);
    expect(denseOtherwise).toBeGreaterThan(0);
    expect(ambiguous).toBeGreaterThan(0);
  });

  it('aggregates deck stats for the identity trophy', () => {
    const stats = classifyDeckQuality([
      clozeCard('The formula is {{c1::HCl}}.'),
      clozeCard('The ion is {{c1::Na+ or K+}}.'),
      (() => {
        const skipped = clozeCard('Prompt', 'skip-1');
        skipped.tags.push('Unfinished');
        return skipped;
      })(),
    ]);
    expect(stats.totalCards).toBe(3);
    expect(stats.fsrsReady).toBe(1);
    expect(stats.unfinished).toBe(1);
    // The ambiguous card is NOT a "dense (tagged)" card: it is short, and it
    // carries no LeechCandidate tag, so it gets its own bucket rather than
    // inflating the number the screen tells the learner to filter on.
    expect(stats.leechCandidates).toBe(0);
    expect(stats.ambiguousCues).toBe(1);
    expect(stats.fsrsReady + stats.unfinished + stats.leechCandidates + stats.ambiguousCues).toBe(3);
  });
});

/** Markers, braces and words are the three things a split must never lose. */
function assertPiecesAreAtomic(front: string, pieces: AnkiCardItem[] | null, label = front) {
  expect(pieces, label).not.toBeNull();
  const list = pieces!;
  expect(list.length).toBeGreaterThanOrEqual(2);
  let words = 0;
  let markers = 0;
  for (const piece of list) {
    const pieceWords = countWords(piece.front);
    expect(pieceWords, `${label} -> "${piece.front}"`).toBeLessThanOrEqual(TOO_LONG_WORD_LIMIT);
    expect(pieceWords, `${label} -> "${piece.front}"`).toBeGreaterThan(0);
    expect(piece.isCloze).toBe(true);
    // A cut inside a deletion would leave `{{c1::` dangling on a card neither
    // Anki nor RemNote can read.
    expect((piece.front.match(/\{\{/g) || []).length, piece.front).toBe(
      (piece.front.match(/\}\}/g) || []).length
    );
    words += pieceWords;
    markers += (piece.front.match(/\{\{c\d+::/g) || []).length;
  }
  // Nothing invented, nothing dropped: the pieces add up to the sentence.
  expect(words, label).toBe(countWords(front));
  expect(markers, label).toBe((front.match(/\{\{c\d+::/g) || []).length);
}

describe('splitDenseCloze', () => {
  it('returns null for non-cloze cards', () => {
    const card: AnkiCardItem = { ...clozeCard(''), isCloze: false };
    expect(splitDenseCloze(card)).toBeNull();
  });
  it('returns null for short clozes', () => {
    expect(splitDenseCloze(clozeCard('The formula is {{c1::HCl}}.'))).toBeNull();
  });

  it('splits a long cloze into pieces that are each at or under the word limit', () => {
    const front =
      'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane';
    const pieces = splitDenseCloze(clozeCard(front));
    assertPiecesAreAtomic(front, pieces);
    // The single source marker survives on whichever piece it landed on, and
    // the pieces together still cover the full original text.
    expect(pieces!.map((p) => p.front).join(' ')).toContain('mitochondrial');
  });

  it('uses as many pieces as the arithmetic needs, not always two', () => {
    // 34 words is more than 2 x 15, so NO two-piece split can honour the limit:
    // the old two-way splitter returned halves of 17 words and the caller then
    // shipped both, over the very ceiling this function claimed to enforce.
    const front =
      "The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane, and the resulting proton gradient drives ATP synthase to regenerate the cell's primary energy currency";
    expect(countWords(front)).toBeGreaterThan(TOO_LONG_WORD_LIMIT * 2);
    const pieces = splitDenseCloze(clozeCard(front));
    assertPiecesAreAtomic(front, pieces);
    expect(pieces!.length).toBe(Math.ceil(countWords(front) / TOO_LONG_WORD_LIMIT));
    // Reading order is preserved: the tail of the sentence is in the last piece.
    expect(pieces![pieces!.length - 1].front).toContain('currency');
  });

  it('preserves the original card id with a split suffix', () => {
    const front =
      'The {{c1::mitochondrial}} electron transport chain produces a large amount of ATP via oxidative phosphorylation across the inner mitochondrial membrane';
    const [a, b] = splitDenseCloze(clozeCard(front, 'fact-1'))!;
    expect(a.id).toBe('fact-1-split-a');
    expect(b.id).toBe('fact-1-split-b');
  });

  it('never splits inside a multi-word deletion or leaves an empty piece', () => {
    // The deletion's body is several whitespace tokens, so a word-based
    // midpoint lands inside it: the old splitter left a dangling `{{c1::` on
    // one half and no text at all on the other.
    const front =
      'The {{c1::thick ascending limb}} actively reabsorbs sodium and chloride while remaining water-impermeable, which dilutes the tubular fluid further';
    const pieces = splitDenseCloze(clozeCard(front));
    assertPiecesAreAtomic(front, pieces);
    // Together the pieces still cover the whole sentence.
    const joined = pieces!.map((p) => p.front).join(' ');
    expect(joined).toContain('thick');
    expect(joined).toContain('further');
  });

  it('keeps a deletion whose body carries most of the words whole', () => {
    const front =
      'During hypovolemic shock the baroreceptors trigger {{c1::a compensatory sympathetic surge that raises heart rate contractility and systemic vascular resistance}} reducing perfusion pressure downstream';
    if (countWords(front) <= TOO_LONG_WORD_LIMIT) {
      expect(splitDenseCloze(clozeCard(front))).toBeNull();
      return;
    }
    const pieces = splitDenseCloze(clozeCard(front));
    assertPiecesAreAtomic(front, pieces);
    // The deletion's body is thirteen of the sentence's twenty-three words, so
    // it has to stay whole and ride in exactly one piece; cutting it anywhere
    // would change the answer the card is asking for.
    const carriers = pieces!.filter((p) => p.front.includes('compensatory'));
    expect(carriers).toHaveLength(1);
    expect(carriers[0].front).toContain(
      '{{c1::a compensatory sympathetic surge that raises heart rate contractility and systemic vascular resistance}}'
    );
    expect(countWords(carriers[0].front)).toBeLessThan(countWords(front));
  });

  it('returns null when a single deletion body is itself over the limit', () => {
    // No cut can bring this sentence under the limit without cutting the
    // deletion in half — which would change the answer the card asks for. The
    // honest answer is "cannot be split", and the caller holds it back rather
    // than shipping a dense card under a "split" label.
    const body = Array.from({ length: TOO_LONG_WORD_LIMIT + 4 }, (_, i) => `term${i}`).join(' ');
    const front = `The mechanism is {{c1::${body}}} and this card cannot be made atomic`;
    expect(splitDenseCloze(clozeCard(front))).toBeNull();
  });

  it('holds the limit for every piece across 400 generated dense sentences', () => {
    // Deterministic LCG so any failure reproduces exactly.
    let seed = 20261008;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const lexicon = [
      'the', 'inner', 'mitochondrial', 'membrane', 'pumps', 'protons', 'sodium', 'chloride',
      'reabsorbs', 'tubular', 'fluid', 'reducing', 'perfusion', 'pressure', 'downstream',
      'threshold', 'voltage', 'gated', 'channels', 'open', 'rapidly', 'because', 'and', 'which',
      'dilutes', 'further', 'while', 'remaining', 'water', 'impermeable', 'surge', 'raises',
      'heart', 'rate',
    ];
    let sawManyPieces = false;

    for (let trial = 0; trial < 400; trial++) {
      const target = 16 + Math.floor(rand() * 45); // 16..60 words: always over the limit
      const tokens: string[] = [];
      while (tokens.length < target) {
        // A deletion of 1..5 words every so often, so cuts have to route around
        // it instead of landing inside it.
        if (tokens.length > 0 && rand() < 0.25) {
          const body: string[] = [];
          const bodyLen = 1 + Math.floor(rand() * 5);
          for (let i = 0; i < bodyLen && tokens.length + body.length < target; i++) {
            body.push(lexicon[Math.floor(rand() * lexicon.length)]);
          }
          tokens.push(`{{c1::${body.join(' ')}}}`);
        } else {
          tokens.push(lexicon[Math.floor(rand() * lexicon.length)]);
        }
      }

      const front = tokens.join(' ');
      const pieces = splitDenseCloze(clozeCard(front));
      // Every deletion body here is well under the limit, so a split always
      // exists: a null would mean the splitter gave up on a card it could fix.
      assertPiecesAreAtomic(front, pieces);
      if (pieces!.length >= 3) sawManyPieces = true;
    }

    // The generator really did produce sentences needing more than two pieces;
    // the limit assertion above would otherwise be vacuous for them.
    expect(sawManyPieces).toBe(true);
  });
});
