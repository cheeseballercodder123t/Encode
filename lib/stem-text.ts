// ─── STEM notation in plain inputs ──────────────────────────────────────────
//
// A study tool for physics, chemistry and CS cannot ask for a mechanism in a
// plain box and then punish the learner for typing `r^4` or `->`. Nobody wants
// to fight a formula editor mid-recall either, so the fix is not a WYSIWYG
// editor: keep typing plain ASCII, show what it becomes.
//
// This is a RENDERER, not a parser and not a markup language, and it is
// deliberately conservative: braces are required for multi-character sub- and
// superscripts (so `snake_case` survives), and bare digits after a letter are
// never rewritten (so `H2O` and `gb2` are left exactly as typed). Anything it
// does not understand stays literal.
//
// Single pass, token by token: plain runs are HTML-escaped as they are copied,
// so a learner typing `<script>` gets text, and no replacement can run against
// text that a previous replacement produced.
//
// The RAW text is always what gets stored, graded and exported. The rendering
// exists only so the input stops fighting the notation.

const GREEK: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  zeta: 'ζ',
  eta: 'η',
  theta: 'θ',
  kappa: 'κ',
  lambda: 'λ',
  mu: 'μ',
  nu: 'ν',
  pi: 'π',
  rho: 'ρ',
  sigma: 'σ',
  tau: 'τ',
  phi: 'φ',
  chi: 'χ',
  psi: 'ψ',
  omega: 'ω',
  Delta: 'Δ',
  Omega: 'Ω',
  Sigma: 'Σ',
  Theta: 'Θ',
  Lambda: 'Λ',
  Phi: 'Φ',
  Psi: 'Ψ',
};

const OPERATOR_GLYPHS: Record<string, string> = {
  '<=>': '⇌',
  '<->': '↔',
  '->': '→',
  '<-': '←',
  '=>': '⇒',
  '<=': '≤',
  '>=': '≥',
  '!=': '≠',
  '~=': '≈',
  '...': '…',
};

/**
 * One regex, longest alternatives first so `<=>` can never be read as `<=`.
 * `\^` and `_` bodies require braces; the single-token superscript form is
 * limited to digits/signs.
 */
const TOKEN_RE =
  /\\sqrt\{[^}]{1,40}\}|\\[A-Za-z]{2,12}|\^\{[^}]{1,20}\}|_\{[^}]{1,20}\}|[A-Za-z0-9)\]]\^[-+]?\d|<=>|<->|->|<-|=>|<=|>=|!=|~=|\.\.\./g;

function escapeHtml(input: string): string {
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Rendered HTML for one token, or null when it should stay literal text. */
function renderToken(token: string): string | null {
  let m = /^\\sqrt\{([^}]{1,40})\}$/.exec(token);
  if (m) return `√(${escapeHtml(m[1])})`;

  m = /^\\([A-Za-z]{2,12})$/.exec(token);
  if (m) return GREEK[m[1]] ?? null; // unknown command: leave it as typed

  m = /^\^\{([^}]{1,20})\}$/.exec(token);
  if (m) return `<sup>${escapeHtml(m[1])}</sup>`;

  m = /^_\{([^}]{1,20})\}$/.exec(token);
  if (m) return `<sub>${escapeHtml(m[1])}</sub>`;

  m = /^([A-Za-z0-9)\]])\^([-+]?\d)$/.exec(token);
  if (m) return `${escapeHtml(m[1])}<sup>${m[2]}</sup>`;

  return OPERATOR_GLYPHS[token] ?? null;
}

/** How many notations the text actually uses (0 = plain prose). */
export function stemNotationCount(input: string): number {
  if (!input) return 0;
  let count = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(input)) !== null) {
    if (renderToken(m[0]) !== null) count++;
  }
  return count;
}

/** True when the field is carrying notation rather than prose. */
export function isStemContent(input: string): boolean {
  return stemNotationCount(input) > 0;
}

/**
 * Renders plain-ASCII STEM notation to HTML.
 *
 *   `^{...}` / `_{...}`   superscript / subscript (braces required for bodies
 *                         longer than one character)
 *   `x^2`                 single-token superscript
 *   `\alpha` … `\Omega`   greek letters by name
 *   `\sqrt{...}`          square root
 *   `->` `<-` `<->` `<=>` `=>` `<=` `>=` `!=` `~=` `...`
 */
export function renderStemText(input: string): string {
  if (!input) return '';
  let out = '';
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(input)) !== null) {
    const rendered = renderToken(m[0]);
    if (rendered === null) continue; // part of the plain run that follows
    out += escapeHtml(input.slice(last, m.index)) + rendered;
    last = m.index + m[0].length;
  }
  return out + escapeHtml(input.slice(last));
}
