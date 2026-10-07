import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  INQUISITOR_SYSTEM_PROMPT,
  INQUISITOR_VERDICTS,
  MAX_PROOF_LINES,
  buildInquisitorUserPrompt,
  inquisitorSchema,
  type InquisitorRead,
} from '../../lib/inquisitor/contract';
import {
  claimsMatch,
  coerceVerdict,
  describeInquisitorRead,
  hasContrastingAxis,
  normalizeInquisitorRead,
  paradoxDraftFor,
} from '../../lib/inquisitor/parse';
import { validateInquisitorRead } from '../../lib/ai-output-validation';
import { clearParadoxes, openParadoxesFor, raiseParadox } from '../../lib/mr-m/ledger';

/**
 * The inquisitor is the one AI surface in this app whose answer is allowed to be
 * REFUSED rather than repaired, so most of what matters here is the refusal set:
 *
 *   1. a tripwire verdict with no tripwire is downgraded to TRUE, because the
 *      only way to "repair" it is to invent the boundary — and a learner who
 *      believes their intuition has a known limit when nobody has found one is
 *      worse off than one who believes it is simply true;
 *   2. a FALSE with no correction is discarded, because a verdict whose fix is
 *      missing is the bare "incorrect" this whole surface replaces;
 *   3. a verdict with no proof is discarded, because an unsupported claim about
 *      rigour is a coin flip that got lucky.
 *
 * And one behaviour that is the point of the feature rather than a guard: a real
 * boundary tripwire becomes an OPEN contradiction in the ledger the rest of the
 * app already holds contradictions in.
 */

const TRUE_READ: InquisitorRead = {
  verdict: 'TRUE',
  claim: 'Taylor series are derivative matching.',
  proof: ['A Taylor series is defined as the unique polynomial whose derivatives match the function at the origin.'],
  tripwire: '',
  correction: '',
  contextAxis: '',
};

describe('the inquisitor contract', () => {
  it('closes the verdict taxonomy at three', () => {
    expect(INQUISITOR_VERDICTS).toEqual(['TRUE', 'FALSE', 'TRUE_WITH_BOUNDARY_TRIPWIRE']);
  });

  it('opens with the verdict and bans the preamble by name', () => {
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('The FIRST token of your response is the verdict');
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('do not say "let\'s unpack that"');
  });

  it('forbids manufacturing a boundary, and says which verdict to use instead', () => {
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('Never manufacture a boundary');
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('If you cannot name one, the verdict is TRUE');
    // The vague spellings that are explicitly not tripwires.
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('"In extreme cases" and "at very large values" are NOT tripwires');
  });

  it('demands the correction on a false verdict', () => {
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('NEVER return FALSE without it');
  });

  it('asks for the claim back, so a misreading is visible', () => {
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('quote the claim you actually interrogated');
  });

  it('interpolates the proof ceiling it will enforce', () => {
    expect(INQUISITOR_SYSTEM_PROMPT).toContain(`2 to ${MAX_PROOF_LINES} lines`);
  });

  it('requires verdict, claim and proof in the schema', () => {
    // The context axis widened the payload, deliberately: a claim whose truth
    // turns on a regime needs somewhere to put the regime, and a field the
    // model cannot return is a rule it cannot follow. The three required fields
    // are unchanged — an axis belongs to the verdict that carries a boundary,
    // and demanding it on every read would invent context for claims that have
    // none.
    expect(inquisitorSchema.required).toEqual(['verdict', 'claim', 'proof']);
    expect(Object.keys(inquisitorSchema.properties).sort()).toEqual(
      ['claim', 'contextAxis', 'contextDependent', 'correction', 'proof', 'tripwire', 'verdict'].sort()
    );
  });

  it('tells a context-dependent claim to name its regimes instead of hedging', () => {
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('"It depends" is never the verdict');
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('NAME THE AXIS');
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('A one-word axis is not an axis');
  });

  it('bounds the restatement to vagueness rather than convenience', () => {
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('Restating is for vagueness, never for convenience');
    expect(INQUISITOR_SYSTEM_PROMPT).toContain('keep every term the');
  });

  it('leaves the claim last in the user turn, with the context above it', () => {
    const bare = buildInquisitorUserPrompt('  Bond breaking releases energy.  ');
    expect(bare.trim().endsWith('Verify it and output strictly valid JSON.')).toBe(true);
    expect(bare).toContain('CLAIM UNDER INTERROGATION:\nBond breaking releases energy.');

    const scoped = buildInquisitorUserPrompt('Claim.', {
      topic: 'Thermochemistry',
      domain: 'Calorimetry',
      contextSnippet: 'Bonds must be paid for.',
    });
    expect(scoped).toContain('TOPIC: Thermochemistry');
    expect(scoped).toContain('DOMAIN: Calorimetry');
    expect(scoped).toContain('SOURCE CONTEXT: Bonds must be paid for.');
    expect(scoped.indexOf('CLAIM UNDER INTERROGATION')).toBeGreaterThan(
      scoped.indexOf('SOURCE CONTEXT')
    );
  });
});

