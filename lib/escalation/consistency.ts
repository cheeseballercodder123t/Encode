// ─── The declared-ledger consistency gate ───────────────────────────────────
//
// The generators here are language models, and a language model has no CAS
// behind it. It can write a Tier 3 thermodynamics problem whose prose is
// coherent and whose NUMBERS are not: an exothermic reaction whose stated heat
// cannot raise the stated mass of water as far as the problem says, an expanding
// gas whose work does not match the pressure and volume change it declares, a
// volume reported as positive in one line and consumed as negative in the next.
// Nothing in the prose reveals that. Under a clock it is worse than a hard
// problem, because the learner burns the sprint proving the problem is wrong.
//
// This module is the sandbox the prompt is not. A generator that wants its
// problem served must DECLARE its arithmetic:
//
//   quantities: [{ symbol: 'm_water', value: 250, unit: 'g' }, ...]
//   relations:  [{ lhs: 'q', rhs: 'm_water * c_water * dT' }, ...]
//
// and every relation is then evaluated HERE, symbol by symbol, with a small
// recursive-descent evaluator that knows + - * / ^ and parentheses and nothing
// else. `eval` is not used and would not be acceptable: a model-supplied string
// is untrusted input, and a "sandbox" that runs it is not a sandbox.
//
// Two kinds of check come out of that, and they answer different questions:
//
//   * CLOSURE — does the model's own algebra work out? Every relation must
//     evaluate (no undeclared symbol, no division by zero) and both sides must
//     agree inside the tolerance. A relation that disagrees is the model
//     contradicting itself, which is exactly the failure a CAS would have
//     stopped.
//   * PLAUSIBILITY — rules that hold in every physics the plan covers, and that
//     need no domain model to state: a mass or volume is positive, work done
//     against a rising volume is negative, and water reported at or above its
//     boiling point without a latent-heat term is missing the plateau it must
//     have crossed.
//
// What this deliberately does NOT claim: it is not a solver. It cannot discover
// a number the model never related to anything, and it cannot name the right
// exponent for a law the generator stated wrongly — that stays with the prompt
// and with the tier gates in `mutation.ts`. It verifies what the model DECLARED,
// which is the class of error that actually reached the learner: a chain that
// does not close.

/** One declared quantity: the ledger's atom. */
export interface LedgerQuantity {
  symbol: string;
  value: number;
  unit: string;
}

/** One declared relation between quantities, as two expressions in symbols. */
export interface LedgerRelation {
  lhs: string;
  rhs: string;
  /** What the relation is — `energy balance`, `boundary work`, `moles from mass`. */
  note: string;
}

export interface LedgerCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

export interface LedgerVerification {
  /** True when nothing failed. An EMPTY ledger is not verified — see `verified`. */
  ok: boolean;
  /**
   * True only when the generator declared real arithmetic and all of it closed.
   *
   * Separate from `ok` on purpose, and this is the honest half of the module: a
   * payload with no ledger is not "inconsistent", it is UNVERIFIED, and a caller
   * that cannot tell those apart will either wave unverified problems through or
   * refuse every problem a weaker model writes.
   */
  verified: boolean;
  checks: LedgerCheck[];
  /** `lhs = rhs` for each relation, with the two sides' computed values. */
  evaluated: { relation: LedgerRelation; lhs: number; rhs: number; deviationPct: number }[];
  failures: LedgerCheck[];
}

/** How far apart the two sides of a relation may be and still be "the same sum". */
export const LEDGER_TOLERANCE_PCT = 1;

/** Boiling point of water, in the units the generators use. */
const WATER_BOILING_C = 100;

/** `m_water`, `dT`, `q`, `P_ext` — a symbol, not a number and not an operator. */
const SYMBOL = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Anything that is not `+ - * / ^ ( )` and not a number or a symbol is rejected. */
const ILLEGAL = /[^0-9A-Za-z_.+\-*/^()\s]/;

// ─── The evaluator ──────────────────────────────────────────────────────────

type Token = { kind: 'number'; value: number } | { kind: 'symbol'; name: string } | { kind: '+' | '-' | '*' | '/' | '^' | '(' | ')' };

