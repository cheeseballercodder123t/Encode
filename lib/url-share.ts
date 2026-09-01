import LZString from 'lz-string';
import { SavedSchema } from './types';

/**
 * Compresses a complete SavedSchema object into a URL-safe Base64-like string
 * using LZ-based compression.
 */
export function compressSchemaForUrl(schema: SavedSchema): string {
  try {
    // Strip large binary blobs or unnecessary temporary fields if any to keep URL concise
    const cleanSchema = {
      ...schema,
      // If activities have bulky temporary data, keep only essential schema
    };
    const jsonStr = JSON.stringify(cleanSchema);
    return LZString.compressToEncodedURIComponent(jsonStr);
  } catch (err) {
    console.error('Failed to compress schema for URL:', err);
    return '';
  }
}

/**
 * Decompresses a URL-safe compressed string back into a full SavedSchema object.
 */
export function decompressSchemaFromUrl(compressed: string): SavedSchema | null {
  try {
    if (!compressed || compressed.trim().length === 0) return null;
    const jsonStr = LZString.decompressFromEncodedURIComponent(compressed);
    if (!jsonStr) return null;
    
    const parsed = JSON.parse(jsonStr) as SavedSchema;
    if (!parsed || (!parsed.activities && !parsed.guidedModules)) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.error('Failed to decompress schema from URL:', err);
    return null;
  }
}

/**
 * Generates the full shareable URL for the current window location
 */
export function generateStatelessShareUrl(schema: SavedSchema): string {
  const compressed = compressSchemaForUrl(schema);
  if (!compressed) return '';

  if (typeof window !== 'undefined') {
    const origin = window.location.origin + window.location.pathname;
    return `${origin}?share=${compressed}`;
  }
  return `?share=${compressed}`;
}