describe('verdict coercion', () => {
  it('accepts the three verdicts in any case or separator style', () => {
    expect(coerceVerdict('true')).toBe('TRUE');
    expect(coerceVerdict(' True ')).toBe('TRUE');
    expect(coerceVerdict('false')).toBe('FALSE');
    expect(coerceVerdict('true_with_boundary_tripwire')).toBe('TRUE_WITH_BOUNDARY_TRIPWIRE');
    expect(coerceVerdict('TRUE WITH BOUNDARY TRIPWIRE')).toBe('TRUE_WITH_BOUNDARY_TRIPWIRE');
    expect(coerceVerdict('true-with-boundary-tripwire')).toBe('TRUE_WITH_BOUNDARY_TRIPWIRE');
  });

  it('resolves the loose tripwire spellings to the one verdict they mean', () => {
    expect(coerceVerdict('TRUE_WITH_TRIPWIRE')).toBe('TRUE_WITH_BOUNDARY_TRIPWIRE');
    expect(coerceVerdict('BOUNDARY_TRIPWIRE')).toBe('TRUE_WITH_BOUNDARY_TRIPWIRE');
  });

  it('rejects hedges rather than mapping them onto a real verdict', () => {
    // Every one of these means "name the case", and the verdict for that
    // already exists — mapping them would smuggle a hedge through as a
    // boundary, which is the failure the downgrade rule exists to stop.
    for (const hedge of ['PARTIALLY_TRUE', 'IT_DEPENDS', 'NUANCED', 'MAYBE', 'TRUE_AND_FALSE']) {
      expect(coerceVerdict(hedge)).toBeNull();
    }
    expect(coerceVerdict('')).toBeNull();
    expect(coerceVerdict(undefined)).toBeNull();
  });
});

