import type { ForgeExportTarget, ForgeSourceKind } from './services/forge';

// ─── Forge recipes: the weekly ingest, one click away ───────────────────────
//
// The forge's real use case is repetition: the same four sources, the same
// sections, the same destination, every week. Rebuilding that setup by hand is
// the tax on using it at all, so a recipe stores the SETUP (which sources,
// which sections, where the deck goes) and nothing else.
//
// Files are the one thing that cannot be remembered: a recipe keeps their names
// so it can ask for them back, but not their bytes — a lecture PDF has no
// business living in localStorage. Text and video sources are stored whole.

export type ForgeRecipeSourceKind = ForgeSourceKind;

export interface ForgeRecipeSource {
  kind: ForgeRecipeSourceKind;
  label: string;
  /** Text sources keep their body; files only keep their name. */
  notes?: string;
  url?: string;
}

export interface ForgeRecipe {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  sections: string[];
  target: ForgeExportTarget;
  sources: ForgeRecipeSource[];
  /** Names of file sources the learner has to re-attach when they run it. */
  fileNames: string[];
  /** How many times this recipe has been forged. */
  runs: number;
}

const STORAGE_KEY = 'encode.forge-recipes.v1';
const MAX_RECIPES = 12;
const MAX_SOURCES_PER_RECIPE = 12;

export interface ForgeRecipeDraft {
  name?: string;
  sections: string[];
  target: ForgeExportTarget;
  sources: { kind: ForgeRecipeSourceKind; label: string; notes?: string; url?: string }[];
}

function asRecipe(value: any, id: string): ForgeRecipe | null {
  if (!value || typeof value !== 'object') return null;
  const sources: ForgeRecipeSource[] = (Array.isArray(value.sources) ? value.sources : [])
    .filter((s: any) => s && typeof s === 'object' && ['text', 'file', 'youtube'].includes(s.kind))
    .map((s: any) => ({
      kind: s.kind,
      label: typeof s.label === 'string' ? s.label.slice(0, 120) : 'source',
      notes: typeof s.notes === 'string' ? s.notes : undefined,
      url: typeof s.url === 'string' ? s.url : undefined,
    }))
    .slice(0, MAX_SOURCES_PER_RECIPE);
  if (sources.length === 0) return null;

  const target: ForgeExportTarget =
    value.target === 'remnote' || value.target === 'both' ? value.target : 'anki';

  return {
    id: typeof value.id === 'string' && value.id ? value.id : id,
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim().slice(0, 60) : 'Untitled recipe',
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : 0,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    sections: (Array.isArray(value.sections) ? value.sections : []).filter((s: any) => typeof s === 'string'),
    target,
    sources,
    fileNames: (Array.isArray(value.fileNames) ? value.fileNames : [])
      .filter((n: any) => typeof n === 'string')
      .slice(0, MAX_SOURCES_PER_RECIPE),
    runs: typeof value.runs === 'number' ? value.runs : 0,
  };
}

export function loadForgeRecipes(): ForgeRecipe[] {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.recipes) ? parsed.recipes : [];
    return list
      .map((value: any, index: number) => asRecipe(value, `recipe_${index + 1}`))
      .filter((recipe: ForgeRecipe | null): recipe is ForgeRecipe => recipe !== null)
      .sort((a: ForgeRecipe, b: ForgeRecipe) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_RECIPES);
  } catch {
    return [];
  }
}

function writeRecipes(recipes: ForgeRecipe[]): ForgeRecipe[] {
  const trimmed = [...recipes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_RECIPES);
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Storage unavailable/full: a recipe is a convenience, never a blocker.
    }
  }
  return trimmed;
}

export function forgeRecipeId(name: string): string {
  const slug = (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
  return `recipe-${slug || 'unnamed'}`;
}

/**
 * Turns the modal's current setup into a recipe. File sources are reduced to
 * their names — a recipe has to survive a reload, and a PDF does not fit.
 */
export function buildForgeRecipe(draft: ForgeRecipeDraft, existing?: ForgeRecipe | null): ForgeRecipe | null {
  const sources = (draft.sources || [])
    .slice(0, MAX_SOURCES_PER_RECIPE)
    .map((source) => ({
      kind: source.kind,
      label: source.label,
      notes: source.kind === 'file' ? undefined : source.notes,
      url: source.kind === 'file' ? undefined : source.url,
    }));
  if (sources.length === 0) return null;

  const name = ((draft.name || '').trim() || existing?.name || 'Untitled recipe').trim().slice(0, 60);
  const now = Date.now();
  return {
    id: existing?.id || forgeRecipeId(name),
    name,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    sections: draft.sections.length > 0 ? draft.sections : ['facts', 'mechanisms', 'drills', 'examples'],
    target: draft.target,
    sources,
    fileNames: sources.filter((s) => s.kind === 'file').map((s) => s.label),
    runs: existing?.runs || 0,
  };
}

/** Upsert by id, so saving the same recipe twice does not duplicate it. */
export function saveForgeRecipe(recipe: ForgeRecipe): ForgeRecipe[] {
  const existing = loadForgeRecipes().filter((r) => r.id !== recipe.id);
  return writeRecipes([recipe, ...existing]);
}

export function deleteForgeRecipe(id: string): ForgeRecipe[] {
  return writeRecipes(loadForgeRecipes().filter((r) => r.id !== id));
}

export function markForgeRecipeRun(id: string): ForgeRecipe[] {
  const recipes = loadForgeRecipes().map((recipe) =>
    recipe.id === id ? { ...recipe, runs: recipe.runs + 1, updatedAt: Date.now() } : recipe
  );
  return writeRecipes(recipes);
}

export function clearForgeRecipes(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** `3 sources · facts, drills · ANKI · 4 runs` — one line per recipe row. */
export function describeForgeRecipe(recipe: ForgeRecipe): string {
  const sections = recipe.sections.length > 0 ? recipe.sections.join(', ') : 'no sections';
  const target = recipe.target === 'both' ? 'ANKI + REMNOTE' : recipe.target.toUpperCase();
  const runs = recipe.runs > 0 ? ` · ${recipe.runs} run${recipe.runs === 1 ? '' : 's'}` : '';
  const files = recipe.fileNames.length > 0 ? ` · ${recipe.fileNames.length} file${recipe.fileNames.length === 1 ? '' : 's'} to re-attach` : '';
  return `${recipe.sources.length} source${recipe.sources.length === 1 ? '' : 's'} · ${sections} · ${target}${runs}${files}`;
}

export { STORAGE_KEY as FORGE_RECIPES_STORAGE_KEY, MAX_RECIPES as MAX_FORGE_RECIPES };
