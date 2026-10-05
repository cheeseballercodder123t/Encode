import { describe, it, expect } from 'vitest';
import { driveDownloadTarget } from '@/lib/google-drive';

/**
 * A Docs-editor file (Google Slides / Docs / Sheets) has no bytes of its own:
 * `files.get?alt=media` answers HTTP 403 `fileNotDownloadable` for it ("Use
 * Export with Docs Editors files"). Because `fetchDriveFiles` lists
 * `mimeType contains 'presentation' or 'document'`, a student's own lecture deck
 * appeared in the picker and then failed on every click. These pin the target
 * each listed file type actually resolves to.
 */
describe('driveDownloadTarget', () => {
  it('exports a Google Slides deck as PDF instead of asking for bytes that do not exist', () => {
    const target = driveDownloadTarget({ id: 'deck1', mimeType: 'application/vnd.google-apps.presentation' });
    expect(target.exported).toBe(true);
    expect(target.url).toBe(
      'https://www.googleapis.com/drive/v3/files/deck1/export?mimeType=application%2Fpdf'
    );
    expect(target.url).not.toContain('alt=media');
    expect(target.mimeType).toBe('application/pdf');
  });

  it('exports a Google Doc the same way (the picker lists documents too)', () => {
    const target = driveDownloadTarget({ id: 'doc1', mimeType: 'application/vnd.google-apps.document' });
    expect(target.exported).toBe(true);
    expect(target.url).toContain('/export?mimeType=application%2Fpdf');
    expect(target.url).not.toContain('alt=media');
  });

  it('exports a native drawing as PNG so it keeps a preview', () => {
    const target = driveDownloadTarget({ id: 'draw1', mimeType: 'application/vnd.google-apps.drawing' });
    expect(target.exported).toBe(true);
    expect(target.mimeType).toBe('image/png');
    expect(target.url).toContain('mimeType=image%2Fpng');
  });

  it('falls back to a PDF export for any other Docs-editor type', () => {
    const target = driveDownloadTarget({ id: 'form1', mimeType: 'application/vnd.google-apps.form' });
    expect(target.exported).toBe(true);
    expect(target.mimeType).toBe('application/pdf');
  });

  it('downloads an uploaded .pptx directly and labels it as the PDF asset', () => {
    const target = driveDownloadTarget({
      id: 'ppt1',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    });
    expect(target).toEqual({
      url: 'https://www.googleapis.com/drive/v3/files/ppt1?alt=media',
      mimeType: 'application/pdf',
      exported: false,
    });
  });

  it('keeps a native image as a direct download with its own type', () => {
    const target = driveDownloadTarget({ id: 'img1', mimeType: 'image/png' });
    expect(target.exported).toBe(false);
    expect(target.mimeType).toBe('image/png');
    expect(target.url).toBe('https://www.googleapis.com/drive/v3/files/img1?alt=media');
  });

  it('encodes the file id in the URL', () => {
    expect(driveDownloadTarget({ id: 'a/b c', mimeType: 'application/pdf' }).url).toContain(
      'files/a%2Fb%20c'
    );
  });

  it('treats a missing mime type as an opaque PDF download', () => {
    const target = driveDownloadTarget({ id: 'x1', mimeType: '' });
    expect(target.exported).toBe(false);
    expect(target.mimeType).toBe('application/pdf');
  });
});