describe('normalizeInquisitorRead — what the learner is shown', () => {
  it('carries a true read through and never renders a tripwire on it', () => {
    const result = normalizeInquisitorRead({
      verdict: 'TRUE',
      claim: 'Taylor series are derivative matching.',
      proof: ['A Taylor series is the unique polynomial matching every derivative at the origin.'],
      // A stray tripwire on a TRUE read must not be displayed.
      tripwire: 'not applicable',
      correction: 'should not appear',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.verdict).toBe('TRUE');
    expect(result.read.tripwire).toBe('');
    expect(result.read.correction).toBe('');
    expect(result.downgraded).toBe(false);
  });

  it('keeps a tripwire when one arrives with the verdict', () => {
    const result = normalizeInquisitorRead({
      verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE',
      claim: 'Every smooth function equals its Taylor series.',
      proof: ['Analyticity is not implied by smoothness.'],
      tripwire: 'f(x) = e^(-1/x^2) has every derivative zero at the origin yet is not the zero function.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.verdict).toBe('TRUE_WITH_BOUNDARY_TRIPWIRE');
    expect(result.read.tripwire).toContain('e^(-1/x^2)');
    expect(result.downgraded).toBe(false);
  });

  it('downgrades a tripwire verdict that arrived with no tripwire, and says so', () => {
    const result = normalizeInquisitorRead({
      verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE',
      claim: 'Conservation of energy always holds.',
      proof: ['Energy is conserved in closed systems.'],
      tripwire: '   ',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.verdict).toBe('TRUE');
    expect(result.read.tripwire).toBe('');
    expect(result.downgraded).toBe(true);
  });

  it('refuses a false verdict with no correction instead of showing a bare verdict', () => {
    const result = normalizeInquisitorRead({
      verdict: 'FALSE',
      claim: 'Breaking bonds releases energy.',
      proof: ['Bond enthalpies are reported as the energy required to break them.'],
      correction: '',
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('noCorrection');
    expect(result.message).toContain('Nothing was shown');
  });

  it('keeps a false verdict that carries its correction', () => {
    const result = normalizeInquisitorRead({
      verdict: 'FALSE',
      claim: 'Breaking bonds releases energy.',
      proof: ['Bond enthalpies are the energy required to break the bond.'],
      correction: 'Breaking a bond costs energy; forming one releases it.',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.verdict).toBe('FALSE');
    expect(result.read.correction).toContain('forming one releases it');
  });

  it('refuses a blank claim — there is nothing to interrogate', () => {
    const result = normalizeInquisitorRead({ verdict: 'TRUE', claim: '  ', proof: ['x'] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('noClaim');
  });

  it('refuses a verdict outside the three', () => {
    const result = normalizeInquisitorRead({ verdict: 'IT_DEPENDS', claim: 'x', proof: ['y'] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('noVerdict');
  });

  it('refuses an unsupported verdict rather than showing a bare one', () => {
    const result = normalizeInquisitorRead({ verdict: 'TRUE', claim: 'x', proof: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('noProof');
  });

  it('cleans the proof: blank lines dropped, duplicates folded, ceiling enforced', () => {
    const result = normalizeInquisitorRead({
      verdict: 'TRUE',
      claim: 'x',
      proof: ['  line one  ', '', '   ', 'LINE ONE', 'line two', 'line three', 'line four', 'line five'],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.proof).toEqual(['line one', 'line two', 'line three', 'line four']);
    expect(result.read.proof).toHaveLength(MAX_PROOF_LINES);
  });

  it('survives a non-object payload', () => {
    expect(normalizeInquisitorRead(null).ok).toBe(false);
    expect(normalizeInquisitorRead('nope').ok).toBe(false);
  });

  it('is the same gate the route validates through', () => {
    expect(validateInquisitorRead({ verdict: 'TRUE', claim: 'x', proof: ['y'] }).ok).toBe(true);
    expect(validateInquisitorRead({ verdict: 'TRUE', claim: 'x', proof: [] }).ok).toBe(false);
  });

  it('carries a context-dependent read only when the regimes are actually named', () => {
    const result = normalizeInquisitorRead({
      verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE',
      claim: 'Elevated cortisol causes immunosuppression.',
      proof: ['Glucocorticoids suppress lymphocyte proliferation and cytokine production.'],
      tripwire: 'In the acute stress response cortisol mobilises immune cells into the circulation, so surveillance rises before it falls.',
      contextDependent: true,
      contextAxis: 'acute vs chronic',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.verdict).toBe('TRUE_WITH_BOUNDARY_TRIPWIRE');
    expect(result.read.contextAxis).toBe('acute vs chronic');
    expect(result.downgraded).toBe(false);
  });

  it('accepts a regime pair that never says "vs", because that is still an axis', () => {
    const result = normalizeInquisitorRead({
      verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE',
      claim: 'Elevated cortisol suppresses immunity.',
      proof: ['Chronic glucocorticoid exposure downregulates inflammatory signalling.'],
      tripwire: 'The acute response raises immune surveillance instead.',
      contextDependent: true,
      contextAxis: 'acute and chronic exposure',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.contextAxis).toContain('acute');
  });

  it('refuses a context-dependent claim whose axis names nothing', () => {
    const base = {
      verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE',
      claim: 'Context matters here.',
      proof: ['The effect changes with the regime.'],
      tripwire: 'The effect reverses in the other regime.',
      contextDependent: true,
    };

    for (const axis of ['', 'dose', 'it depends', 'in some cases', 'chronic']) {
      const result = normalizeInquisitorRead({ ...base, contextAxis: axis });
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason).toBe('noContextAxis');
      expect(result.message).toContain('without naming the context');
    }
  });

  it('refuses a context-dependent claim dressed as a plain TRUE instead of hiding the condition', () => {
    const result = normalizeInquisitorRead({
      verdict: 'TRUE',
      claim: 'Elevated cortisol causes immunosuppression.',
      proof: ['Glucocorticoids suppress cytokine production.'],
      contextDependent: true,
      contextAxis: 'acute vs chronic',
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('noContextAxis');
  });

  it('leaves a mathematical boundary alone — a counterexample needs no regime', () => {
    const result = normalizeInquisitorRead({
      verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE',
      claim: 'Smoothness implies analyticity.',
      proof: ['The remainder term is what an equality requires.'],
      tripwire: 'e^(-1/x^2) is smooth and not analytic at the origin.',
      contextAxis: '',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.tripwire).toContain('e^(-1/x^2)');
    expect(result.read.contextAxis).toBe('');
  });

  it('never renders a stray axis on a read that carries no boundary', () => {
    const result = normalizeInquisitorRead({
      verdict: 'TRUE',
      claim: 'Energy is conserved.',
      proof: ['Noether: a time-translation symmetry yields a conserved quantity.'],
      contextAxis: 'low vs high energy',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.read.contextAxis).toBe('');
  });

  it('describes each verdict in one line for the panel', () => {
    expect(describeInquisitorRead(TRUE_READ)).toContain('Rigorous as stated');
    expect(
      describeInquisitorRead({ ...TRUE_READ, verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE', tripwire: 'e^(-1/x^2)' })
    ).toContain('boundary');
    expect(describeInquisitorRead({ ...TRUE_READ, verdict: 'FALSE', correction: 'x' })).toContain(
      'Not rigorous'
    );
  });
});

describe('claim fidelity — the verdict is about the learner’s sentence', () => {
  const submitted = 'Elevated cortisol causes immunosuppression.';

  it('accepts a restatement that only adds the mechanism', () => {
    const result = normalizeInquisitorRead(
      {
        verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE',
        claim:
          'Elevated cortisol causes immunosuppression by suppressing lymphocyte proliferation.',
        proof: ['Glucocorticoids suppress T-cell proliferation.'],
        tripwire: 'Acute mobilisation raises surveillance before it falls.',
        contextDependent: true,
        contextAxis: 'acute vs chronic',
      },
      submitted
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Faithful, and still labelled: the learner sees which sentence was tested.
    expect(result.claimRestated).toBe(true);
  });

  it('reports no restatement when the model used the learner’s own sentence', () => {
    const result = normalizeInquisitorRead(
      {
        verdict: 'TRUE',
        claim: submitted,
        proof: ['Glucocorticoids suppress lymphocyte function.'],
      },
      submitted
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claimRestated).toBe(false);
  });

  it('refuses a verdict about a sentence the learner did not write', () => {
    // The failure this exists for: the input says "elevated cortisol", and the
    // read comes back about "chronic psychological stress".
    const result = normalizeInquisitorRead(
      {
        verdict: 'FALSE',
        claim: 'Chronic psychological stress impairs wound healing through vagal tone.',
        proof: ['Vagal withdrawal raises inflammatory tone.'],
        correction: 'Stress impairs healing through glucocorticoid signalling, not vagal tone.',
      },
      submitted
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('claimDrift');
    expect(result.message).toContain('different sentence');
  });

  it('checks fidelity only when the caller supplies the sentence it submitted', () => {
    const result = normalizeInquisitorRead({
      verdict: 'TRUE',
      claim: 'Something else entirely.',
      proof: ['A law that forces it.'],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claimRestated).toBe(false);
  });

  it('matches on content words the shorter sentence carries', () => {
    expect(claimsMatch('Cortisol suppresses immunity.', 'Cortisol suppresses immunity in chronic stress.')).toBe(
      true
    );
    expect(claimsMatch('Cortisol suppresses immunity.', 'Insulin drives glucose uptake.')).toBe(false);
    expect(claimsMatch('', 'anything')).toBe(false);
    expect(claimsMatch('   ', 'anything')).toBe(false);
  });
});

describe('hasContrastingAxis — two ends or nothing', () => {
  it('accepts the forms that name two regimes', () => {
    expect(hasContrastingAxis('acute vs chronic')).toBe(true);
    expect(hasContrastingAxis('dose: low vs high')).toBe(true);
    expect(hasContrastingAxis('in vitro vs in vivo')).toBe(true);
    expect(hasContrastingAxis('low dose, high dose')).toBe(true);
    expect(hasContrastingAxis('above the melting point and below it')).toBe(true);
  });

  it('refuses a hedge, a variable name, or a single end', () => {
    expect(hasContrastingAxis('')).toBe(false);
    expect(hasContrastingAxis('dose')).toBe(false);
    expect(hasContrastingAxis('it depends')).toBe(false);
    expect(hasContrastingAxis('in some cases')).toBe(false);
    expect(hasContrastingAxis('chronic')).toBe(false);
  });
});

describe('paradoxDraftFor — a boundary becomes a held contradiction', () => {
  it('drafts a statement joining the claim to its edge', () => {
    const draft = paradoxDraftFor(
      {
        ...TRUE_READ,
        verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE',
        claim: 'Every smooth function is its own Taylor series.',
        tripwire: 'e^(-1/x^2) is smooth and not analytic at the origin.',
      },
      'Analysis'
    );

    expect(draft).not.toBeNull();
    expect(draft!.topic).toBe('Analysis');
    expect(draft!.statement).toContain('Every smooth function is its own Taylor series.');
    expect(draft!.statement).toContain('e^(-1/x^2)');
  });

  it('drafts nothing for a plain true or a corrected false', () => {
    expect(paradoxDraftFor(TRUE_READ, 'Analysis')).toBeNull();
    expect(
      paradoxDraftFor({ ...TRUE_READ, verdict: 'FALSE', correction: 'Bonds cost energy to break.' }, 'Analysis')
    ).toBeNull();
  });

  it('drafts nothing when the tripwire is empty, even on the tripwire verdict', () => {
    expect(paradoxDraftFor({ ...TRUE_READ, verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE' }, 'Analysis')).toBeNull();
  });

  it('falls back to an untitled topic rather than raising under an empty one', () => {
    const draft = paradoxDraftFor(
      { ...TRUE_READ, verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE', tripwire: 'the edge' },
      '   '
    );
    expect(draft!.topic).toBe('Untitled');
  });
});

describe('the boundary tripwire reaches the ledger the rest of the app uses', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    const localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    vi.stubGlobal('localStorage', localStorage);
    vi.stubGlobal('window', { localStorage });
    clearParadoxes();
  });

  it('holding a boundary open leaves an unresolved contradiction for the topic', () => {
    const read: InquisitorRead = {
      ...TRUE_READ,
      verdict: 'TRUE_WITH_BOUNDARY_TRIPWIRE',
      claim: 'Every smooth function equals its Taylor series.',
      tripwire: 'e^(-1/x^2), whose derivatives all vanish at the origin.',
    };

    const draft = paradoxDraftFor(read, 'Analysis')!;
    const entry = raiseParadox(draft.topic, draft.statement);

    expect(entry).not.toBeNull();
    const open = openParadoxesFor('Analysis');
    expect(open).toHaveLength(1);
    expect(open[0].resolvedAt).toBeUndefined();
    expect(open[0].statement).toContain('e^(-1/x^2)');
  });

  it('re-committing the same boundary updates that record instead of stacking copies', () => {
    const statement = 'X — yet Y';
    raiseParadox('Analysis', statement);
    raiseParadox('Analysis', statement);
    expect(openParadoxesFor('Analysis')).toHaveLength(1);
  });

  it('a plain true verdict raises nothing, because there is nothing to hold open', () => {
    const draft = paradoxDraftFor(TRUE_READ, 'Analysis');
    expect(draft).toBeNull();
    expect(openParadoxesFor('Analysis')).toHaveLength(0);
  });
});
