// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildForgeRecipe,
  clearForgeRecipes,
  deleteForgeRecipe,
  describeForgeRecipe,
  forgeRecipeId,
  loadForgeRecipes,
  markForgeRecipeRun,
  saveForgeRecipe,
} from '@/lib/forge-recipes';

const draft = {
  name: 'Monday lectures',
  sections: ['facts', 'drills'],
  target: 'remnote' as const,
  sources: [
    { kind: 'text' as const, label: 'Renal notes', notes: 'Loop of Henle countercurrent multiplication.' },
    { kind: 'youtube' as const, label: 'https://youtu.be/dQw4w9WgXcQ', url: 'https://youtu.be/dQw4w9WgXcQ' },
    { kind: 'file' as const, label: 'handout.pdf' },
  ],
};

beforeEach(() => clearForgeRecipes());

describe('buildForgeRecipe', () => {
  it('stores text and video sources whole, and files by name only', () => {
    const recipe = buildForgeRecipe(draft)!;
    expect(recipe.name).toBe('Monday lectures');
    expect(recipe.sections).toEqual(['facts', 'drills']);
    expect(recipe.target).toBe('remnote');
    expect(recipe.sources[0].notes).toBe('Loop of Henle countercurrent multiplication.');
    expect(recipe.sources[1].url).toBe('https://youtu.be/dQw4w9WgXcQ');
    // A PDF is not going into localStorage; its name is what the recipe keeps.
    expect(recipe.sources[2].notes).toBeUndefined();
    expect(recipe.fileNames).toEqual(['handout.pdf']);
  });

  it('defaults the name and the sections rather than saving an unusable recipe', () => {
    const recipe = buildForgeRecipe({ ...draft, name: '  ', sections: [] })!;
    expect(recipe.name).toBe('Untitled recipe');
    expect(recipe.sections).toEqual(['facts', 'mechanisms', 'drills', 'examples']);
  });

  it('refuses a setup with no sources', () => {
    expect(buildForgeRecipe({ ...draft, sources: [] })).toBeNull();
  });

  it('keeps the id and creation time when a recipe is updated', () => {
    const first = buildForgeRecipe(draft)!;
    const second = buildForgeRecipe({ ...draft, sections: ['facts'] }, first)!;
    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.sections).toEqual(['facts']);
  });

  it('slugifies ids', () => {
    expect(forgeRecipeId('Monday lectures!')).toBe('recipe-monday-lectures');
    expect(forgeRecipeId('')).toBe('recipe-unnamed');
  });
});

describe('the recipe store', () => {
  it('round-trips through localStorage, newest first', () => {
    saveForgeRecipe(buildForgeRecipe(draft)!);
    saveForgeRecipe(buildForgeRecipe({ ...draft, name: 'Wednesday reading' })!);
    const recipes = loadForgeRecipes();
    expect(recipes.map((r) => r.name)).toEqual(['Wednesday reading', 'Monday lectures']);
  });

  it('upserts by id instead of duplicating', () => {
    const recipe = buildForgeRecipe(draft)!;
    saveForgeRecipe(recipe);
    saveForgeRecipe(recipe);
    expect(loadForgeRecipes()).toHaveLength(1);
  });

  it('deletes by id', () => {
    const recipe = buildForgeRecipe(draft)!;
    saveForgeRecipe(recipe);
    expect(deleteForgeRecipe(recipe.id)).toHaveLength(0);
    expect(loadForgeRecipes()).toHaveLength(0);
  });

  it('counts runs', () => {
    const recipe = buildForgeRecipe(draft)!;
    saveForgeRecipe(recipe);
    const [updated] = markForgeRecipeRun(recipe.id);
    expect(updated.runs).toBe(1);
    expect(loadForgeRecipes()[0].runs).toBe(1);
  });

  it('ignores stored junk', () => {
    window.localStorage.setItem('encode.forge-recipes.v1', JSON.stringify([{ nope: true }, null, draft]));
    const recipes = loadForgeRecipes();
    // The raw draft has no id/createdAt, so it is repaired rather than dropped.
    expect(recipes).toHaveLength(1);
    expect(recipes[0].sources).toHaveLength(3);
  });
});

describe('describeForgeRecipe', () => {
  it('reads as one line for the recipe row', () => {
    const recipe = buildForgeRecipe(draft)!;
    expect(describeForgeRecipe(recipe)).toBe(
      '3 sources · facts, drills · REMNOTE · 1 file to re-attach'
    );
    expect(describeForgeRecipe({ ...recipe, target: 'both', runs: 4 })).toBe(
      '3 sources · facts, drills · ANKI + REMNOTE · 4 runs · 1 file to re-attach'
    );
  });
});
