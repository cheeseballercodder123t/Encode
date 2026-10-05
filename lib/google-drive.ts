import { UploadedFileAsset } from './types';
import firebaseConfig from '../firebase-applet-config.json';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  thumbnailLink?: string;
  iconLink?: string;
  size?: string;
  modifiedTime?: string;
}

const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';

/**
 * Dynamically loads Google Identity Services (GIS) script
 */
export function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject('Window unavailable');
    if ((window as any).google?.accounts?.oauth2) {
      return resolve();
    }
    const existingScript = document.getElementById('gsi-script');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', (e) => reject(e));
      return;
    }

    const script = document.createElement('script');
    script.id = 'gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });
}

/**
 * Requests an access token for Google Drive via Google Identity Services
 */
export async function requestDriveAccessToken(clientId?: string): Promise<string> {
  await loadGsiScript();

  return new Promise((resolve, reject) => {
    const effectiveClientId = 
      clientId || 
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || 
      (firebaseConfig as any).oAuthClientId || 
      '';
    
    if (!effectiveClientId) {
      // Prompt user for token or manual client ID if not hardcoded
      const storedToken = sessionStorage.getItem('deepencode_gdrive_token');
      if (storedToken) {
        return resolve(storedToken);
      }
    }

    try {
      const client = (window as any).google?.accounts?.oauth2?.initTokenClient({
        client_id: effectiveClientId,
        scope: DRIVE_READONLY_SCOPE,
        callback: (response: any) => {
          if (response.error) {
            reject(new Error(response.error_description || response.error));
          } else if (response.access_token) {
            sessionStorage.setItem('deepencode_gdrive_token', response.access_token);
            resolve(response.access_token);
          } else {
            reject(new Error('No access token returned from Google authentication'));
          }
        },
      });

      if (!client) {
        throw new Error('Failed to initialize Google OAuth token client');
      }

      client.requestAccessToken();
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Lists PDF slides, documents, and images from user's Google Drive
 */
export async function fetchDriveFiles(accessToken: string, searchQuery: string = ''): Promise<DriveFileItem[]> {
  const mimeFilter = `(mimeType = 'application/pdf' or mimeType contains 'image/' or mimeType contains 'presentation' or mimeType contains 'document')`;
  const searchFilter = searchQuery ? ` and name contains '${searchQuery.replace(/'/g, "\\'")}'` : '';
  const q = `${mimeFilter} and trashed = false${searchFilter}`;

  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    q
  )}&fields=files(id,name,mimeType,thumbnailLink,iconLink,size,modifiedTime)&pageSize=35&orderBy=modifiedTime%20desc`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      sessionStorage.removeItem('deepencode_gdrive_token');
      throw new Error('Google Drive access token expired or invalid. Please reconnect.');
    }
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Google Drive API error (${response.status})`);
  }

  const data = await response.json();
  return data.files || [];
}

/** Docs-editor files have no bytes of their own; they live under this prefix. */
const GOOGLE_NATIVE_PREFIX = 'application/vnd.google-apps.';

/** The format each Docs-editor type is exported as (the export must name one). */
const GOOGLE_EXPORT_MIME: Record<string, string> = {
  'application/vnd.google-apps.document': 'application/pdf',
  'application/vnd.google-apps.presentation': 'application/pdf',
  'application/vnd.google-apps.spreadsheet': 'application/pdf',
  'application/vnd.google-apps.drawing': 'image/png',
};

export interface DriveDownloadTarget {
  /** The URL to GET for this file's bytes. */
  url: string;
  /** The type those bytes will actually be (so the asset is labelled truthfully). */
  mimeType: string;
  /** True when the bytes come from Drive's export endpoint, not `alt=media`. */
  exported: boolean;
}

/**
 * Where the bytes of a Drive file actually come from.
 *
 * A Docs-editor file (Google Slides / Docs / Sheets / Drawings) has no binary
 * content to fetch: `files.get?alt=media` answers HTTP 403
 * `fileNotDownloadable` for it ("Use Export with Docs Editors files"). Since
 * `fetchDriveFiles` lists `mimeType contains 'presentation' or 'document'`, a
 * student's own lecture deck was offered in the picker and then failed on every
 * click. Those files only come out through the export endpoint, which has to
 * name a target format. Everything else is an ordinary binary file — including
 * the PDFs and images this modal is mostly for.
 */
export function driveDownloadTarget(file: Pick<DriveFileItem, 'id' | 'mimeType'>): DriveDownloadTarget {
  const base = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}`;
  const native = (file.mimeType || '').toLowerCase();

  if (native.startsWith(GOOGLE_NATIVE_PREFIX)) {
    const exportMime = GOOGLE_EXPORT_MIME[native] || 'application/pdf';
    return {
      url: `${base}/export?mimeType=${encodeURIComponent(exportMime)}`,
      mimeType: exportMime,
      exported: true,
    };
  }

  // A real file: fetch the bytes directly. Images keep their own type so the
  // caller can build a preview data URL; everything else is treated as a PDF.
  return {
    url: `${base}?alt=media`,
    mimeType: native.startsWith('image/') ? native : 'application/pdf',
    exported: false,
  };
}

/**
 * Downloads a file from Google Drive and returns an UploadedFileAsset ready for Gemini
 */
export async function downloadDriveFileToAsset(
  fileItem: DriveFileItem,
  accessToken: string
): Promise<UploadedFileAsset> {
  const target = driveDownloadTarget(fileItem);

  const response = await fetch(target.url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    // The API's own message names the fix (a Docs-editor file that cannot be
    // exported, a permissions problem, a revoked scope); a bare "failed" hides
    // which of those it was.
    const errData = await response.json().catch(() => ({}));
    const detail = errData?.error?.message || `HTTP ${response.status}`;
    throw new Error(`Failed to download ${fileItem.name} from Google Drive (${detail}).`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Data = btoa(binary);

  const mimeType = target.mimeType;

  const previewUrl = mimeType.startsWith('image/')
    ? `data:${mimeType};base64,${base64Data}`
    : undefined;

  return {
    name: fileItem.name,
    type: mimeType,
    size: Number(fileItem.size) || arrayBuffer.byteLength,
    base64Data,
    previewUrl,
  };
}
