import { 
  ComparativeDocumentAsset, 
  ComparativeSchemaReport, 
  AISettings 
} from './types';

export async function generateComparativeSchema(
  docA: ComparativeDocumentAsset,
  docB: ComparativeDocumentAsset,
  settings: AISettings
): Promise<ComparativeSchemaReport> {
  const res = await fetch('/api/synthesis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ docA, docB, settings }),
  });

  if (!res.ok) {
    const failure = await res.json().catch(() => null);
    throw new Error(failure?.error || 'Failed to synthesize multi-document comparison.');
  }

  return await res.json();
}
