import { UploadedFileAsset } from './types';

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
    const effectiveClientId = clientId || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
    
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

/**
 * Downloads a file from Google Drive and returns an UploadedFileAsset ready for Gemini
 */
export async function downloadDriveFileToAsset(
  fileItem: DriveFileItem,
  accessToken: string
): Promise<UploadedFileAsset> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileItem.id}?alt=media`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download ${fileItem.name} from Google Drive.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64Data = btoa(binary);

  // Determine standard mime type
  let mimeType = fileItem.mimeType;
  if (mimeType.includes('pdf')) {
    mimeType = 'application/pdf';
  } else if (!mimeType.startsWith('image/')) {
    mimeType = 'application/pdf'; // fallback default
  }

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
