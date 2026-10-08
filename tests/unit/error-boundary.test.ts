import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

/**
 * The root error boundary is the difference between a contained failure and a
 * dead app: defect 25 (a legacy history record read during render) produced
 * Next's `Application error: a client-side exception has occurred` because
 * `app/error.tsx` did not exist, and the control that would have cleared the bad
 * data lived inside the surface that had just crashed.
 *
 * This is a source contract, not a rendered test - this repo has no
 * `@testing-library/react`, and a boundary cannot be exercised by importing it.
 * The browser proof is a controlled throw (recorded in the audit report); what
 * this file pins is the part that would silently rot: a boundary that never
 * gets added back, or one that reads persisted data and therefore throws while
 * rendering the fallback - the same bug, one layer up.
 */
const boundaryPath = path.join(process.cwd(), 'app', 'error.tsx');

describe('app/error.tsx', () => {
  it('exists and is a client component', () => {
    expect(existsSync(boundaryPath)).toBe(true);
    expect(readFileSync(boundaryPath, 'utf8').trimStart().startsWith("'use client'")).toBe(true);
  });

  it('takes the error and the reset it is handed, and offers both recoveries', () => {
    const source = readFileSync(boundaryPath, 'utf8');
    // The App Router contract: `{ error, reset }` on the default export.
    expect(source).toMatch(/export default function Error\(\{\s*error,\s*reset,?\s*\}:?\s*\{/);
    // A retry wired to `reset` (re-renders the segment) ...
    expect(source).toMatch(/onClick=\{reset\}/);
    // ... and a way out that does not depend on the client state that threw.
    expect(source).toMatch(/href="\/"/);
  });

  it('logs what it caught, because this is the only place that knows', () => {
    expect(readFileSync(boundaryPath, 'utf8')).toMatch(/console\.error\(/);
  });

  it('cannot throw while rendering the fallback: it reads no persisted data', () => {
    const source = readFileSync(boundaryPath, 'utf8');
    expect(source).not.toMatch(/localStorage|indexedDB|JSON\.parse/);
    // No app modules at all: a boundary that imports the data layer can fail for
    // the same reason the screen it is rescuing did.
    expect(source).not.toMatch(/from '@\/lib\//);
  });
});
