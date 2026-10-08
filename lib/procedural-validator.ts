import { ProceduralMCQArchetype, ProceduralMCQVariableSpec } from './types';

// ─── Procedural MCQ Validator ────────────────────────────────────────────────
// Deterministic test harness for AI-authored (or hand-authored) procedural
// archetypes. No AI involvement: formulas are compiled in a sandbox and put
// through numerical trials. An archetype that fails here must never reach a
// student's deck : the /api/archetype route feeds these errors back to the
// flash-lite repair model instead.

export interface ProceduralValidationIssue {
  archetypeId: string;
  field: string; // e.g. 'correctFormulaJs' | 'traps[1].formulaJs' | 'questionTemplate'
  message: string;
}

export interface ProceduralValidationReport {
  ok: boolean;
  issues: ProceduralValidationIssue[];
  /** Number of numerical draws executed per formula (informational). */
  trialsRun: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const TRIALS_PER_FORMULA = 50;
/** Minimum relative separation (1%). */
const MIN_RELATIVE_SEPARATION = 0.01;

function valuesCollide(a: number, b: number): boolean {
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return false;
  return Math.abs(a - b) <= MIN_RELATIVE_SEPARATION * scale;
}

/** Deterministic mulberry32 PRNG so validator runs are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The first finite number among the candidates, else 0. */
function finiteFallback(...candidates: unknown[]): number {
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  }
  return 0;
}

/** Rolls one value for a variable spec, honoring choices / step / decimals. */
export function rollVariable(
  spec: ProceduralMCQVariableSpec,
  rng: () => number = Math.random
): number {
  // A spec that is missing, null, or not an object declares nothing to roll.
  // This is called from card-building and validation paths that must not be
  // taken down by one malformed entry, so it answers with a real number.

  if (!spec || typeof spec !== 'object') return 0;

  const min = spec.min;
  const max = spec.max;
  const hasFiniteMin = typeof min === 'number' && Number.isFinite(min);
  const hasFiniteMax = typeof max === 'number' && Number.isFinite(max);
  const choices = Array.isArray(spec.choices) ? spec.choices : null;

  let value: number;
  if (choices && choices.length > 0) {
    const picked: unknown = choices[Math.floor(rng() * choices.length) % choices.length];
    // A choice list is a list of NUMBERS. A string, a hole, or a NaN in it
    // would reach toFixed() below and throw, so an unusable pick is treated
    // as "no draw" and falls through to the finite fallback.
    value = typeof picked === 'number' && Number.isFinite(picked) ? picked : NaN;
  } else if (hasFiniteMin && hasFiniteMax) {
    const lo = Math.min(min as number, max as number);
    const hi = Math.max(min as number, max as number);
    let raw = lo + rng() * (hi - lo);
    if (spec.step && spec.step > 0) {
      raw = lo + Math.round((raw - lo) / spec.step) * spec.step;
    }
    value = raw;
  } else if (hasFiniteMin) {
    // One usable end still bounds the draw: an infinite max cannot be rolled
    // inside, so the finite end is the only honest value.
    value = min as number;
  } else if (hasFiniteMax) {
    value = max as number;
  } else {
    return 0;
  }

  // A non-finite value leaving here poisons every formula downstream: each
  // computed answer becomes NaN and JSON.stringify turns it into null.
  if (!Number.isFinite(value)) return finiteFallback(min, max);

  // toFixed() throws a RangeError outside 0..100, so a bad decimals value is
  // clamped rather than allowed to crash the caller.
  const decimals = Number.isInteger(spec.decimals)
    ? Math.min(100, Math.max(0, spec.decimals as number))
    : 2;
  const rounded = Number(value.toFixed(decimals));
  return Number.isFinite(rounded) ? rounded : 0;
}

/** Rolls a full variable context for an archetype. */
export function rollVariables(
  variables: ProceduralMCQArchetype['variables'],
  rng: () => number = Math.random
): Record<string, number> {
  const ctx: Record<string, number> = {};
  if (!variables || typeof variables !== 'object') return ctx;
  for (const [name, spec] of Object.entries(variables)) {
    ctx[name] = rollVariable(spec, rng);
  }
  return ctx;
}

/**
 * Extracts bare identifiers from a JS expression, ignoring property access
 * (obj.prop), object literal keys ({ key: ... }), and string/comment content.
 * Used to enforce that formulas only touch declared variables + Math.
 */
export function extractIdentifiers(expression: string): string[] {
  // Strip string literals and comments so their contents aren't scanned.
  const stripped = expression
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const ids: string[] = [];
  const re = /[A-Za-z_$][\w$]*/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(stripped)) !== null) {
    const before = stripped.slice(0, match.index).replace(/[\s)]*$/, '');
    // Property access like foo.bar : 'bar' is a property, not a free identifier.
    if (before.endsWith('.')) continue;
    // Object literal key like { answer: 1 } : skip the key itself.
    if (/^\{\s*$|^\[\s*$|,\s*$/.test(before) && /^\s*:/.test(stripped.slice(match.index + match[0].length))) {
      continue;
    }
    ids.push(match[0]);
  }
  return ids;
}

