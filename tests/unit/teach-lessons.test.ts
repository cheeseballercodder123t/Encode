// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_SAVED_TEACH_LESSONS,
  SavedTeachLesson,
  clearSavedTeachLessons,
  deleteSavedTeachLesson,
  describeSavedTeachLesson,
  findSavedTeachLesson,
  loadSavedTeachLessons,
  saveTeachLesson,
  teachLessonId,
} from '@/lib/teach-lessons';
import { TeachLesson } from '@/lib/types';

function makeLesson(title: string, segments = 3): TeachLesson {
  return {
    title,
    segments: Array.from({ length: segments }, (_, i) => ({
      id: `s${i}`,
      type: 'concept' as const,
      body: `body ${i}`,
    })),
    encodingSeeds: [{ title: 'Stage A', prompt: 'Why?', exemplar: 'Because.' }],
  };
}

function makeEntry(id: string, savedAt: number, overrides: Partial<SavedTeachLesson> = {}): SavedTeachLesson {
  return {
    id,
    savedAt,
    scope: 'notes',
    topic: 'Action Potentials',
    stageIndex: 0,
    lesson: makeLesson(`Lesson ${id}`),
    segmentIndex: 1,
    xpEarned: 30,
    bestStreak: 2,
    completed: false,
    ...overrides,
  };
}

beforeEach(() => {
  clearSavedTeachLessons();
});

describe('saved Teach Me lessons', () => {
  it('starts empty and reports nothing to resume', () => {
    expect(loadSavedTeachLessons()).toEqual([]);
    expect(findSavedTeachLesson('notes', 'Action Potentials')).toBeNull();
  });

  it('round-trips a lesson through storage, newest first', () => {
    saveTeachLesson(makeEntry('notes::a', 100));
    saveTeachLesson(makeEntry('notes::b', 200));
    const loaded = loadSavedTeachLessons();
    expect(loaded.map((e) => e.id)).toEqual(['notes::b', 'notes::a']);
    expect(loaded[0].lesson.segments).toHaveLength(3);
  });

  it('replaces the entry for the same slot instead of stacking duplicates', () => {
    const id = teachLessonId('stage', 'Depolarization');
    saveTeachLesson(makeEntry(id, 100, { segmentIndex: 1 }));
    saveTeachLesson(makeEntry(id, 200, { segmentIndex: 4, xpEarned: 90 }));
    const loaded = loadSavedTeachLessons();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].segmentIndex).toBe(4);
    expect(loaded[0].savedAt).toBe(200);
  });

  it('finds the resumable lesson for a scope + topic slot', () => {
    saveTeachLesson(makeEntry(teachLessonId('notes', 'Action Potentials'), 100));
    saveTeachLesson(makeEntry(teachLessonId('stage', 'Depolarization'), 150));
    expect(findSavedTeachLesson('notes', 'Action Potentials')?.savedAt).toBe(100);
    expect(findSavedTeachLesson('stage', 'Depolarization')?.savedAt).toBe(150);
    expect(findSavedTeachLesson('schema', 'Action Potentials')).toBeNull();
  });

  it('normalizes the topic inside the slot id', () => {
    expect(teachLessonId('notes', '  Action  Potentials ')).toBe(teachLessonId('notes', 'action  potentials'));
  });

  it('drops a single lesson and caps the library', () => {
    for (let i = 0; i < MAX_SAVED_TEACH_LESSONS + 4; i++) {
      saveTeachLesson(makeEntry(`notes::${i}`, 1000 + i));
    }
    const capped = loadSavedTeachLessons();
    expect(capped).toHaveLength(MAX_SAVED_TEACH_LESSONS);
    // The oldest entries are the ones dropped.
    expect(capped.some((e) => e.id === 'notes::0')).toBe(false);

    const remaining = deleteSavedTeachLesson(capped[0].id);
    expect(remaining.some((e) => e.id === capped[0].id)).toBe(false);
    expect(loadSavedTeachLessons().length).toBe(MAX_SAVED_TEACH_LESSONS - 1);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('encode.teachme.library.v1', '{not json');
    expect(loadSavedTeachLessons()).toEqual([]);
    localStorage.setItem('encode.teachme.library.v1', JSON.stringify([{ id: 'x' }, null, 7]));
    expect(loadSavedTeachLessons()).toEqual([]);
  });

  it('describes where a lesson stopped and what it left to encode', () => {
    const entry = makeEntry('notes::a', 100, { segmentIndex: 1, xpEarned: 45, completed: false });
    expect(describeSavedTeachLesson(entry)).toBe('stopped at 2/3 · 45 XP · 1 encode prompt');
    const done = makeEntry('notes::b', 100, { completed: true, xpEarned: 10 });
    expect(describeSavedTeachLesson(done)).toBe('lesson complete · 10 XP · 1 encode prompt');
  });
});