function tokenize(expression: string): Token[] | null {
  const text = String(expression || '');
  if (!text.trim() || ILLEGAL.test(text)) return null;

  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let end = index;
      while (end < text.length && /[0-9.]/.test(text[end])) end += 1;
      const value = Number(text.slice(index, end));
      // `1.2.3` is not a number this evaluator should guess at.
      if (!Number.isFinite(value)) return null;
      tokens.push({ kind: 'number', value });
      index = end;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = index;
      while (end < text.length && /[A-Za-z0-9_]/.test(text[end])) end += 1;
      const name = text.slice(index, end);
      if (!SYMBOL.test(name)) return null;
      tokens.push({ kind: 'symbol', name });
      index = end;
      continue;
    }
    if ('+-*/^()'.includes(char)) {
      tokens.push({ kind: char } as Token);
      index += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

/**
 * Evaluates an expression of declared symbols: `m_water * c * dT`.
 *
 * Recursive descent, so precedence and associativity are the ordinary ones and
 * an unknown shape returns null rather than a made-up value. `null` propagates:
 * the caller reports it as "this relation could not be evaluated", which is a
 * failure of the payload, not a zero.
 */
export function evaluateExpression(
  expression: string,
  values: Record<string, number>
): number | null {
  const tokens = tokenize(expression);
  if (!tokens || tokens.length === 0) return null;

  let position = 0;
  const peek = (): Token | undefined => tokens[position];
  const eat = (kind: Token['kind']): boolean => {
    if (peek()?.kind === kind) {
      position += 1;
      return true;
    }
    return false;
  };

  /** expr := term (('+' | '-') term)* */
  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    for (;;) {
      if (eat('+')) {
        const right = parseTerm();
        if (right === null) return null;
        left += right;
      } else if (eat('-')) {
        const right = parseTerm();
        if (right === null) return null;
        left -= right;
      } else {
        return left;
      }
    }
  };

  /** term := power (('*' | '/') power)* */
  const parseTerm = (): number | null => {
    let left = parsePower();
    if (left === null) return null;
    for (;;) {
      if (eat('*')) {
        const right = parsePower();
        if (right === null) return null;
        left *= right;
      } else if (eat('/')) {
        const right = parsePower();
        if (right === null || right === 0) return null;
        left /= right;
      } else {
        return left;
      }
    }
  };

  /** power := unary ('^' power)? — right-associative, so `2^3^2` is 2^9. */
  const parsePower = (): number | null => {
    const base = parseUnary();
    if (base === null) return null;
    if (eat('^')) {
      const exponent = parsePower();
      if (exponent === null) return null;
      const value = Math.pow(base, exponent);
      return Number.isFinite(value) ? value : null;
    }
    return base;
  };

  /** unary := '-' unary | primary */
  const parseUnary = (): number | null => {
    if (eat('-')) {
      const value = parseUnary();
      return value === null ? null : -value;
    }
    if (eat('+')) return parseUnary();
    return parsePrimary();
  };

  /** primary := number | symbol | '(' expr ')' */
  const parsePrimary = (): number | null => {
    const token = peek();
    if (!token) return null;
    if (token.kind === 'number') {
      position += 1;
      return token.value;
    }
    if (token.kind === 'symbol') {
      position += 1;
      const value = values[token.name];
      return Number.isFinite(value) ? value : null;
    }
    if (eat('(')) {
      const inner = parseExpr();
      if (inner === null) return null;
      if (!eat(')')) return null;
      return inner;
    }
    return null;
  };

  const result = parseExpr();
  if (result === null || position !== tokens.length) return null;
  return Number.isFinite(result) ? result : null;
}

// ─── Coercion ───────────────────────────────────────────────────────────────

function asSymbol(value: unknown): string {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, '_') : '';
  return SYMBOL.test(text) ? text : '';
}