/**
 * Compiles a formula expression into a callable sandboxed function.
 * Only the declared variable names and `Math` are in scope. No window,
 * document, fetch, eval, or globals of any kind are reachable.
 */
export function compileFormula(
  formulaJs: string,
  variableNames: string[]
): { fn: (...args: unknown[]) => unknown } | { error: string } {
  if (!formulaJs || !formulaJs.trim()) {
    return { error: 'Formula expression is empty.' };
  }
  if (/;\s*(return|while|for|import|require)/.test(formulaJs)) {
    return { error: 'Formula must be a single pure expression (no statements).' };
  }
  const allowed = new Set([...variableNames, 'Math']);
  for (const id of extractIdentifiers(formulaJs)) {
    if (!allowed.has(id)) {
      return { error: `Formula references undeclared identifier "${id}". Allowed: ${variableNames.join(', ')}, Math.` };
    }
  }
  try {
    const fn = new Function(
      ...variableNames,
      'Math',
      `"use strict"; return (${formulaJs});`
    ) as (...args: unknown[]) => unknown;
    return { fn };
  } catch (err: any) {
    return { error: `Formula failed to compile: ${err?.message || String(err)}` };
  }
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function validateOneFormula(
  formulaJs: string,
  field: string,
  archetype: ProceduralMCQArchetype,
  issues: ProceduralValidationIssue[]
): ((ctx: Record<string, number>) => number | null) | null {
  const varNames = Object.keys(archetype.variables);
  const compiled = compileFormula(formulaJs, varNames);
  if ('error' in compiled) {
    issues.push({ archetypeId: archetype.id, field, message: compiled.error });
    return null;
  }
  const rng = mulberry32(hashString(archetype.id + field));
  const fn = compiled.fn;
  return (ctx: Record<string, number>) => {
    try {
      return toNumber(fn(...varNames.map((n) => ctx[n]), Math));
    } catch (err: any) {
      issues.push({
        archetypeId: archetype.id,
        field,
        message: `Formula threw at variables ${JSON.stringify(ctx)}: ${err?.message || String(err)}`,
      });
      return null;
    }
  };
}

function structuralErrors(archetype: ProceduralMCQArchetype): string[] {
  const errors: string[] = [];
  if (!archetype.id || !archetype.id.trim()) errors.push('Archetype is missing an id.');
  if (!archetype.topic || !archetype.topic.trim()) errors.push('Archetype is missing a topic.');
  if (!archetype.questionTemplate || !archetype.questionTemplate.trim()) {
    errors.push('questionTemplate is empty.');
  }
  if (!archetype.unit || !archetype.unit.trim()) errors.push('unit is empty.');
  if (!archetype.correctFormulaJs || !archetype.correctFormulaJs.trim()) {
    errors.push('correctFormulaJs is empty.');
  }
  if (!archetype.stepByStepSolutionTemplate || !archetype.stepByStepSolutionTemplate.trim()) {
    errors.push('stepByStepSolutionTemplate is empty.');
  }
  if (!archetype.traps || archetype.traps.length !== 3) {
    errors.push(`Archetype must declare exactly 3 traps (found ${archetype.traps?.length ?? 0}).`);
  } else {
    const names = new Set<string>();
    archetype.traps.forEach((trap, i) => {
      if (!trap.trapName?.trim()) errors.push(`traps[${i}] is missing trapName.`);
      else if (names.has(trap.trapName)) errors.push(`Duplicate trapName "${trap.trapName}".`);
      else names.add(trap.trapName);
      if (!trap.formulaJs?.trim()) errors.push(`traps[${i}] (${trap.trapName || i}) is missing formulaJs.`);
      if (!trap.explanation?.trim()) errors.push(`traps[${i}] (${trap.trapName || i}) is missing an explanation.`);
    });
  }

  // Variable specs sanity + question template placeholder coverage.
  const declared = new Set(Object.keys(archetype.variables || {}));
  if (declared.size === 0) errors.push('No variables declared.');
  for (const [name, spec] of Object.entries(archetype.variables || {})) {
    if (spec.choices && spec.choices.length > 0) {
      if (spec.choices.some((c) => !Number.isFinite(c))) {
        errors.push(`Variable "${name}" has non-finite choices.`);
      }
      continue;
    }
    if (!Number.isFinite(spec.min) || !Number.isFinite(spec.max)) {
      errors.push(`Variable "${name}" has non-finite min/max.`);
    } else if ((spec.max as number) < (spec.min as number)) {
      errors.push(`Variable "${name}" has max < min.`);
    } else if (spec.max === spec.min) {
      errors.push(`Variable "${name}" has a degenerate range (max === min) : the card would always roll the same numbers.`);
    }
  }
  const placeholders = archetype.questionTemplate?.match(/\{\{\s*([A-Za-z_$][\w$]*)\s*\}\}/g) || [];
  for (const ph of placeholders) {
    const name = ph.replace(/[{}]/g, '').trim();
    if (!declared.has(name)) {
      errors.push(`questionTemplate references "{{${name}}}" which is not declared in variables.`);
    }
  }
  // Every declared variable should appear somewhere in the question, formula,
  // or solution : otherwise it's dead weight and likely a template typo.
  for (const name of declared) {
    const used =
      archetype.questionTemplate.includes(`{{${name}}}`) ||
      archetype.stepByStepSolutionTemplate.includes(name) ||
      archetype.correctFormulaJs.includes(name);
    if (!used) errors.push(`Variable "${name}" is declared but never used.`);
  }

  // LaTeX delimiter balance in the solution template.
  const template = archetype.stepByStepSolutionTemplate || '';
  const opens = (template.match(/\\\(/g) || []).length;
  const closes = (template.match(/\\\)/g) || []).length;
  if (opens !== closes) {
    errors.push(`stepByStepSolutionTemplate has unbalanced \\( \\) delimiters (${opens} opens vs ${closes} closes).`);
  }
  const bOpens = (template.match(/\\\[/g) || []).length;
  const bCloses = (template.match(/\\\]/g) || []).length;
  if (bOpens !== bCloses) {
    errors.push(`stepByStepSolutionTemplate has unbalanced \\[ \\] delimiters (${bOpens} opens vs ${bCloses} closes).`);
  }
  return errors;
}

/**
 * Fully validates one archetype: structure, sandbox compilation, and
 * numerical draws checking finiteness and that the correct answer stays
 * distinguishable from every trap (and traps differ from each other) across
 * the whole declared variable space.
 */
export function validateProceduralArchetype(
  archetype: ProceduralMCQArchetype,
  trials: number = TRIALS_PER_FORMULA
): ValidationResult {
  const errors = structuralErrors(archetype);
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Numerical trials with a deterministic seed derived from the archetype id.
  const rng = mulberry32(hashString(archetype.id));
  const ctxs: Record<string, number>[] = [];
  for (let i = 0; i < trials; i++) {
    ctxs.push(rollVariables(archetype.variables, rng));
  }

  const allIssues: ProceduralValidationIssue[] = [];
  const correctFn = validateOneFormula(archetype.correctFormulaJs, 'correctFormulaJs', archetype, allIssues);
  if (!correctFn) {
    return { valid: false, errors: allIssues.map((i) => i.message) };
  }
  const correctValues = ctxs.map((ctx) => {
    const v = correctFn(ctx);
    if (v === null) errors.push(`correctFormulaJs produced a non-finite value at ${JSON.stringify(ctx)}.`);
    return v;
  });
  if (correctValues.every((v) => v !== null && v === correctValues[0])) {
    errors.push('correctFormulaJs returns a constant across the whole variable range : the card would not be procedural.');
  }

  const trapIssues: ProceduralValidationIssue[] = [];
  const trapFns = archetype.traps.map((trap, i) =>
    validateOneFormula(trap.formulaJs, `traps[${i}].formulaJs (${trap.trapName})`, archetype, trapIssues)
  );
  trapIssues.forEach((issue) => errors.push(issue.message));

  trapFns.forEach((trapFn, i) => {
    const trap = archetype.traps[i];
    if (!trapFn) return;
    ctxs.forEach((ctx, t) => {
      const trapVal = trapFn(ctx);
      if (trapVal === null) {
        errors.push(`Trap "${trap.trapName}" produced a non-finite value at ${JSON.stringify(ctx)}.`);
        return;
      }
      const correctVal = correctValues[t];
      if (correctVal === null) return;
      // A trap that always equals the answer is a broken card.
      if (valuesCollide(trapVal, correctVal)) {
        errors.push(
          `Trap "${trap.trapName}" equals the correct answer (${trapVal}) at ${JSON.stringify(ctx)} : distractor must differ.`
        );
      }
    });
  });

  // Traps must also differ from *each other*, or two buttons show one value.
  for (let i = 0; i < trapFns.length; i++) {
    for (let j = i + 1; j < trapFns.length; j++) {
      if (!trapFns[i] || !trapFns[j]) continue;
      ctxs.forEach((ctx, t) => {
        const a = trapFns[i]!(ctx);
        const b = trapFns[j]!(ctx);
        if (a === null || b === null) return;
        if (valuesCollide(a, b)) {
          errors.push(
            `Traps "${archetype.traps[i].trapName}" and "${archetype.traps[j].trapName}" collide on the same value (${a}) at ${JSON.stringify(ctx)}.`
          );
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validates a batch, producing per-archetype issue lists. */
export function validateProceduralArchetypes(
  archetypes: ProceduralMCQArchetype[],
  trials?: number
): ProceduralValidationReport {
  const issues: ProceduralValidationIssue[] = [];
  for (const archetype of archetypes) {
    const result = validateProceduralArchetype(archetype, trials);
    for (const message of result.errors) {
      issues.push({ archetypeId: archetype.id, field: '*', message });
    }
  }
  return { ok: issues.length === 0, issues, trialsRun: trials ?? TRIALS_PER_FORMULA };
}
