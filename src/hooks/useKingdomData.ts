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
  type PhotoItem,
  type PhotoStatus,
  sanitizeSiteContent,
  type SiteContent,
  SLOT_DEFINITIONS,
  SUPER_ADMIN_EMAIL,
} from '../types/kingdom';

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
  }, []);

  // 3. Photos listener (public published items; full list for super admin + slot lookups for secondary admins)
  useEffect(() => {
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
  }, [isAdmin, isSuperAdmin]);

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

  // Photo slot CRUD (s0..s13 or updating an existing extra photo)
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
    }) => {
      if (!user || !isAdmin) {
        throw new Error('Admin authorization required to save photos.');
      }

      const path = `photos/${params.photoId}`;
      const existingPhoto = photos.find((p) => p.id === params.photoId);
      const sectionLabel = params.sectionLabel.trim().slice(0, MAX_LENGTHS.sectionLabel) || 'Photo';
      const caption = params.caption.trim().slice(0, MAX_LENGTHS.caption);
      const imageData = params.imageData.trim().slice(0, MAX_LENGTHS.imageData);

      try {
        if (existingPhoto) {
          await updateDoc(doc(db, 'photos', params.photoId), {
            sectionLabel,
            imageData,
            caption,
            status: params.status,
            sortOrder: Math.max(0, Math.min(10000, Math.round(params.sortOrder))),
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
            updatedAt: serverTimestamp(),
            updatedByUid: user.uid,
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user, isAdmin, photos]
  );

  const addExtraPhoto = useCallback(
    async (params: { sectionLabel: string; imageData: string; caption: string }) => {
      if (!user || !isAdmin) {
        throw new Error('Admin authorization required to add gallery photos.');
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
      });
    },
    [user, isAdmin, photos, savePhotoSlot]
  );

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
      try {
        await deleteDoc(doc(db, 'photos', photoId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user, isAdmin]
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
    savePhotoSlot,
    addExtraPhoto,
    togglePhotoStatus,
    deletePhoto,
    grantAdminAccess,
    revokeAdminAccess,
  };
}