function asExpression(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

/** Reads the declared arithmetic out of a generated payload, dropping what is malformed. */
export function parseLedger(raw: unknown): { quantities: LedgerQuantity[]; relations: LedgerRelation[] } {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  const quantities: LedgerQuantity[] = [];
  const seen = new Set<string>();
  for (const entry of Array.isArray(data.quantities) ? data.quantities : []) {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const symbol = asSymbol(item.symbol);
    const value = Number(item.value);
    if (!symbol || seen.has(symbol) || !Number.isFinite(value)) continue;
    seen.add(symbol);
    quantities.push({
      symbol,
      value,
      unit: typeof item.unit === 'string' ? item.unit.trim().slice(0, 24) : '',
    });
  }

  const relations: LedgerRelation[] = [];
  for (const entry of Array.isArray(data.relations) ? data.relations : []) {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const lhs = asExpression(item.lhs);
    const rhs = asExpression(item.rhs);
    if (!lhs || !rhs) continue;
    relations.push({
      lhs,
      rhs,
      note: typeof item.note === 'string' ? item.note.replace(/\s+/g, ' ').trim().slice(0, 120) : '',
    });
  }

  return { quantities, relations };
}

// ─── The plausibility rules ─────────────────────────────────────────────────

function findQuantity(quantities: LedgerQuantity[], pattern: RegExp): LedgerQuantity | undefined {
  return quantities.find((quantity) => pattern.test(quantity.symbol));
}

const MASS_OR_VOLUME = /^(?:m|mass|vol|volume|v)_?/i;
const TEMPERATURE = /(?:^|_)(?:t|temp|temperature)(?:_|$)/i;
const LATENT = /(?:^|_)(?:l_?v|l_?f|latent|delta_?h_?(?:vap|fus)|enthalpy_?(?:vap|fus))/i;
const WATER = /water|h2o|solut|solution|mixture/i;
const WORK = /(?:^|_)(?:w|work)(?:_|$)/i;
const PRESSURE = /(?:^|_)(?:p|press|pressure)(?:_|$)/i;
const DELTA_VOLUME = /(?:d_?v|delta_?v|vol_?change)/i;

/**
 * Rules that hold without modelling the domain.
 *
 * Each one is stated as a refusal a learner could act on, because that is the
 * only kind of check worth making here: "the problem states 320 g of water
 * reaches 104 °C without a vaporisation term" is a defect report, while "the
 * numbers look wrong" is noise.
 */
function plausibility(quantities: LedgerQuantity[]): LedgerCheck[] {
  const checks: LedgerCheck[] = [];

  const negatives = quantities.filter(
    (quantity) => MASS_OR_VOLUME.test(quantity.symbol) && quantity.value <= 0
  );
  checks.push({
    id: 'POSITIVE_EXTENSIVE',
    label: 'A mass or a volume is a positive quantity',
    ok: negatives.length === 0,
    detail:
      negatives.length === 0
        ? ''
        : `declared as zero or negative: ${negatives
            .map((quantity) => `${quantity.symbol} = ${quantity.value}${quantity.unit ? ` ${quantity.unit}` : ''}`)
            .join(', ')}`,
  });

  const temperature = quantities.filter((quantity) => TEMPERATURE.test(quantity.symbol));
  const implausible = temperature.filter((quantity) => quantity.value < -273.15 || quantity.value > 5000);
  checks.push({
    id: 'TEMPERATURE_RANGE',
    label: 'A temperature is on the thermodynamic scale',
    ok: implausible.length === 0,
    detail:
      implausible.length === 0
        ? ''
        : `outside any physical range: ${implausible
            .map((quantity) => `${quantity.symbol} = ${quantity.value}`)
            .join(', ')}`,
  });

  // The one the reported failure actually looks like: a reaction carrying water
  // past its boiling point in a ledger with no plateau term. Whether the heat is
  // enough is the closure check's job — this one is about the term existing.
  const hotWater = temperature.filter(
    (quantity) =>
      quantity.value >= WATER_BOILING_C &&
      (WATER.test(quantity.symbol) || quantities.some((other) => WATER.test(other.symbol)))
  );
  const hasLatent = Boolean(findQuantity(quantities, LATENT));
  checks.push({
    id: 'PHASE_PLATEAU',
    label: 'Water at or past its boiling point carries the vaporisation term',
    ok: hotWater.length === 0 || hasLatent,
    detail:
      hotWater.length === 0 || hasLatent
        ? ''
        : `${hotWater.map((quantity) => quantity.symbol).join(', ')} reaches the boiling point with no latent-heat quantity in the ledger, so the plateau the problem must have crossed is missing`,
  });

  // Work done against an expanding volume is negative. Stated as a sign rule
  // rather than a formula: the formula is checked by closure, and what goes
  // wrong in practice is the sign surviving one and not the other.
  const deltaV = findQuantity(quantities, DELTA_VOLUME);
  const work = findQuantity(quantities, WORK);
  const pressure = findQuantity(quantities, PRESSURE);
  const workSignWrong =
    Boolean(deltaV && work && pressure) &&
    deltaV!.value > 0 &&
    pressure!.value > 0 &&
    work!.value > 0;
  checks.push({
    id: 'WORK_SIGN',
    label: 'Work done by an expanding gas is negative',
    ok: !workSignWrong,
    detail: workSignWrong
      ? `${work!.symbol} is declared positive while ${deltaV!.symbol} > 0 at ${pressure!.symbol} > 0 — expansion against an external pressure does work ON the surroundings`
      : '',
  });

  return checks;
}

// ─── The gate ───────────────────────────────────────────────────────────────

/**
 * Verifies a declared ledger.
 *
 * `ok` is false when anything checkable failed; `verified` is true only when
 * there was real arithmetic to check and all of it closed. A caller that needs a
 * machine-checked number (the Tier 3 gate, the crucible) must require
 * `verified`, not `ok`.
 */
export function verifyLedger(
  rawQuantities: unknown,
  rawRelations: unknown,
  tolerancePct: number = LEDGER_TOLERANCE_PCT
): LedgerVerification {
  const { quantities, relations } = parseLedger({ quantities: rawQuantities, relations: rawRelations });

  const values: Record<string, number> = {};
  for (const quantity of quantities) values[quantity.symbol] = quantity.value;

  const checks: LedgerCheck[] = [];
  const evaluated: LedgerVerification['evaluated'] = [];

  for (const [index, relation] of relations.entries()) {
    const lhs = evaluateExpression(relation.lhs, values);
    const rhs = evaluateExpression(relation.rhs, values);
    const label = relation.note || `${relation.lhs} = ${relation.rhs}`;

    if (lhs === null || rhs === null) {
      const undeclared = [
        ...relation.lhs.split(/[^A-Za-z_]+/),
        ...relation.rhs.split(/[^A-Za-z_]+/),
      ].filter((name) => SYMBOL.test(name) && !(name in values));
      checks.push({
        id: `RELATION_${index + 1}`,
        label,
        ok: false,
        detail: undeclared.length
          ? `uses ${[...new Set(undeclared)].join(', ')}, which the ledger does not declare`
          : `could not be evaluated: ${relation.lhs} = ${relation.rhs}`,
      });
      continue;
    }

    const scale = Math.max(1e-9, Math.abs(lhs), Math.abs(rhs));
    const deviationPct = (Math.abs(lhs - rhs) / scale) * 100;
    const ok = deviationPct <= tolerancePct;
    checks.push({
      id: `RELATION_${index + 1}`,
      label,
      ok,
      detail: ok
        ? ''
        : `does not close: ${relation.lhs} = ${Number(lhs.toPrecision(6))} against ${relation.rhs} = ${Number(
            rhs.toPrecision(6)
          )} (${deviationPct.toFixed(1)}% apart)`,
    });
    evaluated.push({ relation, lhs, rhs, deviationPct });
  }

  checks.push(...plausibility(quantities));

  const failures = checks.filter((check) => !check.ok);
  return {
    ok: failures.length === 0,
    verified: relations.length > 0 && failures.length === 0,
    checks,
    evaluated,
    failures,
  };
}

/** One line for the route's refusal, and for the repair pass's prompt. */
export function describeLedgerFailures(verification: LedgerVerification): string {
  if (verification.ok && verification.verified) return '';
  if (verification.failures.length === 0) {
    return 'The problem arrived with no declared arithmetic, so its numbers could not be checked.';
  }
  return verification.failures
    .map((failure) => `${failure.label}: ${failure.detail || 'failed'}`)
    .join(' · ');
}

/**
 * The repair instruction handed back to the generator after a failed check.
 *
 * It carries the failures verbatim, because they are the defect report: the
 * model's own relations and which of them do not close. One retry is allowed and
 * no more — a generator that contradicts itself twice is not going to converge,
 * and the learner is owed a refusal rather than a third attempt.
 */
export function ledgerRepairPrompt(verification: LedgerVerification): string {
  return `YOUR PREVIOUS PROBLEM WAS REJECTED BY AN ARITHMETIC CHECK. Nothing was served to the learner.

THE DEFECTS, as measured:
${verification.failures
  .map((failure) => `  · ${failure.label}: ${failure.detail || 'failed'}`)
  .join('\n')}

Rewrite the problem so that every number is consistent with every other one, then output it again with the same structure. Do NOT change the physics to make the arithmetic close unless the physics was wrong — recompute the numbers instead. Every relation you declare must be true of the quantities you declare.`;
}
