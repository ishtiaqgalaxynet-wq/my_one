import { useCallback, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  googleProvider,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase';
import {
  type AdminUser,
  DEFAULT_SITE_CONTENT,
  MAX_LENGTHS,
  type MediaType,
  type PhotoItem,
  type PhotoStatus,
  sanitizeSiteContent,
  type SiteContent,
  SLOT_DEFINITIONS,
  SUPER_ADMIN_EMAIL,
} from '../types/kingdom';

const videoSourceCache = new Map<string, string>();
const musicSourceCache = new Map<string, string>();

export function useKingdomData() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [adminCheckDone, setAdminCheckDone] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [siteContent, setSiteContent] = useState<SiteContent>(DEFAULT_SITE_CONTENT);
  const [contentLoaded, setContentLoaded] = useState(false);
  const [hasRemoteContent, setHasRemoteContent] = useState(false);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [photosLoaded, setPhotosLoaded] = useState(false);

  const [admins, setAdmins] = useState<AdminUser[]>([]);

  // 1. Auth state & admin verification
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);

      if (!nextUser) {
        setIsAdmin(false);
        setIsSuperAdmin(false);
        setAdminCheckDone(true);
        return;
      }

      const superMatch =
        Boolean(nextUser.emailVerified) &&
        nextUser.email?.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
      setIsSuperAdmin(superMatch);

      if (superMatch) {
        setIsAdmin(true);
        setAdminCheckDone(true);
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, 'admins', nextUser.uid));
        setIsAdmin(Boolean(nextUser.emailVerified) && adminDoc.exists());
      } catch {
        setIsAdmin(false);
      } finally {
        setAdminCheckDone(true);
      }
    });

    return () => unsubscribe();
  }, []);

  // 2. Public site_content listener
  useEffect(() => {
    if (!authReady) return;

    const path = 'site_content/main';
    const unsubscribe = onSnapshot(
      doc(db, 'site_content', 'main'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as SiteContent;
          setSiteContent({ ...DEFAULT_SITE_CONTENT, ...data });
          setHasRemoteContent(true);
        } else {
          setSiteContent(DEFAULT_SITE_CONTENT);
          setHasRemoteContent(false);
        }
        setContentLoaded(true);
      },
      (error) => {
        setContentLoaded(true);
        handleFirestoreError(error, OperationType.GET, path);
      }
    );

    return () => unsubscribe();
  }, [authReady, user?.uid]);

  // 3. Photos listener (public published items; full list for super admin + slot lookups for secondary admins)
  useEffect(() => {
    if (!authReady || !adminCheckDone) return;

    const path = 'photos';
    const photosQuery = isSuperAdmin
      ? query(collection(db, 'photos'))
      : query(collection(db, 'photos'), where('status', '==', 'published'));

    const unsubscribe = onSnapshot(
      photosQuery,
      async (snapshot) => {
        const map = new Map<string, PhotoItem>();
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Omit<PhotoItem, 'id'>;
          map.set(docSnap.id, { id: docSnap.id, ...data });
        });

        // If secondary admin (not super admin), also check base slots s0..s13 individually for any hidden slots
        if (isAdmin && !isSuperAdmin) {
          await Promise.all(
            SLOT_DEFINITIONS.map(async (slot) => {
              if (!map.has(slot.slotKey)) {
                try {
                  const snap = await getDoc(doc(db, 'photos', slot.slotKey));
                  if (snap.exists()) {
                    const data = snap.data() as Omit<PhotoItem, 'id'>;
                    map.set(snap.id, { id: snap.id, ...data });
                  }
                } catch {
                  // Ignore missing hidden slots
                }
              }
            })
          );
        }

        const list = Array.from(map.values()).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        setPhotos(list);
        setPhotosLoaded(true);
      },
      (error) => {
        setPhotosLoaded(true);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, [authReady, adminCheckDone, isAdmin, isSuperAdmin]);

  // 4. Admins collection listener (super admin only)
  useEffect(() => {
    if (!isSuperAdmin) {
      setAdmins([]);
      return;
    }

    const path = 'admins';
    const unsubscribe = onSnapshot(
      collection(db, 'admins'),
      (snapshot) => {
        const list: AdminUser[] = [];
        snapshot.forEach((docSnap) => {
          list.push(docSnap.data() as AdminUser);
        });
        setAdmins(list);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );

    return () => unsubscribe();
  }, [isSuperAdmin]);

  // Auth actions
  const signInWithGoogle = useCallback(async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: unknown }).code)
          : '';
      if (code === 'auth/unauthorized-domain') {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
        setAuthError(
          `Domain "${host}" is not authorized for Google Sign-In yet. Add "${host}" under Firebase Console → Authentication → Settings → Authorized domains.`
        );
      } else {
        const message =
          err instanceof Error ? err.message : 'Unable to complete Google sign-in.';
        setAuthError(message);
      }
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    setAuthError(null);
    await firebaseSignOut(auth);
  }, []);

  // Content CRUD
  const saveSiteContent = useCallback(
    async (nextContent: SiteContent) => {
      if (!user || !isAdmin) {
        throw new Error('Admin authorization required to update site content.');
      }
      const path = 'site_content/main';
      const sanitized = sanitizeSiteContent(nextContent, user.uid);
      try {
        await setDoc(doc(db, 'site_content', 'main'), {
          ...sanitized,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user, isAdmin]
  );

  const saveBackgroundMusic = useCallback(
    async (params: {
      enabled: boolean;
      title: string;
      subtitle: string;
      autoPlay: boolean;
      loop: boolean;
      mimeType?: string;
      durationSeconds?: number;
      audioUrl?: string;
      audioChunks?: string[];
      keepExistingChunks?: boolean;
    }) => {
      if (!user || !isAdmin) {
        throw new Error('Admin authorization required to update background music.');
      }

      const path = 'site_content/main';
      const prevChunkCount = siteContent.bgMusicChunkCount ?? 0;
      const newChunks = params.audioChunks ?? [];
      const usingNewChunks = newChunks.length > 0;
      const usingUrl = Boolean(params.audioUrl && params.audioUrl.trim().length > 0);
      const nextChunkCount = usingNewChunks
        ? Math.min(MAX_LENGTHS.maxMusicChunks, newChunks.length)
        : usingUrl
          ? 0
          : params.keepExistingChunks
            ? prevChunkCount
            : 0;

      const nextContent: SiteContent = {
        ...siteContent,
        bgMusicEnabled: params.enabled,
        bgMusicTitle: (params.title.trim() || 'Our Royal Soundtrack').slice(0, MAX_LENGTHS.bgMusicTitle),
        bgMusicSubtitle: (params.subtitle.trim() || 'Background Music').slice(0, MAX_LENGTHS.bgMusicSubtitle),
        bgMusicAutoPlay: params.autoPlay,
        bgMusicLoop: params.loop,
        bgMusicUrl: usingUrl ? (params.audioUrl ?? '').trim().slice(0, MAX_LENGTHS.bgMusicUrl) : '',
        bgMusicMimeType: usingUrl
          ? 'audio/mpeg'
          : usingNewChunks
            ? (params.mimeType ?? 'audio/mpeg').slice(0, MAX_LENGTHS.bgMusicMimeType)
            : params.keepExistingChunks
              ? (siteContent.bgMusicMimeType ?? '')
              : '',
        bgMusicChunkCount: nextChunkCount,
        bgMusicDuration:
          typeof params.durationSeconds === 'number'
            ? Math.max(0, Math.min(7200, Math.round(params.durationSeconds)))
            : usingUrl
              ? 0
              : params.keepExistingChunks
                ? (siteContent.bgMusicDuration ?? 0)
                : 0,
      };

      const sanitized = sanitizeSiteContent(nextContent, user.uid);

      try {
        await setDoc(doc(db, 'site_content', 'main'), {
          ...sanitized,
          updatedAt: serverTimestamp(),
        });

        if (usingNewChunks) {
          await Promise.all(
            newChunks.map((chunkStr, idx) =>
              setDoc(doc(db, 'site_content', 'main', 'music_chunks', String(idx)), {
                index: idx,
                data: chunkStr,
                updatedAt: serverTimestamp(),
                updatedByUid: user.uid,
              })
            )
          );
        }

        if (prevChunkCount > nextChunkCount) {
          await Promise.all(
            Array.from({ length: prevChunkCount - nextChunkCount }, (_, offset) =>
              deleteDoc(
                doc(db, 'site_content', 'main', 'music_chunks', String(nextChunkCount + offset))
              ).catch(() => undefined)
            )
          );
        }

        musicSourceCache.clear();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user, isAdmin, siteContent]
  );

  const loadBackgroundMusicSource = useCallback(async (content: SiteContent): Promise<string | null> => {
    if (!content.bgMusicEnabled) {
      return null;
    }

    const totalChunks = content.bgMusicChunkCount ?? 0;
    if (totalChunks > 0) {
      const cacheKey = `main:${totalChunks}:${content.bgMusicTitle ?? ''}:${content.bgMusicDuration ?? 0}`;
      const cached = musicSourceCache.get(cacheKey);
      if (cached) return cached;

      try {
        const snaps = await Promise.all(
          Array.from({ length: totalChunks }, (_, idx) =>
            getDoc(doc(db, 'site_content', 'main', 'music_chunks', String(idx)))
          )
        );
        const combined = snaps
          .map((snap) => (snap.exists() ? String((snap.data() as { data?: string }).data ?? '') : ''))
          .join('');
        if (!combined) {
          return null;
        }
        musicSourceCache.set(cacheKey, combined);
        return combined;
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'site_content/main/music_chunks');
      }
    }

    const url = (content.bgMusicUrl ?? '').trim();
    return url.length > 0 ? url : null;
  }, []);

  // Photo & video slot CRUD (s0..s13 or updating an existing extra item)
  const savePhotoSlot = useCallback(
    async (params: {
      photoId: string;
      slotKey: string;
      sectionLabel: string;
      imageData: string;
      caption: string;
      isExtra: boolean;
      status: PhotoStatus;
      sortOrder: number;
      mediaType?: MediaType;
      videoData?: string;
      chunkCount?: number;
      mimeType?: string;
      videoChunks?: string[];
    }) => {
      if (!user || !isAdmin) {
        throw new Error('Admin authorization required to save media.');
      }

      const path = `photos/${params.photoId}`;
      const existingPhoto = photos.find((p) => p.id === params.photoId);
      const sectionLabel = params.sectionLabel.trim().slice(0, MAX_LENGTHS.sectionLabel) || 'Memory';
      const caption = params.caption.trim().slice(0, MAX_LENGTHS.caption);
      const imageData = params.imageData.trim().slice(0, MAX_LENGTHS.imageData);
      const mediaType: MediaType = params.mediaType ?? 'image';
      const videoData = (params.videoData ?? '').trim().slice(0, MAX_LENGTHS.videoData);
      const videoChunks = params.videoChunks ?? [];
      const chunkCount = Math.max(0, Math.min(MAX_LENGTHS.maxVideoChunks, params.chunkCount ?? videoChunks.length));
      const mimeType = (params.mimeType ?? '').trim().slice(0, MAX_LENGTHS.mimeType);

      try {
        if (existingPhoto) {
          await updateDoc(doc(db, 'photos', params.photoId), {
            sectionLabel,
            imageData,
            caption,
            status: params.status,
            sortOrder: Math.max(0, Math.min(10000, Math.round(params.sortOrder))),
            mediaType,
            videoData,
            chunkCount,
            mimeType,
            updatedAt: serverTimestamp(),
            updatedByUid: user.uid,
          });
        } else {
          await setDoc(doc(db, 'photos', params.photoId), {
            slotKey: params.slotKey.slice(0, MAX_LENGTHS.slotKey),
            sectionLabel,
            imageData,
            caption,
            isExtra: params.isExtra,
            status: params.status,
            sortOrder: Math.max(0, Math.min(10000, Math.round(params.sortOrder))),
            mediaType,
            videoData,
            chunkCount,
            mimeType,
            updatedAt: serverTimestamp(),
            updatedByUid: user.uid,
          });
        }

        // Write video chunks after parent document exists
        if (videoChunks.length > 0) {
          await Promise.all(
            videoChunks.map((chunkStr, idx) =>
              setDoc(doc(db, 'photos', params.photoId, 'chunks', String(idx)), {
                index: idx,
                data: chunkStr,
                updatedAt: serverTimestamp(),
                updatedByUid: user.uid,
              })
            )
          );
        }

        // Clean up leftover chunks if replaced by smaller video or image
        const prevChunkCount = existingPhoto?.chunkCount ?? 0;
        if (prevChunkCount > chunkCount) {
          await Promise.all(
            Array.from({ length: prevChunkCount - chunkCount }, (_, offset) =>
              deleteDoc(doc(db, 'photos', params.photoId, 'chunks', String(chunkCount + offset))).catch(() => undefined)
            )
          );
        }

        videoSourceCache.delete(`${params.photoId}:${prevChunkCount}`);
        videoSourceCache.delete(`${params.photoId}:${chunkCount}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user, isAdmin, photos]
  );

  const addExtraPhoto = useCallback(
    async (params: {
      sectionLabel: string;
      imageData: string;
      caption: string;
      mediaType?: MediaType;
      videoData?: string;
      chunkCount?: number;
      mimeType?: string;
      videoChunks?: string[];
    }) => {
      if (!user || !isAdmin) {
        throw new Error('Admin authorization required to add gallery media.');
      }

      const id = `extra_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const maxOrder = photos.reduce((max, item) => Math.max(max, item.sortOrder ?? 0), 13);

      await savePhotoSlot({
        photoId: id,
        slotKey: id,
        sectionLabel: params.sectionLabel || 'Kingdom Memory',
        imageData: params.imageData,
        caption: params.caption,
        isExtra: true,
        status: 'published',
        sortOrder: maxOrder + 1,
        mediaType: params.mediaType,
        videoData: params.videoData,
        chunkCount: params.chunkCount,
        mimeType: params.mimeType,
        videoChunks: params.videoChunks,
      });
    },
    [user, isAdmin, photos, savePhotoSlot]
  );

  const addExtraMediaBatch = useCallback(
    async (
      items: Array<{
        sectionLabel: string;
        imageData: string;
        caption: string;
        mediaType?: MediaType;
        videoData?: string;
        chunkCount?: number;
        mimeType?: string;
        videoChunks?: string[];
      }>,
      onProgress?: (completed: number, total: number) => void
    ) => {
      if (!user || !isAdmin) {
        throw new Error('Admin authorization required to add gallery media.');
      }

      const baseOrder = photos.reduce((max, item) => Math.max(max, item.sortOrder ?? 0), 13);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const id = `extra_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`;
        await savePhotoSlot({
          photoId: id,
          slotKey: id,
          sectionLabel: item.sectionLabel || 'Kingdom Memory',
          imageData: item.imageData,
          caption: item.caption,
          isExtra: true,
          status: 'published',
          sortOrder: baseOrder + 1 + i,
          mediaType: item.mediaType,
          videoData: item.videoData,
          chunkCount: item.chunkCount,
          mimeType: item.mimeType,
          videoChunks: item.videoChunks,
        });
        onProgress?.(i + 1, items.length);
      }
    },
    [user, isAdmin, photos, savePhotoSlot]
  );

  const loadVideoSource = useCallback(async (photo: PhotoItem): Promise<string> => {
    if (photo.videoData && photo.videoData.trim().length > 0) {
      return photo.videoData;
    }

    const totalChunks = photo.chunkCount ?? 0;
    if (totalChunks <= 0) {
      return photo.imageData;
    }

    const cacheKey = `${photo.id}:${totalChunks}`;
    const cached = videoSourceCache.get(cacheKey);
    if (cached) return cached;

    try {
      const snaps = await Promise.all(
        Array.from({ length: totalChunks }, (_, idx) =>
          getDoc(doc(db, 'photos', photo.id, 'chunks', String(idx)))
        )
      );
      const combined = snaps
        .map((snap) => (snap.exists() ? String((snap.data() as { data?: string }).data ?? '') : ''))
        .join('');
      if (!combined) {
        throw new Error('Video chunks are missing or unavailable.');
      }
      videoSourceCache.set(cacheKey, combined);
      return combined;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `photos/${photo.id}/chunks`);
    }
  }, []);

  const togglePhotoStatus = useCallback(
    async (photo: PhotoItem) => {
      if (!user || !isAdmin) return;
      const nextStatus: PhotoStatus = photo.status === 'published' ? 'hidden' : 'published';
      const path = `photos/${photo.id}`;
      try {
        await updateDoc(doc(db, 'photos', photo.id), {
          status: nextStatus,
          updatedAt: serverTimestamp(),
          updatedByUid: user.uid,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user, isAdmin]
  );

  const deletePhoto = useCallback(
    async (photoId: string) => {
      if (!user || !isAdmin) return;
      const path = `photos/${photoId}`;
      const existingPhoto = photos.find((p) => p.id === photoId);
      const totalChunks = existingPhoto?.chunkCount ?? 0;
      try {
        if (totalChunks > 0) {
          await Promise.all(
            Array.from({ length: totalChunks }, (_, idx) =>
              deleteDoc(doc(db, 'photos', photoId, 'chunks', String(idx))).catch(() => undefined)
            )
          );
        }
        await deleteDoc(doc(db, 'photos', photoId));
        videoSourceCache.delete(`${photoId}:${totalChunks}`);
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user, isAdmin, photos]
  );

  const grantAdminAccess = useCallback(
    async (params: { uid: string; email: string; displayName: string }) => {
      if (!user || !isSuperAdmin) {
        throw new Error('Only the primary owner can grant admin access.');
      }
      const cleanUid = params.uid.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 128);
      if (!cleanUid) {
        throw new Error('A valid Firebase Auth UID is required.');
      }
      const path = `admins/${cleanUid}`;
      try {
        await setDoc(doc(db, 'admins', cleanUid), {
          uid: cleanUid,
          email: params.email.trim().slice(0, MAX_LENGTHS.email),
          displayName: (params.displayName.trim() || 'Admin').slice(0, MAX_LENGTHS.adminDisplayName),
          role: 'admin',
          createdAt: serverTimestamp(),
          createdByUid: user.uid,
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [user, isSuperAdmin]
  );

  const revokeAdminAccess = useCallback(
    async (targetUid: string) => {
      if (!user || !isSuperAdmin) return;
      const path = `admins/${targetUid}`;
      try {
        await deleteDoc(doc(db, 'admins', targetUid));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user, isSuperAdmin]
  );

  return {
    user,
    authReady,
    isAdmin,
    isSuperAdmin,
    adminCheckDone,
    authError,
    signingIn,
    signInWithGoogle,
    signOut,
    siteContent,
    contentLoaded,
    hasRemoteContent,
    photos,
    photosLoaded,
    admins,
    saveSiteContent,
    saveBackgroundMusic,
    loadBackgroundMusicSource,
    savePhotoSlot,
    addExtraPhoto,
    addExtraMediaBatch,
    loadVideoSource,
    togglePhotoStatus,
    deletePhoto,
    grantAdminAccess,
    revokeAdminAccess,
  };
}
