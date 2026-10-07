import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST as forgeRoute } from '@/app/api/forge/route';
import { NextRequest } from 'next/server';

const mockReport = {
  topic: 'AP Chemistry',
  declarativeFacts: [
    { id: 'f1', factStatement: 'Le Chatelier principle predicts equilibrium shifts.', clozeSuggestion: 'shifts {{equilibrium}}' }
  ],
  conceptualMechanisms: [],
  practiceQuestions: [],
  workedExamples: [],
};

const mockGenerateJSON = vi.fn().mockResolvedValue(mockReport);

vi.mock('@/lib/ai-client', () => ({
  generateJSONWithProvider: (...args: any[]) => mockGenerateJSON(...args),
}));

describe('/api/forge Route Handlers', () => {
  beforeEach(() => {
    mockGenerateJSON.mockReset();
    mockGenerateJSON.mockResolvedValue(mockReport);
  });

  it('accepts array include sections and processes text sources', async () => {
    const req = new NextRequest('http://localhost:3000/api/forge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: [
          {
            id: 'src_1',
            kind: 'text',
            label: 'Reaction Kinetics Notes',
            notes: 'Rate law determines reaction order from experimental data.',
          },
        ],
        include: ['facts', 'mechanisms', 'drills', 'examples'],
        settings: { provider: 'gemini' },
      }),
    });

    const res = await forgeRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources).toHaveLength(1);
    expect(data.sources[0].status).toBe('ok');
    expect(data.sources[0].label).toBe('Reaction Kinetics Notes');
  });

  it('infers MIME type for uploaded file with missing type without failing', async () => {
    const pdfBase64 = Buffer.from('%PDF-1.4 mock pdf content').toString('base64');
    const req = new NextRequest('http://localhost:3000/api/forge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: [
          {
            id: 'src_pdf',
            kind: 'file',
            label: 'handout.pdf',
            file: {
              name: 'handout.pdf',
              type: '', // Empty MIME type from browser
              size: 1024,
              base64Data: pdfBase64,
            },
          },
        ],
        include: ['facts'],
      }),
    });

    const res = await forgeRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources).toHaveLength(1);
    expect(data.sources[0].status).toBe('ok');
    expect(data.sources[0].note).toBeUndefined();
  });

  it('decodes text file base64 data into notes when notes field is empty', async () => {
    const textBase64 = Buffer.from('Gibbs free energy delta G = delta H - T delta S.').toString('base64');
    const req = new NextRequest('http://localhost:3000/api/forge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: [
          {
            id: 'src_text_file',
            kind: 'file',
            label: 'thermo.txt',
            file: {
              name: 'thermo.txt',
              type: 'text/plain',
              size: 50,
              base64Data: textBase64,
            },
          },
        ],
        include: ['facts'],
      }),
    });

    const res = await forgeRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources).toHaveLength(1);
    expect(data.sources[0].status).toBe('ok');
  });

  it('reports empty source honestly when truly empty', async () => {
    const req = new NextRequest('http://localhost:3000/api/forge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sources: [
          {
            id: 'src_empty',
            kind: 'text',
            label: 'Empty notes',
            notes: '   ',
          },
        ],
        include: ['facts'],
      }),
    });

    const res = await forgeRoute(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.sources).toHaveLength(1);
    expect(data.sources[0].status).toBe('failed');
    expect(data.sources[0].note).toBe('Empty text source.');
  });
});
