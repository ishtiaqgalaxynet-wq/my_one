import { clearCachedDriveAccessToken } from './firebase';

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
export const KINGDOM_DRIVE_FOLDER_NAME = 'Princess Kingdom Media';

let cachedFolderId: string | null = null;

export interface DriveMediaFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime?: string;
  kind: 'image' | 'video' | 'audio';
  url: string;
}

export interface DriveUploadResult {
  fileId: string;
  url: string;
  name: string;
  mimeType: string;
  byteLength: number;
}

export function getDriveMediaProxyUrl(fileId: string): string {
  return `/api/drive/file/${encodeURIComponent(fileId)}`;
}

export function extractDriveFileId(value: string | undefined | null): string | null {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return null;

  const proxyMatch = /^\/api\/drive\/file\/([a-zA-Z0-9_-]{10,120})(?:\?.*)?$/.exec(trimmed);
  if (proxyMatch) return proxyMatch[1];

  const filePathMatch = /drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]{10,120})/i.exec(trimmed);
  if (filePathMatch) return filePathMatch[1];

  const ucIdMatch = /[?&]id=([a-zA-Z0-9_-]{10,120})/i.exec(trimmed);
  if (ucIdMatch && trimmed.includes('google.com')) return ucIdMatch[1];

  return null;
}

function classifyMimeKind(mimeType: string): 'image' | 'video' | 'audio' {
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'image';
}

async function handleDriveErrorResponse(res: Response, fallbackMsg: string): Promise<never> {
  if (res.status === 401) {
    clearCachedDriveAccessToken();
    cachedFolderId = null;
    throw new Error('Google Drive session expired. Please click Connect Google Drive to sign in again.');
  }

  let detail = '';
  try {
    const json = (await res.json()) as { error?: { message?: string } };
    detail = json?.error?.message || '';
  } catch {
    // Ignore parse error
  }

  if (res.status === 403 && /insufficient|scope|permission/i.test(detail)) {
    clearCachedDriveAccessToken();
    cachedFolderId = null;
    throw new Error('Google Drive permission is missing. Please reconnect Google Drive and allow file access.');
  }

  throw new Error(detail ? `Google Drive: ${detail}` : `${fallbackMsg} (${res.status})`);
}

export async function ensureKingdomDriveFolder(accessToken: string): Promise<string> {
  if (cachedFolderId) {
    const verifyRes = await fetch(
      `${DRIVE_API_BASE}/files/${encodeURIComponent(cachedFolderId)}?fields=id,trashed`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (verifyRes.ok) {
      const data = (await verifyRes.json()) as { id?: string; trashed?: boolean };
      if (data.id && !data.trashed) {
        return data.id;
      }
    }
    cachedFolderId = null;
  }

  const query = `name='${KINGDOM_DRIVE_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchRes = await fetch(
    `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id,name)&pageSize=5`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!searchRes.ok) {
    await handleDriveErrorResponse(searchRes, 'Unable to access Google Drive folder');
  }

  const searchData = (await searchRes.json()) as { files?: Array<{ id: string; name: string }> };
  if (searchData.files && searchData.files.length > 0) {
    cachedFolderId = searchData.files[0].id;
    return cachedFolderId;
  }

  const createRes = await fetch(`${DRIVE_API_BASE}/files?fields=id,name`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: KINGDOM_DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!createRes.ok) {
    await handleDriveErrorResponse(createRes, 'Unable to create Google Drive media folder');
  }

  const created = (await createRes.json()) as { id: string };
  cachedFolderId = created.id;
  return created.id;
}

export async function uploadFileToGoogleDrive(params: {
  file: Blob;
  filename: string;
  contentType: string;
  kind: 'image' | 'video' | 'audio';
  accessToken: string;
}): Promise<DriveUploadResult> {
  const folderId = await ensureKingdomDriveFolder(params.accessToken);
  const safeBaseName = params.filename.replace(/[^\w.\-() ]+/g, '_').slice(0, 120) || `${params.kind}.bin`;
  const driveName = `${params.kind}_${Date.now()}_${safeBaseName}`;
  const contentType = params.contentType || 'application/octet-stream';

  // 1. Start Google Drive Resumable Upload session
  const initRes = await fetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&fields=id,name,mimeType,size`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': contentType,
        'X-Upload-Content-Length': String(params.file.size),
      },
      body: JSON.stringify({
        name: driveName,
        mimeType: contentType,
        parents: [folderId],
      }),
    }
  );

  if (!initRes.ok) {
    await handleDriveErrorResponse(initRes, 'Could not start Google Drive upload');
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) {
    throw new Error('Google Drive did not return an upload session URL.');
  }

  // 2. Upload file bytes directly to Google Drive
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: params.file,
  });

  if (!uploadRes.ok) {
    await handleDriveErrorResponse(uploadRes, 'Failed to upload file to Google Drive');
  }

  const uploaded = (await uploadRes.json()) as {
    id: string;
    name: string;
    mimeType?: string;
    size?: string;
  };

  // 3. Grant public reader permission so visitors can view/stream media on the site
  const permRes = await fetch(
    `${DRIVE_API_BASE}/files/${encodeURIComponent(uploaded.id)}/permissions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone',
      }),
    }
  );

  if (!permRes.ok) {
    await handleDriveErrorResponse(permRes, 'Uploaded to Drive, but failed to make media playable publicly');
  }

  return {
    fileId: uploaded.id,
    url: getDriveMediaProxyUrl(uploaded.id),
    name: uploaded.name,
    mimeType: uploaded.mimeType || contentType,
    byteLength: Number(uploaded.size ?? params.file.size),
  };
}

export async function listDriveMediaFiles(accessToken: string): Promise<DriveMediaFile[]> {
  const folderId = await ensureKingdomDriveFolder(accessToken);
  const q = `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
  const res = await fetch(
    `${DRIVE_API_BASE}/files?q=${encodeURIComponent(q)}&orderBy=createdTime desc&pageSize=100&fields=files(id,name,mimeType,size,createdTime)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!res.ok) {
    await handleDriveErrorResponse(res, 'Could not list files from Google Drive');
  }

  const data = (await res.json()) as {
    files?: Array<{
      id: string;
      name: string;
      mimeType?: string;
      size?: string;
      createdTime?: string;
    }>;
  };

  return (data.files ?? [])
    .filter((f) => {
      const m = f.mimeType ?? '';
      return m.startsWith('image/') || m.startsWith('video/') || m.startsWith('audio/');
    })
    .map((f) => {
      const mimeType = f.mimeType || 'application/octet-stream';
      return {
        id: f.id,
        name: f.name,
        mimeType,
        size: Number(f.size ?? 0),
        createdTime: f.createdTime,
        kind: classifyMimeKind(mimeType),
        url: getDriveMediaProxyUrl(f.id),
      };
    });
}

export async function deleteGoogleDriveFile(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`${DRIVE_API_BASE}/files/${encodeURIComponent(fileId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (res.status === 404) {
    return;
  }

  if (!res.ok) {
    await handleDriveErrorResponse(res, 'Could not delete file from Google Drive');
  }
}
