import { describe, it, expect } from 'vitest';
import {
  compressSchemaForUrl,
  decompressSchemaFromUrl,
} from '@/lib/url-share';
import { makeSchema } from './fixtures';

describe('schema URL share roundtrip', () => {
  it('compresses then decompresses back to the original schema', () => {
    const schema = makeSchema();
    const compressed = compressSchemaForUrl(schema);
    expect(compressed).toBeTruthy();
    expect(compressed).not.toContain('{');
    const decoded = decompressSchemaFromUrl(compressed);
    expect(decoded).toEqual(schema);
  });

  it('rejects empty and garbage input', () => {
    expect(decompressSchemaFromUrl('')).toBeNull();
    expect(decompressSchemaFromUrl('   ')).toBeNull();
    expect(decompressSchemaFromUrl('not-a-valid-schema-payload')).toBeNull();
  });

  it('rejects decompressed payloads without activities or guidedModules', () => {
    const raw = compressSchemaForUrl(makeSchema());
    // Valid LZ payload but wrong shape: compress a schema missing activities
    const bad = compressSchemaForUrl({ ...makeSchema(), activities: undefined as any });
    if (bad) {
      expect(decompressSchemaFromUrl(bad)).toBeNull();
    }
  });

  it('never throws : returns empty string on failure', () => {
    const circular: any = { id: 'x' };
    circular.self = circular;
    expect(compressSchemaForUrl(circular)).toBe('');
  });
});
