import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateComparativeSchema } from '@/lib/comparative-synthesis';
import { POST as synthesisRoute } from '@/app/api/synthesis/route';
import { NextRequest } from 'next/server';
import type { ComparativeDocumentAsset, AISettings } from '@/lib/types';

describe('Comparative Synthesis', () => {
  const mockDocA: ComparativeDocumentAsset = {
    id: 'doc-a',
    name: 'Lecture Slides',
    contentSnippet: 'Action potentials are driven by voltage-gated Na+ and K+ channels.',
  };

  const mockDocB: ComparativeDocumentAsset = {
    id: 'doc-b',
    name: 'Textbook Chapter',
    contentSnippet: 'The Nernst and Goldman equations govern the membrane potential equilibrium.',
  };

  const mockSettings: AISettings = {
    provider: 'gemini',
    geminiModel: 'gemini-3.7-flash',
  };

  describe('generateComparativeSchema client function', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('successfully calls /api/synthesis and returns report', async () => {
      const mockReport = {
        synthesisTitle: 'Comparative Synthesis: Lecture Slides vs Textbook Chapter',
        docAName: 'Lecture Slides',
        docBName: 'Textbook Chapter',
        agreedCorePrinciples: ['Membrane potential is ion-driven'],
        contradictions: [],
        complements: [],
        unifiedMatrix: [],
      };

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockReport,
      }));

      const report = await generateComparativeSchema(mockDocA, mockDocB, mockSettings);
      expect(report).toEqual(mockReport);
      expect(fetch).toHaveBeenCalledWith('/api/synthesis', expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }));
    });

    it('throws error when /api/synthesis returns non-ok status', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ error: 'Model quota exhausted' }),
      }));

      await expect(
        generateComparativeSchema(mockDocA, mockDocB, mockSettings)
      ).rejects.toThrow('Model quota exhausted');
    });
  });

  describe('/api/synthesis route handler', () => {
    it('returns 400 when docA or docB is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docA: null, docB: mockDocB }),
      });

      const res = await synthesisRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Both Document A and Document B must be provided');
    });
  });
});
