import React, { useEffect, useMemo, useRef, useState } from 'react';
import { type User } from 'firebase/auth';
import {
  Check,
  Crown,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Film,
  Image as ImageIcon,
  LayoutDashboard,
  Link as LinkIcon,
  LogOut,
  Music,
  Play,
  Plus,
  RotateCcw,
  Save,
  Search,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import {
  compressImageFile,
  formatAudioTime,
  formatBytes,
  generateFallbackVideoPoster,
  getYouTubeEmbedUrl,
  isAudioFile,
  isDirectVideoUrl,
  isValidAudioUrl,
  isValidImageInput,
  isVideoFile,
  isVideoItem,
  processAudioFile,
  type ProcessedAudioResult,
  processVideoFile,
} from '../lib/imageUtils';
import {
  type AdminUser,
  DEFAULT_SITE_CONTENT,
  MAX_LENGTHS,
  type MediaType,
  type PhotoItem,
  type SiteContent,
  SLOT_DEFINITIONS,
  type SlotDefinition,
} from '../types/kingdom';

type DashboardTab = 'overview' | 'photos' | 'music' | 'text' | 'access';
type PhotoFilter = 'all' | 'hero' | 'social' | 'collage' | 'extra';

interface QueuedMediaItem {
  localId: string;
  mediaType: MediaType;
  sectionLabel: string;
  caption: string;
  imageData: string;
  videoData?: string;
  chunkCount?: number;
  mimeType?: string;
  videoChunks?: string[];
  sizeLabel: string;
}

interface AdminDashboardProps {
  user: User;
  isSuperAdmin: boolean;
  siteContent: SiteContent;
  hasRemoteContent: boolean;
  photos: PhotoItem[];
  admins: AdminUser[];
  onSaveSiteContent: (content: SiteContent) => Promise<void>;
  onSaveBackgroundMusic: (params: {
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
  }) => Promise<void>;
  onLoadBackgroundMusic: (content: SiteContent) => Promise<string | null>;
  onSavePhotoSlot: (params: {
    photoId: string;
    slotKey: string;
    sectionLabel: string;
    imageData: string;
    caption: string;
    isExtra: boolean;
    status: 'published' | 'hidden';
    sortOrder: number;
    mediaType?: MediaType;
    videoData?: string;
    chunkCount?: number;
    mimeType?: string;
    videoChunks?: string[];
  }) => Promise<void>;
  onAddExtraPhoto: (params: {
    sectionLabel: string;
    imageData: string;
    caption: string;
    mediaType?: MediaType;
    videoData?: string;
    chunkCount?: number;
    mimeType?: string;
    videoChunks?: string[];
  }) => Promise<void>;
  onAddExtraMediaBatch: (
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
  ) => Promise<void>;
  onTogglePhotoStatus: (photo: PhotoItem) => Promise<void>;
  onDeletePhoto: (photoId: string) => Promise<void>;
  onGrantAdmin: (params: { uid: string; email: string; displayName: string }) => Promise<void>;
  onRevokeAdmin: (uid: string) => Promise<void>;
  onViewSite: () => void;
  onSignOut: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  user,
  isSuperAdmin,
  siteContent,
  hasRemoteContent,
  photos,
  admins,
  onSaveSiteContent,
  onSaveBackgroundMusic,
  onLoadBackgroundMusic,
  onSavePhotoSlot,
  onAddExtraPhoto,
  onAddExtraMediaBatch,
  onTogglePhotoStatus,
  onDeletePhoto,
  onGrantAdmin,
  onRevokeAdmin,
  onViewSite,
  onSignOut,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Text editor state
  const [draftContent, setDraftContent] = useState<SiteContent>(siteContent);
  const [savingText, setSavingText] = useState(false);

  useEffect(() => {
    setDraftContent(siteContent);
  }, [siteContent]);

  const textDirty = useMemo(() => {
    const keys = Object.keys(DEFAULT_SITE_CONTENT) as Array<keyof SiteContent>;
    return keys.some((k) => draftContent[k] !== siteContent[k]);
  }, [draftContent, siteContent]);

  // Photo manager state
  const [photoFilter, setPhotoFilter] = useState<PhotoFilter>('all');
  const [photoSearch, setPhotoSearch] = useState('');
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});

  // Add new photo/video modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTargetSlot, setNewTargetSlot] = useState<string>('extra');
  const [newLabel, setNewLabel] = useState('Kingdom Memory');
  const [newCaption, setNewCaption] = useState('');
  const [newImageUrlInput, setNewImageUrlInput] = useState('');
  const [queuedItems, setQueuedItems] = useState<QueuedMediaItem[]>([]);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [submittingNewPhoto, setSubmittingNewPhoto] = useState(false);
  const [publishProgress, setPublishProgress] = useState<{ done: number; total: number } | null>(null);

  // Admin access form state
  const [adminUidInput, setAdminUidInput] = useState('');
  const [adminEmailInput, setAdminEmailInput] = useState('');
  const [adminNameInput, setAdminNameInput] = useState('');
  const [grantingAdmin, setGrantingAdmin] = useState(false);

  // Background music manager state
  const [musicEnabled, setMusicEnabled] = useState<boolean>(Boolean(siteContent.bgMusicEnabled));
  const [musicTitle, setMusicTitle] = useState<string>(
    siteContent.bgMusicTitle || 'Our Royal Soundtrack'
  );
  const [musicSubtitle, setMusicSubtitle] = useState<string>(
    siteContent.bgMusicSubtitle || 'Background Music'
  );
  const [musicAutoPlay, setMusicAutoPlay] = useState<boolean>(
    siteContent.bgMusicAutoPlay ?? true
  );
  const [musicLoop, setMusicLoop] = useState<boolean>(siteContent.bgMusicLoop ?? true);
  const [musicUrlInput, setMusicUrlInput] = useState<string>(siteContent.bgMusicUrl || '');
  const [pendingAudio, setPendingAudio] = useState<ProcessedAudioResult | null>(null);
  const [savedAudioPreviewSrc, setSavedAudioPreviewSrc] = useState<string | null>(null);
  const [processingAudio, setProcessingAudio] = useState(false);
  const [savingMusic, setSavingMusic] = useState(false);

  useEffect(() => {
    setMusicEnabled(Boolean(siteContent.bgMusicEnabled));
    setMusicTitle(siteContent.bgMusicTitle || 'Our Royal Soundtrack');
    setMusicSubtitle(siteContent.bgMusicSubtitle || 'Background Music');
    setMusicAutoPlay(siteContent.bgMusicAutoPlay ?? true);
    setMusicLoop(siteContent.bgMusicLoop ?? true);
    setMusicUrlInput(siteContent.bgMusicUrl || '');
  }, [siteContent]);

  useEffect(() => {
    if (activeTab !== 'music') return;
    if ((siteContent.bgMusicChunkCount ?? 0) > 0 || (siteContent.bgMusicUrl ?? '').trim()) {
      void onLoadBackgroundMusic({ ...siteContent, bgMusicEnabled: true })
        .then((src) => setSavedAudioPreviewSrc(src))
        .catch(() => setSavedAudioPreviewSrc(null));
    } else {
      setSavedAudioPreviewSrc(null);
    }
  }, [activeTab, siteContent, onLoadBackgroundMusic]);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const notify = (type: 'success' | 'error', text: string) => {
    setStatusBanner({ type, text });
    window.setTimeout(() => {
      setStatusBanner((curr) => (curr?.text === text ? null : curr));
    }, 3600);
  };

  const photoById = useMemo(() => {
    const map = new Map<string, PhotoItem>();
    photos.forEach((p) => map.set(p.id, p));
    return map;
  }, [photos]);

  const extraPhotos = useMemo(() => photos.filter((p) => p.isExtra), [photos]);
  const filledBaseCount = useMemo(
    () => SLOT_DEFINITIONS.filter((s) => photoById.has(s.slotKey)).length,
    [photoById]
  );
  const publishedCount = useMemo(
    () => photos.filter((p) => p.status === 'published').length,
    [photos]
  );

  // Save Text Handler
  const handleSaveText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingText(true);
    try {
      await onSaveSiteContent(draftContent);
      notify('success', 'Website text and settings published.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save text updates.');
    } finally {
      setSavingText(false);
    }
  };

  // Upload or replace a base slot or extra photo/video via file input
  const handleSlotFileUpload = async (
    file: File,
    target: {
      photoId: string;
      slotKey: string;
      sectionLabel: string;
      isExtra: boolean;
      sortOrder: number;
      allowVideo?: boolean;
      existingCaption?: string;
      existingStatus?: 'published' | 'hidden';
    }
  ) => {
    setBusyPhotoId(target.photoId);
    try {
      if (isVideoFile(file)) {
        if (!target.allowVideo) {
          throw new Error('This layout slot supports photos only. Use Collage or Extra Gallery for videos.');
        }
        const processed = await processVideoFile(file);
        await onSavePhotoSlot({
          photoId: target.photoId,
          slotKey: target.slotKey,
          sectionLabel: target.sectionLabel,
          imageData: processed.posterDataUrl,
          caption: target.existingCaption ?? '',
          isExtra: target.isExtra,
          status: target.existingStatus ?? 'published',
          sortOrder: target.sortOrder,
          mediaType: 'video',
          videoData: processed.inlineVideoData,
          chunkCount: processed.chunks.length,
          mimeType: processed.mimeType,
          videoChunks: processed.chunks,
        });
        notify(
          'success',
          `Saved video ${target.sectionLabel} (${formatBytes(processed.byteLength)})`
        );
      } else {
        const compressed = await compressImageFile(file);
        await onSavePhotoSlot({
          photoId: target.photoId,
          slotKey: target.slotKey,
          sectionLabel: target.sectionLabel,
          imageData: compressed.dataUrl,
          caption: target.existingCaption ?? '',
          isExtra: target.isExtra,
          status: target.existingStatus ?? 'published',
          sortOrder: target.sortOrder,
          mediaType: 'image',
          videoData: '',
          chunkCount: 0,
          mimeType: 'image/jpeg',
        });
        notify(
          'success',
          `Saved ${target.sectionLabel} (${formatBytes(compressed.byteLength)})`
        );
      }
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusyPhotoId(null);
    }
  };

  const handleSaveCaption = async (photo: PhotoItem) => {
    const nextCaption = (captionDrafts[photo.id] ?? photo.caption).trim();
    setBusyPhotoId(photo.id);
    try {
      await onSavePhotoSlot({
        photoId: photo.id,
        slotKey: photo.slotKey,
        sectionLabel: photo.sectionLabel,
        imageData: photo.imageData,
        caption: nextCaption,
        isExtra: photo.isExtra,
        status: photo.status,
        sortOrder: photo.sortOrder,
        mediaType: photo.mediaType,
        videoData: photo.videoData,
        chunkCount: photo.chunkCount,
        mimeType: photo.mimeType,
      });
      notify('success', `Updated caption for ${photo.sectionLabel}.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not update caption.');
    } finally {
      setBusyPhotoId(null);
    }
  };

  const handleModalFiles = async (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const selectedSlot =
      newTargetSlot === 'extra'
        ? null
        : SLOT_DEFINITIONS.find((s) => s.slotKey === newTargetSlot) ?? null;
    const allowVideo = !selectedSlot || selectedSlot.category === 'collage';
    const filesToProcess = newTargetSlot === 'extra' ? files : [files[0]];

    setProcessingFiles(true);
    const nextQueued: QueuedMediaItem[] = [];
    const errors: string[] = [];

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      const baseTitle =
        file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim().slice(0, MAX_LENGTHS.sectionLabel) ||
        newLabel.trim() ||
        'Kingdom Memory';

      try {
        if (isVideoFile(file)) {
          if (!allowVideo) {
            errors.push(`"${file.name}": This layout slot only supports photos.`);
            continue;
          }
          const processed = await processVideoFile(file);
          nextQueued.push({
            localId: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            mediaType: 'video',
            sectionLabel: selectedSlot ? selectedSlot.sectionLabel : baseTitle,
            caption: newCaption.trim(),
            imageData: processed.posterDataUrl,
            videoData: processed.inlineVideoData,
            chunkCount: processed.chunks.length,
            mimeType: processed.mimeType,
            videoChunks: processed.chunks,
            sizeLabel: `Video · ${formatBytes(processed.byteLength)}`,
          });
        } else {
          const compressed = await compressImageFile(file);
          nextQueued.push({
            localId: `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            mediaType: 'image',
            sectionLabel: selectedSlot ? selectedSlot.sectionLabel : baseTitle,
            caption: newCaption.trim(),
            imageData: compressed.dataUrl,
            videoData: '',
            chunkCount: 0,
            mimeType: 'image/jpeg',
            sizeLabel: `${compressed.width}×${compressed.height} · ${formatBytes(compressed.byteLength)}`,
          });
        }
      } catch (err) {
        errors.push(err instanceof Error ? err.message : `Failed to process "${file.name}".`);
      }
    }

    if (nextQueued.length > 0) {
      setNewImageUrlInput('');
      setQueuedItems((prev) =>
        newTargetSlot === 'extra' ? [...prev, ...nextQueued] : [nextQueued[0]]
      );
    }

    if (errors.length > 0) {
      notify('error', errors[0]);
    }

    setProcessingFiles(false);
  };

  const resetAddModal = () => {
    setShowAddModal(false);
    setQueuedItems([]);
    setNewImageUrlInput('');
    setNewCaption('');
    setNewTargetSlot('extra');
    setNewLabel('Kingdom Memory');
    setPublishProgress(null);
  };

  const handleCreateOrAssignPhoto = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedUrl = newImageUrlInput.trim();
    const hasUrl = trimmedUrl.length > 0;
    const isUrlVideo =
      hasUrl && (isDirectVideoUrl(trimmedUrl) || Boolean(getYouTubeEmbedUrl(trimmedUrl)));

    if (queuedItems.length === 0 && !hasUrl) {
      notify('error', 'Please choose photo/video files or paste a valid HTTPS media URL.');
      return;
    }

    if (queuedItems.length === 0 && hasUrl && !isValidImageInput(trimmedUrl)) {
      notify('error', 'Please enter a valid HTTPS photo or video URL.');
      return;
    }

    setSubmittingNewPhoto(true);
    try {
      if (newTargetSlot === 'extra') {
        if (queuedItems.length > 0) {
          setPublishProgress({ done: 0, total: queuedItems.length });
          await onAddExtraMediaBatch(
            queuedItems.map((item) => ({
              sectionLabel: item.sectionLabel.trim() || newLabel.trim() || 'Kingdom Memory',
              imageData: item.imageData,
              caption: item.caption.trim() || newCaption.trim(),
              mediaType: item.mediaType,
              videoData: item.videoData,
              chunkCount: item.chunkCount,
              mimeType: item.mimeType,
              videoChunks: item.videoChunks,
            })),
            (done, total) => setPublishProgress({ done, total })
          );
          const photoCount = queuedItems.filter((q) => q.mediaType === 'image').length;
          const videoCount = queuedItems.filter((q) => q.mediaType === 'video').length;
          notify(
            'success',
            `Published ${queuedItems.length} ${queuedItems.length === 1 ? 'item' : 'items'} (${photoCount} photos, ${videoCount} videos) to Kingdom Gallery.`
          );
        } else {
          await onAddExtraPhoto({
            sectionLabel: newLabel.trim() || 'Kingdom Memory',
            imageData: isUrlVideo ? generateFallbackVideoPoster() : trimmedUrl,
            caption: newCaption.trim(),
            mediaType: isUrlVideo ? 'video' : 'image',
            videoData: isUrlVideo ? trimmedUrl : '',
            chunkCount: 0,
            mimeType: isUrlVideo ? 'video/mp4' : 'image/jpeg',
          });
          notify('success', `Added new ${isUrlVideo ? 'video' : 'photo'} to the Kingdom Gallery.`);
        }
      } else {
        const slotDef = SLOT_DEFINITIONS.find((s) => s.slotKey === newTargetSlot);
        if (!slotDef) throw new Error('Invalid slot selected.');
        const single = queuedItems[0];
        if (single) {
          if (single.mediaType === 'video' && slotDef.category !== 'collage') {
            throw new Error('Videos can only be assigned to Collage slots or Extra Gallery.');
          }
          await onSavePhotoSlot({
            photoId: slotDef.slotKey,
            slotKey: slotDef.slotKey,
            sectionLabel: slotDef.sectionLabel,
            imageData: single.imageData,
            caption: newCaption.trim() || single.caption,
            isExtra: false,
            status: 'published',
            sortOrder: slotDef.sortOrder,
            mediaType: single.mediaType,
            videoData: single.videoData,
            chunkCount: single.chunkCount,
            mimeType: single.mimeType,
            videoChunks: single.videoChunks,
          });
        } else {
          if (isUrlVideo && slotDef.category !== 'collage') {
            throw new Error('Videos can only be assigned to Collage slots or Extra Gallery.');
          }
          await onSavePhotoSlot({
            photoId: slotDef.slotKey,
            slotKey: slotDef.slotKey,
            sectionLabel: slotDef.sectionLabel,
            imageData: isUrlVideo ? generateFallbackVideoPoster() : trimmedUrl,
            caption: newCaption.trim(),
            isExtra: false,
            status: 'published',
            sortOrder: slotDef.sortOrder,
            mediaType: isUrlVideo ? 'video' : 'image',
            videoData: isUrlVideo ? trimmedUrl : '',
            chunkCount: 0,
            mimeType: isUrlVideo ? 'video/mp4' : 'image/jpeg',
          });
        }
        notify('success', `Published media to ${slotDef.sectionLabel}.`);
      }

      resetAddModal();
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save media.');
    } finally {
      setSubmittingNewPhoto(false);
      setPublishProgress(null);
    }
  };

  const handleGrantAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminUidInput.trim() || !adminEmailInput.trim()) {
      notify('error', 'Both UID and Email are required.');
      return;
    }
    setGrantingAdmin(true);
    try {
      await onGrantAdmin({
        uid: adminUidInput,
        email: adminEmailInput,
        displayName: adminNameInput || 'Admin',
      });
      setAdminUidInput('');
      setAdminEmailInput('');
      setAdminNameInput('');
      notify('success', 'Administrator access granted.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Could not grant admin access.');
    } finally {
      setGrantingAdmin(false);
    }
  };

  // Filtered slots & photos
  const filteredSlots = useMemo(() => {
    if (photoFilter === 'extra') return [];
    const q = photoSearch.trim().toLowerCase();
    return SLOT_DEFINITIONS.filter((slot) => {
      const catMatch = photoFilter === 'all' || slot.category === photoFilter;
      const searchMatch =
        !q ||
        slot.sectionLabel.toLowerCase().includes(q) ||
        slot.slotKey.toLowerCase().includes(q) ||
        (photoById.get(slot.slotKey)?.caption ?? '').toLowerCase().includes(q);
      return catMatch && searchMatch;
    });
  }, [photoFilter, photoSearch, photoById]);

  const filteredExtraPhotos = useMemo(() => {
    if (photoFilter !== 'all' && photoFilter !== 'extra') return [];
    const q = photoSearch.trim().toLowerCase();
    return extraPhotos.filter(
      (p) =>
        !q ||
        p.sectionLabel.toLowerCase().includes(q) ||
        p.caption.toLowerCase().includes(q)
    );
  }, [photoFilter, photoSearch, extraPhotos]);

  const handleMusicFileSelect = async (file: File) => {
    if (!isAudioFile(file)) {
      notify('error', 'Please choose an audio file (MP3, M4A, WAV, OGG, or AAC).');
      return;
    }
    setProcessingAudio(true);
    try {
      const processed = await processAudioFile(file);
      setPendingAudio(processed);
      setMusicUrlInput('');
      setMusicEnabled(true);
      if (!musicTitle.trim() || musicTitle.trim() === 'Our Royal Soundtrack') {
        setMusicTitle(processed.defaultTitle);
      }
      notify('success', `Audio loaded (${formatBytes(processed.byteLength)}). Click Save & Publish Music to apply.`);
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Unable to read the selected audio file.');
    } finally {
      setProcessingAudio(false);
    }
  };

  const handleSaveMusicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUrl = musicUrlInput.trim();
    const hasExistingChunks = (siteContent.bgMusicChunkCount ?? 0) > 0;

    if (!pendingAudio && trimmedUrl && !isValidAudioUrl(trimmedUrl)) {
      notify('error', 'Please enter a valid HTTPS audio URL.');
      return;
    }

    if (musicEnabled && !pendingAudio && !trimmedUrl && !hasExistingChunks) {
      notify('error', 'Please upload an audio file or paste an audio URL before enabling.');
      return;
    }

    setSavingMusic(true);
    try {
      await onSaveBackgroundMusic({
        enabled: musicEnabled,
        title: musicTitle,
        subtitle: musicSubtitle,
        autoPlay: musicAutoPlay,
        loop: musicLoop,
        mimeType: pendingAudio?.mimeType,
        durationSeconds: pendingAudio?.durationSeconds,
        audioUrl: pendingAudio ? '' : trimmedUrl,
        audioChunks: pendingAudio?.chunks,
        keepExistingChunks: !pendingAudio && !trimmedUrl && hasExistingChunks,
      });
      if (pendingAudio) {
        setSavedAudioPreviewSrc(pendingAudio.audioDataUrl);
        setPendingAudio(null);
      }
      notify('success', 'Background music settings saved and published.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to save background music.');
    } finally {
      setSavingMusic(false);
    }
  };

  const handleRemoveMusicTrack = async () => {
    setSavingMusic(true);
    try {
      await onSaveBackgroundMusic({
        enabled: false,
        title: 'Our Royal Soundtrack',
        subtitle: 'Background Music',
        autoPlay: musicAutoPlay,
        loop: musicLoop,
        audioUrl: '',
        audioChunks: [],
        keepExistingChunks: false,
      });
      setPendingAudio(null);
      setSavedAudioPreviewSrc(null);
      setMusicUrlInput('');
      setMusicEnabled(false);
      notify('success', 'Uploaded background music track removed.');
    } catch (err) {
      notify('error', err instanceof Error ? err.message : 'Failed to remove background music.');
    } finally {
      setSavingMusic(false);
    }
  };

  const tabLabel: Record<DashboardTab, string> = {
    overview: 'Overview',
    photos: 'Photo & Video Manager',
    music: 'Background Music',
    text: 'Text & Copy Editor',
    access: 'Admin Access',
  };

  const renderField = (
    label: string,
    field: keyof SiteContent,
    maxLength: number,
    options?: { multiline?: boolean; rows?: number; helper?: string }
  ) => {
    const val = String(draftContent[field] ?? '');
    return (
      <label className="block space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-200">{label}</span>
          <span className="font-mono-tabular text-slate-400">
            {val.length}/{maxLength}
          </span>
        </div>
        {options?.multiline ? (
          <textarea
            value={val}
            maxLength={maxLength}
            rows={options.rows ?? 4}
            onChange={(e) =>
              setDraftContent((prev) => ({ ...prev, [field]: e.target.value }))
            }
            className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#c19ee0] transition-colors"
          />
        ) : (
          <input
            type="text"
            value={val}
            maxLength={maxLength}
            onChange={(e) =>
              setDraftContent((prev) => ({ ...prev, [field]: e.target.value }))
            }
            className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#c19ee0] transition-colors"
          />
        )}
        {options?.helper && <p className="text-[11px] text-slate-400">{options.helper}</p>}
      </label>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      {/* Left Sidebar (Desktop) */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col border-r border-slate-800 bg-slate-900/70 shrink-0">
        <div className="h-16 px-5 border-b border-slate-800 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#7251b5] text-[#f6f1fc] flex items-center justify-center shrink-0">
            <Crown className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm text-white truncate">
            Kingdom Studio
          </span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {(
            [
              { id: 'overview', label: 'Overview', icon: LayoutDashboard },
              { id: 'photos', label: 'Photos & Videos', icon: ImageIcon },
              { id: 'music', label: 'Background Music', icon: Music },
              { id: 'text', label: 'Text & Copy', icon: FileText },
              { id: 'access', label: 'Admin Access', icon: Shield },
            ] as const
          ).map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`w-full min-h-[42px] flex items-center gap-3 px-3.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#7251b5] text-[#f6f1fc]'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-200 truncate">
              {user.displayName || 'Administrator'}
            </p>
            <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full min-h-[38px] inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract */}
        <header className="sticky top-0 z-20 h-16 px-4 sm:px-6 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="text-slate-400 hidden sm:inline">Admin Dashboard</span>
            <span className="text-slate-600 hidden sm:inline">/</span>
            <h1 className="font-semibold text-white truncate">{tabLabel[activeTab]}</h1>
            {textDirty && (
              <span className="text-xs text-amber-400 ml-2 whitespace-nowrap">
                · Unsaved text changes
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onViewSite}
              className="min-h-[38px] inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-100 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>View Live Site</span>
            </button>

            <button
              type="button"
              onClick={onSignOut}
              className="lg:hidden min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Mobile Tab Strip */}
        <div className="lg:hidden border-b border-slate-800 bg-slate-900/50 px-3 py-2 flex items-center gap-1.5 overflow-x-auto">
          {(
            [
              { id: 'overview', label: 'Overview' },
              { id: 'photos', label: 'Photos' },
              { id: 'music', label: 'Music' },
              { id: 'text', label: 'Text Editor' },
              { id: 'access', label: 'Access' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                activeTab === item.id
                  ? 'bg-[#7251b5] text-[#f6f1fc]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Status Toast */}
        {statusBanner && (
          <div className="px-4 sm:px-6 pt-4">
            <div
              role="status"
              className={`rounded-xl border px-4 py-3 text-xs sm:text-sm flex items-center justify-between gap-3 ${
                statusBanner.type === 'success'
                  ? 'bg-emerald-950/50 border-emerald-800/70 text-emerald-200'
                  : 'bg-red-950/50 border-red-800/70 text-red-200'
              }`}
            >
              <span>{statusBanner.text}</span>
              <button
                type="button"
                onClick={() => setStatusBanner(null)}
                className="text-current opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Active View Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto space-y-6">
          {/* ---------------- OVERVIEW TAB ---------------- */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-1">
                  <p className="text-xs text-slate-400">Base Photo Slots</p>
                  <p className="text-2xl font-bold font-mono-tabular text-white">
                    {filledBaseCount} / {SLOT_DEFINITIONS.length}
                  </p>
                  <p className="text-xs text-slate-500">Hero, highlights &amp; collage</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-1">
                  <p className="text-xs text-slate-400">Extra Gallery</p>
                  <p className="text-2xl font-bold font-mono-tabular text-white">
                    {extraPhotos.length}
                  </p>
                  <p className="text-xs text-slate-500">Additional memories</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-1">
                  <p className="text-xs text-slate-400">Published Photos</p>
                  <p className="text-2xl font-bold font-mono-tabular text-white">
                    {publishedCount}
                  </p>
                  <p className="text-xs text-slate-500">Visible to visitors</p>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-1">
                  <p className="text-xs text-slate-400">Site Copy Source</p>
                  <p className="text-2xl font-bold text-white">
                    {hasRemoteContent ? 'Published' : 'Default'}
                  </p>
                  <p className="text-xs text-slate-500">
                    Theme: {siteContent.defaultTheme}
                  </p>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-white">
                    Customize {siteContent.displayName}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-400">
                    Upload photos to any slot, add extra gallery memories, or customize every headline and letter paragraph.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('photos');
                      setShowAddModal(true);
                    }}
                    className="min-h-[40px] inline-flex items-center gap-2 rounded-lg bg-[#7251b5] hover:bg-[#815ac0] text-[#f6f1fc] px-4 py-2 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Photos / Videos</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('music')}
                    className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Music className="w-4 h-4 text-[#c19ee0]" />
                    <span>Background Music</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('text')}
                    className="min-h-[40px] inline-flex items-center gap-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 px-4 py-2 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Edit Text</span>
                  </button>
                </div>
              </div>

              {/* Slot Inventory Table */}
              <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-white">
                    Website Photo Slots
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('photos')}
                    className="text-xs text-[#c19ee0] hover:underline cursor-pointer"
                  >
                    Open Photo Manager
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-slate-400 bg-slate-950/40">
                      <tr>
                        <th className="py-2.5 px-4 font-medium">Slot</th>
                        <th className="py-2.5 px-4 font-medium">Location</th>
                        <th className="py-2.5 px-4 font-medium">Aspect</th>
                        <th className="py-2.5 px-4 font-medium">Status</th>
                        <th className="py-2.5 px-4 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {SLOT_DEFINITIONS.map((slot) => {
                        const existing = photoById.get(slot.slotKey);
                        return (
                          <tr key={slot.slotKey} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-4 font-mono-tabular text-slate-300">
                              {slot.slotKey}
                            </td>
                            <td className="py-2.5 px-4 text-slate-200 font-medium">
                              {slot.sectionLabel}
                            </td>
                            <td className="py-2.5 px-4 text-slate-400">
                              {slot.aspectHint}
                            </td>
                            <td className="py-2.5 px-4">
                              {existing ? (
                                <span
                                  className={
                                    existing.status === 'published'
                                      ? 'text-emerald-400 font-medium'
                                      : 'text-amber-400 font-medium'
                                  }
                                >
                                  {existing.status === 'published' ? 'Published' : 'Hidden'}
                                </span>
                              ) : (
                                <span className="text-slate-500">Empty</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => setActiveTab('photos')}
                                className="text-xs text-slate-300 hover:text-white underline underline-offset-4 cursor-pointer"
                              >
                                {existing ? 'Manage' : 'Upload'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ---------------- PHOTO MANAGER TAB ---------------- */}
          {activeTab === 'photos' && (
            <div className="space-y-6">
              {/* Filter & Add Toolbar */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-900 border border-slate-800">
                  {(
                    [
                      { id: 'all', label: 'All' },
                      { id: 'hero', label: 'Hero & Bio' },
                      { id: 'social', label: 'Social & Pinned' },
                      { id: 'collage', label: 'Collage' },
                      { id: 'extra', label: `Extra (${extraPhotos.length})` },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setPhotoFilter(f.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                        photoFilter === f.id
                          ? 'bg-[#7251b5] text-[#f6f1fc]'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="relative flex-1 md:w-56">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={photoSearch}
                      onChange={(e) => setPhotoSearch(e.target.value)}
                      placeholder="Search slots or captions..."
                      className="w-full rounded-lg bg-slate-900 border border-slate-800 pl-9 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#c19ee0]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="min-h-[38px] inline-flex items-center gap-2 rounded-lg bg-[#7251b5] hover:bg-[#815ac0] text-[#f6f1fc] px-4 py-2 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Photos / Videos</span>
                  </button>
                </div>
              </div>

              {/* Base Slots Grid */}
              {filteredSlots.length > 0 && (
                <div className="space-y-3">
                  <h2 className="text-sm font-semibold text-slate-200">
                    Layout Photo Slots
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredSlots.map((slot: SlotDefinition) => {
                      const item = photoById.get(slot.slotKey);
                      const isBusy = busyPhotoId === slot.slotKey;
                      const captionValue =
                        captionDrafts[slot.slotKey] ?? item?.caption ?? '';

                      return (
                        <div
                          key={slot.slotKey}
                          className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden flex flex-col"
                        >
                          {/* Media Preview */}
                          <div className="relative h-44 bg-slate-950 flex items-center justify-center overflow-hidden">
                            {item ? (
                              <>
                                <img
                                  src={item.imageData}
                                  alt={item.caption || slot.sectionLabel}
                                  referrerPolicy="no-referrer"
                                  className={`w-full h-full object-cover ${
                                    item.status === 'hidden' ? 'opacity-45 grayscale' : ''
                                  }`}
                                />
                                {isVideoItem(item) && (
                                  <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-white">
                                    <Film className="w-3 h-3" />
                                    <span>VIDEO</span>
                                  </span>
                                )}
                              </>
                            ) : (
                              <div className="text-center space-y-1.5 px-4">
                                <Crown className="w-6 h-6 mx-auto text-slate-600" />
                                <p className="text-xs text-slate-500">
                                  No media uploaded yet
                                </p>
                              </div>
                            )}

                            <input
                              ref={(el) => {
                                fileInputRefs.current[slot.slotKey] = el;
                              }}
                              type="file"
                              accept={slot.category === 'collage' ? 'image/*,video/*' : 'image/*'}
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  void handleSlotFileUpload(file, {
                                    photoId: slot.slotKey,
                                    slotKey: slot.slotKey,
                                    sectionLabel: slot.sectionLabel,
                                    isExtra: false,
                                    sortOrder: slot.sortOrder,
                                    allowVideo: slot.category === 'collage',
                                    existingCaption: item?.caption,
                                    existingStatus: item?.status,
                                  });
                                }
                                e.target.value = '';
                              }}
                            />
                          </div>

                          {/* Slot Details & Actions */}
                          <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
                                <span className="font-mono-tabular">{slot.slotKey}</span>
                                <span>
                                  {slot.category === 'collage'
                                    ? `${slot.aspectHint} · Photo/Video`
                                    : slot.aspectHint}
                                </span>
                              </div>
                              <h3 className="text-sm font-semibold text-white">
                                {slot.sectionLabel}
                              </h3>
                              <p className="text-xs text-slate-400 leading-relaxed">
                                {slot.description}
                              </p>
                            </div>

                            {item && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={captionValue}
                                  maxLength={MAX_LENGTHS.caption}
                                  placeholder="Optional caption..."
                                  onChange={(e) =>
                                    setCaptionDrafts((prev) => ({
                                      ...prev,
                                      [slot.slotKey]: e.target.value,
                                    }))
                                  }
                                  className="flex-1 min-w-0 rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#c19ee0]"
                                />
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleSaveCaption(item)}
                                  title="Save caption"
                                  className="min-h-[32px] px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                              <button
                                type="button"
                                disabled={isBusy}
                                onClick={() =>
                                  fileInputRefs.current[slot.slotKey]?.click()
                                }
                                className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-[#7251b5] hover:bg-[#815ac0] text-[#f6f1fc] px-3 py-1.5 text-xs font-semibold disabled:opacity-50 cursor-pointer"
                              >
                                <Upload className="w-3.5 h-3.5" />
                                <span>
                                  {isBusy
                                    ? 'Saving...'
                                    : item
                                      ? 'Replace'
                                      : slot.category === 'collage'
                                        ? 'Upload Media'
                                        : 'Upload Photo'}
                                </span>
                              </button>

                              {item && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isBusy}
                                    onClick={() => void onTogglePhotoStatus(item)}
                                    title={
                                      item.status === 'published'
                                        ? 'Hide from public site'
                                        : 'Publish to public site'
                                    }
                                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
                                  >
                                    {item.status === 'published' ? (
                                      <Eye className="w-3.5 h-3.5" />
                                    ) : (
                                      <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                    )}
                                  </button>

                                  {confirmDeleteId === item.id ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void onDeletePhoto(item.id);
                                        setConfirmDeleteId(null);
                                      }}
                                      className="min-h-[36px] px-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                                    >
                                      Confirm
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(item.id)}
                                      title="Remove media"
                                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-700 hover:bg-red-950/60 hover:border-red-800 text-slate-400 hover:text-red-300 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Extra Gallery Photos & Videos */}
              {(photoFilter === 'all' || photoFilter === 'extra') && (
                <div className="space-y-3 pt-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-sm font-semibold text-slate-200">
                      Extra Gallery Memories ({filteredExtraPhotos.length})
                    </h2>
                    <button
                      type="button"
                      onClick={() => {
                        setNewTargetSlot('extra');
                        setShowAddModal(true);
                      }}
                      className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-200 px-3 py-1.5 text-xs font-medium cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-[#c19ee0]" />
                      <span>Upload Photos &amp; Videos</span>
                    </button>
                  </div>

                  {filteredExtraPhotos.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/40 p-8 text-center space-y-3">
                      <div className="flex items-center justify-center gap-2 text-slate-600">
                        <ImageIcon className="w-6 h-6" />
                        <Film className="w-6 h-6" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium text-slate-300">
                          No extra gallery photos or videos yet
                        </p>
                        <p className="text-xs text-slate-500">
                          Upload multiple photos and videos together to expand the More Kingdom Memories gallery.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNewTargetSlot('extra');
                          setShowAddModal(true);
                        }}
                        className="min-h-[38px] inline-flex items-center gap-2 rounded-lg bg-[#7251b5] hover:bg-[#815ac0] text-[#f6f1fc] px-4 py-2 text-xs font-semibold cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Upload Photos &amp; Videos</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {filteredExtraPhotos.map((photo) => {
                        const isBusy = busyPhotoId === photo.id;
                        const isVideo = isVideoItem(photo);
                        const captionValue =
                          captionDrafts[photo.id] ?? photo.caption;

                        return (
                          <div
                            key={photo.id}
                            className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden flex flex-col"
                          >
                            <div className="relative h-44 bg-slate-950 overflow-hidden">
                              <img
                                src={photo.imageData}
                                alt={photo.caption || photo.sectionLabel}
                                referrerPolicy="no-referrer"
                                className={`w-full h-full object-cover ${
                                  photo.status === 'hidden'
                                    ? 'opacity-45 grayscale'
                                    : ''
                                }`}
                              />
                              {isVideo && (
                                <>
                                  <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[10px] font-semibold text-white">
                                    <Film className="w-3 h-3" />
                                    <span>VIDEO</span>
                                  </span>
                                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    <span className="w-10 h-10 rounded-full bg-black/55 border border-white/30 text-white flex items-center justify-center">
                                      <Play className="w-4 h-4 fill-current ml-0.5" />
                                    </span>
                                  </div>
                                </>
                              )}
                              <input
                                ref={(el) => {
                                  fileInputRefs.current[photo.id] = el;
                                }}
                                type="file"
                                accept="image/*,video/*"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    void handleSlotFileUpload(file, {
                                      photoId: photo.id,
                                      slotKey: photo.slotKey,
                                      sectionLabel: photo.sectionLabel,
                                      isExtra: true,
                                      sortOrder: photo.sortOrder,
                                      allowVideo: true,
                                      existingCaption: photo.caption,
                                      existingStatus: photo.status,
                                    });
                                  }
                                  e.target.value = '';
                                }}
                              />
                            </div>

                            <div className="p-4 flex-1 flex flex-col justify-between gap-3">
                              <div className="space-y-1">
                                <div className="flex items-center justify-between text-xs text-slate-400">
                                  <span>{isVideo ? 'Extra Video' : 'Extra Photo'}</span>
                                  <span>
                                    {photo.status === 'published'
                                      ? 'Published'
                                      : 'Hidden'}
                                  </span>
                                </div>
                                <h3 className="text-sm font-semibold text-white truncate">
                                  {photo.sectionLabel}
                                </h3>
                              </div>

                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={captionValue}
                                  maxLength={MAX_LENGTHS.caption}
                                  placeholder="Photo caption..."
                                  onChange={(e) =>
                                    setCaptionDrafts((prev) => ({
                                      ...prev,
                                      [photo.id]: e.target.value,
                                    }))
                                  }
                                  className="flex-1 min-w-0 rounded-lg bg-slate-950 border border-slate-800 px-2.5 py-1.5 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#c19ee0]"
                                />
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleSaveCaption(photo)}
                                  title="Save caption"
                                  className="min-h-[32px] px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    fileInputRefs.current[photo.id]?.click()
                                  }
                                  className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg bg-[#7251b5] hover:bg-[#815ac0] text-[#f6f1fc] px-3 py-1.5 text-xs font-semibold cursor-pointer"
                                >
                                  <Upload className="w-3.5 h-3.5" />
                                  <span>Replace</span>
                                </button>

                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => void onTogglePhotoStatus(photo)}
                                    className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
                                  >
                                    {photo.status === 'published' ? (
                                      <Eye className="w-3.5 h-3.5" />
                                    ) : (
                                      <EyeOff className="w-3.5 h-3.5 text-amber-400" />
                                    )}
                                  </button>

                                  {confirmDeleteId === photo.id ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void onDeletePhoto(photo.id);
                                        setConfirmDeleteId(null);
                                      }}
                                      className="min-h-[36px] px-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold cursor-pointer"
                                    >
                                      Confirm
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteId(photo.id)}
                                      className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center rounded-lg border border-slate-700 hover:bg-red-950/60 hover:border-red-800 text-slate-400 hover:text-red-300 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ---------------- BACKGROUND MUSIC TAB ---------------- */}
          {activeTab === 'music' && (
            <form onSubmit={handleSaveMusicSubmit} className="space-y-6 pb-12">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Upload & Preview Column */}
                <section className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-5">
                  <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Music className="w-4 h-4 text-[#c19ee0]" />
                        <span>Upload Background Music Track</span>
                      </h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Auto-plays when visitors open the page (with instant tap-anywhere fallback if muted by browser policy).
                      </p>
                    </div>
                  </div>

                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file) {
                        void handleMusicFileSelect(file);
                      }
                    }}
                    className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/70 p-6 text-center cursor-pointer hover:border-[#c19ee0] transition-colors"
                  >
                    <Upload className="w-7 h-7 text-[#c19ee0] mb-2" />
                    <span className="text-sm font-medium text-slate-200">
                      {processingAudio
                        ? 'Processing audio file...'
                        : 'Click or drop an audio file here'}
                    </span>
                    <span className="text-xs text-slate-400 mt-1">
                      MP3, M4A, AAC, WAV, or OGG up to 9 MB
                    </span>
                    <input
                      type="file"
                      accept="audio/*,.mp3,.m4a,.wav,.ogg,.aac,.webm"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleMusicFileSelect(file);
                        }
                        e.target.value = '';
                      }}
                    />
                  </label>

                  {/* Audio Preview Card */}
                  {(pendingAudio || savedAudioPreviewSrc || (siteContent.bgMusicChunkCount ?? 0) > 0) && (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-emerald-400">
                          {pendingAudio
                            ? `Ready to publish · ${formatBytes(pendingAudio.byteLength)}${
                                pendingAudio.durationSeconds > 0
                                  ? ` · ${formatAudioTime(pendingAudio.durationSeconds)}`
                                  : ''
                              }`
                            : (siteContent.bgMusicChunkCount ?? 0) > 0
                              ? `Stored in Kingdom (${siteContent.bgMusicChunkCount} chunk${
                                  siteContent.bgMusicChunkCount === 1 ? '' : 's'
                                }${
                                  (siteContent.bgMusicDuration ?? 0) > 0
                                    ? ` · ${formatAudioTime(siteContent.bgMusicDuration ?? 0)}`
                                    : ''
                                })`
                              : 'External Audio URL'}
                        </span>
                        {(pendingAudio ||
                          (siteContent.bgMusicChunkCount ?? 0) > 0 ||
                          Boolean(siteContent.bgMusicUrl)) && (
                          <button
                            type="button"
                            disabled={savingMusic}
                            onClick={() => void handleRemoveMusicTrack()}
                            className="inline-flex items-center gap-1 text-xs text-red-300 hover:text-red-200 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Remove Track</span>
                          </button>
                        )}
                      </div>

                      {(pendingAudio?.audioDataUrl || savedAudioPreviewSrc) && (
                        <audio
                          controls
                          src={pendingAudio?.audioDataUrl || savedAudioPreviewSrc || undefined}
                          className="w-full"
                        />
                      )}
                    </div>
                  )}

                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>Or Paste Direct Audio URL (.mp3, .m4a, .ogg)</span>
                    </span>
                    <input
                      type="url"
                      maxLength={MAX_LENGTHS.bgMusicUrl}
                      value={musicUrlInput}
                      onChange={(e) => {
                        setMusicUrlInput(e.target.value);
                        if (e.target.value.trim()) {
                          setPendingAudio(null);
                        }
                      }}
                      placeholder="https://example.com/song.mp3"
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-[#c19ee0]"
                    />
                  </label>
                </section>

                {/* Metadata & Playback Behavior Column */}
                <section className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-white border-b border-slate-800 pb-3">
                    Player Details &amp; Auto-Play
                  </h2>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200">Track Title</span>
                      <span className="font-mono-tabular text-slate-400">
                        {musicTitle.length}/{MAX_LENGTHS.bgMusicTitle}
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={MAX_LENGTHS.bgMusicTitle}
                      value={musicTitle}
                      onChange={(e) => setMusicTitle(e.target.value)}
                      placeholder="Our Royal Soundtrack"
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#c19ee0]"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-200">Artist / Subtitle</span>
                      <span className="font-mono-tabular text-slate-400">
                        {musicSubtitle.length}/{MAX_LENGTHS.bgMusicSubtitle}
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={MAX_LENGTHS.bgMusicSubtitle}
                      value={musicSubtitle}
                      onChange={(e) => setMusicSubtitle(e.target.value)}
                      placeholder="Background Music"
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3.5 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#c19ee0]"
                    />
                  </label>

                  <div className="space-y-2.5 pt-2 border-t border-slate-800">
                    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 cursor-pointer">
                      <div>
                        <p className="text-xs font-medium text-white">Enable Background Music</p>
                        <p className="text-[11px] text-slate-400">
                          Show player controls and play on the live site
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={musicEnabled}
                        onChange={(e) => setMusicEnabled(e.target.checked)}
                        className="w-4 h-4 accent-[#7251b5] cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 cursor-pointer">
                      <div>
                        <p className="text-xs font-medium text-white">Auto-Play on Page Load</p>
                        <p className="text-[11px] text-slate-400">
                          Starts immediately or on first tap if browser restricts autoplay
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={musicAutoPlay}
                        onChange={(e) => setMusicAutoPlay(e.target.checked)}
                        className="w-4 h-4 accent-[#7251b5] cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 px-3.5 py-2.5 cursor-pointer">
                      <div>
                        <p className="text-xs font-medium text-white">Loop Continuously</p>
                        <p className="text-[11px] text-slate-400">
                          Replay automatically when the track finishes
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={musicLoop}
                        onChange={(e) => setMusicLoop(e.target.checked)}
                        className="w-4 h-4 accent-[#7251b5] cursor-pointer"
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={savingMusic || processingAudio}
                    className="w-full min-h-[42px] inline-flex items-center justify-center gap-2 rounded-lg bg-[#7251b5] hover:bg-[#815ac0] text-[#f6f1fc] px-4 py-2 text-sm font-semibold disabled:opacity-60 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>{savingMusic ? 'Publishing Music...' : 'Save & Publish Music'}</span>
                  </button>
                </section>
              </div>
            </form>
          )}

          {/* ---------------- TEXT & COPY EDITOR TAB ---------------- */}
          {activeTab === 'text' && (
            <form onSubmit={handleSaveText} className="space-y-6 pb-20">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Identity & Handles */}
                <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-white border-b border-slate-800 pb-2.5">
                    Identity &amp; Social Handles
                  </h2>
                  {renderField('Display Name', 'displayName', MAX_LENGTHS.displayName)}
                  {renderField('Account Subtitle', 'accountSubtitle', MAX_LENGTHS.accountSubtitle)}
                  {renderField('Instagram Handle', 'instagramHandle', MAX_LENGTHS.instagramHandle)}
                </section>

                {/* Hero & Bio */}
                <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-white border-b border-slate-800 pb-2.5">
                    Hero &amp; Bio Story
                  </h2>
                  {renderField('Bio Heading', 'bioTitle', MAX_LENGTHS.bioTitle)}
                  {renderField('Bio Story', 'bioText', MAX_LENGTHS.bioText, {
                    multiline: true,
                    rows: 6,
                  })}
                </section>

                {/* Stats & Buttons */}
                <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-white border-b border-slate-800 pb-2.5">
                    Profile Stats &amp; Action Buttons
                  </h2>
                  {renderField('Friends Label', 'friendsLabel', MAX_LENGTHS.friendsLabel)}
                  <div className="grid grid-cols-2 gap-3">
                    {renderField('Memories Value', 'memoriesCount', MAX_LENGTHS.memoriesCount)}
                    {renderField('Memories Label', 'memoriesLabel', MAX_LENGTHS.memoriesLabel)}
                    {renderField('Follower Value', 'followerCount', MAX_LENGTHS.followerCount)}
                    {renderField('Follower Label', 'followerLabel', MAX_LENGTHS.followerLabel)}
                    {renderField('Following Value', 'followingCount', MAX_LENGTHS.followingCount)}
                    {renderField('Following Label', 'followingLabel', MAX_LENGTHS.followingLabel)}
                    {renderField('Hug Button', 'hugButtonText', MAX_LENGTHS.hugButtonText)}
                    {renderField('Share Button', 'shareButtonText', MAX_LENGTHS.shareButtonText)}
                  </div>
                </section>

                {/* Social & Pinned Showcase */}
                <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
                  <h2 className="text-sm font-semibold text-white border-b border-slate-800 pb-2.5">
                    Social &amp; Pinned Showcase Card
                  </h2>
                  <div className="grid grid-cols-3 gap-3">
                    {renderField('Hugs Stat', 'tiktokHugs', MAX_LENGTHS.tiktokHugs)}
                    {renderField('Smiles Stat', 'tiktokSmiles', MAX_LENGTHS.tiktokSmiles)}
                    {renderField('Likes Stat', 'tiktokLikes', MAX_LENGTHS.tiktokLikes)}
                  </div>
                  {renderField('Pinned Subtitle', 'pinnedSubtitle', MAX_LENGTHS.pinnedSubtitle)}
                  {renderField('Pinned Caption', 'pinnedCaption', MAX_LENGTHS.pinnedCaption)}
                </section>

                {/* Love Letter */}
                <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4 lg:col-span-2">
                  <h2 className="text-sm font-semibold text-white border-b border-slate-800 pb-2.5">
                    Love Letter Section
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderField('Letter Heading', 'letterTitle', MAX_LENGTHS.letterTitle)}
                    {renderField('Letter Sign-off', 'letterSignoff', MAX_LENGTHS.letterSignoff)}
                  </div>
                  {renderField('Letter Body', 'letterBody', MAX_LENGTHS.letterBody, {
                    multiline: true,
                    rows: 6,
                    helper: 'Use blank lines to separate paragraphs.',
                  })}
                </section>

                {/* Finale, Music & Theme */}
                <section className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4 lg:col-span-2">
                  <h2 className="text-sm font-semibold text-white border-b border-slate-800 pb-2.5">
                    Finale, Soundtrack &amp; Default Theme
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {renderField('Finale Headline', 'finaleTitle', MAX_LENGTHS.finaleTitle)}
                    {renderField('Finale Button Text', 'finaleButtonText', MAX_LENGTHS.finaleButtonText)}
                    {renderField('Song Link Label', 'songLabel', MAX_LENGTHS.songLabel)}
                    {renderField('Song URL (YouTube / Audio)', 'songUrl', MAX_LENGTHS.songUrl)}
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-200">
                        Default Visitor Theme
                      </p>
                      <p className="text-[11px] text-slate-400">
                        Sets the initial light or dark appearance for visitors.
                      </p>
                    </div>
                    <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800">
                      {(['dark', 'light'] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() =>
                            setDraftContent((prev) => ({ ...prev, defaultTheme: mode }))
                          }
                          className={`px-3.5 py-1.5 rounded-md text-xs font-medium capitalize cursor-pointer ${
                            draftContent.defaultTheme === mode
                              ? 'bg-[#7251b5] text-[#f6f1fc]'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              </div>

              {/* Sticky Save Action Bar */}
              <div className="sticky bottom-4 z-10 rounded-xl border border-slate-700 bg-slate-900/95 backdrop-blur-md p-3.5 flex flex-wrap items-center justify-between gap-3 shadow-2xl">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftContent(DEFAULT_SITE_CONTENT)}
                    className="min-h-[38px] inline-flex items-center gap-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Load Default Copy</span>
                  </button>
                  {textDirty && (
                    <button
                      type="button"
                      onClick={() => setDraftContent(siteContent)}
                      className="min-h-[38px] px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer"
                    >
                      Discard
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={savingText}
                  className="min-h-[40px] inline-flex items-center gap-2 rounded-lg bg-[#7251b5] hover:bg-[#815ac0] text-[#f6f1fc] px-5 py-2 text-xs sm:text-sm font-semibold disabled:opacity-60 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingText ? 'Publishing...' : 'Save & Publish Text'}</span>
                </button>
              </div>
            </form>
          )}

          {/* ---------------- ADMIN ACCESS TAB ---------------- */}
          {activeTab === 'access' && (
            <div className="space-y-6">
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-3">
                <h2 className="text-sm font-semibold text-white">Current Session</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <p className="text-slate-400">Signed-in Email</p>
                    <p className="text-slate-100 font-medium mt-0.5">{user.email}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Role</p>
                    <p className="text-slate-100 font-medium mt-0.5">
                      {isSuperAdmin ? 'Primary Owner (Super Admin)' : 'Authorized Admin'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400">Firebase Auth UID</p>
                    <p className="font-mono-tabular text-slate-300 mt-0.5 truncate">
                      {user.uid}
                    </p>
                  </div>
                </div>
              </div>

              {isSuperAdmin ? (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  <form
                    onSubmit={handleGrantAdminSubmit}
                    className="lg:col-span-5 rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4"
                  >
                    <div className="space-y-1">
                      <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                        <UserPlus className="w-4 h-4 text-[#c19ee0]" />
                        <span>Authorize Additional Admin</span>
                      </h3>
                      <p className="text-xs text-slate-400">
                        Grant dashboard access to another verified Google user by entering their Firebase Auth UID and email.
                      </p>
                    </div>

                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-300">
                        Firebase Auth UID
                      </span>
                      <input
                        type="text"
                        required
                        value={adminUidInput}
                        onChange={(e) => setAdminUidInput(e.target.value)}
                        placeholder="e.g. aBcDeFg12345..."
                        className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-mono-tabular text-slate-100 focus:outline-none focus:border-[#c19ee0]"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-300">
                        Google Email Address
                      </span>
                      <input
                        type="email"
                        required
                        value={adminEmailInput}
                        onChange={(e) => setAdminEmailInput(e.target.value)}
                        placeholder="editor@example.com"
                        className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-[#c19ee0]"
                      />
                    </label>

                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-slate-300">
                        Display Name
                      </span>
                      <input
                        type="text"
                        value={adminNameInput}
                        onChange={(e) => setAdminNameInput(e.target.value)}
                        placeholder="Editor Name"
                        className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-[#c19ee0]"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={grantingAdmin}
                      className="w-full min-h-[40px] rounded-lg bg-[#7251b5] hover:bg-[#815ac0] text-[#f6f1fc] text-xs font-semibold cursor-pointer disabled:opacity-60"
                    >
                      {grantingAdmin ? 'Authorizing...' : 'Grant Admin Access'}
                    </button>
                  </form>

                  <div className="lg:col-span-7 rounded-xl border border-slate-800 bg-slate-900 overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-800">
                      <h3 className="text-sm font-semibold text-white">
                        Authorized Admins ({admins.length})
                      </h3>
                    </div>

                    {admins.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-500">
                        No secondary administrators added yet. You have full access as the primary owner.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800">
                        {admins.map((adm) => (
                          <div
                            key={adm.uid}
                            className="p-4 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-white truncate">
                                {adm.displayName}
                              </p>
                              <p className="text-xs text-slate-400 truncate">
                                {adm.email}
                              </p>
                              <p className="text-[11px] font-mono-tabular text-slate-500 truncate">
                                {adm.uid}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => void onRevokeAdmin(adm.uid)}
                              className="min-h-[34px] px-3 rounded-lg border border-slate-700 hover:bg-red-950/60 hover:border-red-800 text-xs text-slate-300 hover:text-red-300 cursor-pointer shrink-0"
                            >
                              Revoke
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 text-xs text-slate-400">
                  Only the primary kingdom owner can manage additional administrator permissions.
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Add / Upload Photos & Videos Modal */}
      {showAddModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add Photos or Videos"
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={resetAddModal}
        >
          <form
            onSubmit={handleCreateOrAssignPhoto}
            onClick={(e) => e.stopPropagation()}
            className="max-w-xl w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 p-6 space-y-5 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                Add Photos &amp; Videos
              </h2>
              <button
                type="button"
                onClick={resetAddModal}
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-400 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-slate-300">
                  Target Location
                </span>
                <select
                  value={newTargetSlot}
                  onChange={(e) => {
                    const nextSlot = e.target.value;
                    setNewTargetSlot(nextSlot);
                    if (nextSlot !== 'extra' && queuedItems.length > 1) {
                      setQueuedItems((prev) => prev.slice(0, 1));
                    }
                  }}
                  className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#c19ee0]"
                >
                  <option value="extra">Add to Extra Gallery Memories (Photos &amp; Videos)</option>
                  {SLOT_DEFINITIONS.map((s) => (
                    <option key={s.slotKey} value={s.slotKey}>
                      {s.slotKey.toUpperCase()} — {s.sectionLabel} ({s.aspectHint}
                      {s.category === 'collage' ? ' · Photo/Video' : ''})
                    </option>
                  ))}
                </select>
              </label>

              {newTargetSlot === 'extra' && queuedItems.length === 0 && (
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-300">
                    Default Memory Title
                  </span>
                  <input
                    type="text"
                    maxLength={MAX_LENGTHS.sectionLabel}
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="e.g. Golden Hour Walk"
                    className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#c19ee0]"
                  />
                </label>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">
                    {newTargetSlot === 'extra'
                      ? 'Select Photos & Videos Together (Multi-upload)'
                      : 'Upload Media File'}
                  </span>
                  {queuedItems.length > 0 && (
                    <span className="text-emerald-400 font-mono-tabular">
                      {queuedItems.length} ready
                    </span>
                  )}
                </div>

                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.length) {
                      void handleModalFiles(e.dataTransfer.files);
                    }
                  }}
                  className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-5 text-center cursor-pointer hover:border-[#c19ee0] transition-colors"
                >
                  <Upload className="w-6 h-6 text-slate-400 mb-2" />
                  <span className="text-xs font-medium text-slate-200">
                    {processingFiles
                      ? 'Processing selected files...'
                      : newTargetSlot === 'extra'
                        ? 'Click or drop photos & videos together'
                        : 'Click to choose file from device'}
                  </span>
                  <span className="text-[11px] text-slate-500 mt-0.5">
                    {newTargetSlot === 'extra' ||
                    SLOT_DEFINITIONS.find((s) => s.slotKey === newTargetSlot)?.category === 'collage'
                      ? 'Photos (JPEG, PNG, WebP) & Videos (MP4, WebM, MOV up to 9 MB)'
                      : 'Photos (JPEG, PNG, WebP)'}
                  </span>
                  <input
                    type="file"
                    accept={
                      newTargetSlot === 'extra' ||
                      SLOT_DEFINITIONS.find((s) => s.slotKey === newTargetSlot)?.category === 'collage'
                        ? 'image/*,video/*'
                        : 'image/*'
                    }
                    multiple={newTargetSlot === 'extra'}
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) {
                        void handleModalFiles(e.target.files);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>

                {/* Batch Queue Preview List */}
                {queuedItems.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {queuedItems.map((item) => (
                      <div
                        key={item.localId}
                        className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 flex items-start gap-3"
                      >
                        <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-slate-900 shrink-0">
                          <img
                            src={item.imageData}
                            alt={item.sectionLabel}
                            className="w-full h-full object-cover"
                          />
                          {item.mediaType === 'video' && (
                            <span className="absolute inset-0 bg-black/35 flex items-center justify-center">
                              <Play className="w-4 h-4 text-white fill-current" />
                            </span>
                          )}
                        </div>

                        <div className="flex-1 min-w-0 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-mono-tabular text-emerald-400">
                              {item.sizeLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setQueuedItems((prev) =>
                                  prev.filter((q) => q.localId !== item.localId)
                                )
                              }
                              aria-label="Remove item from batch"
                              className="text-slate-500 hover:text-red-300 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {newTargetSlot === 'extra' && (
                            <input
                              type="text"
                              maxLength={MAX_LENGTHS.sectionLabel}
                              value={item.sectionLabel}
                              onChange={(e) =>
                                setQueuedItems((prev) =>
                                  prev.map((q) =>
                                    q.localId === item.localId
                                      ? { ...q, sectionLabel: e.target.value }
                                      : q
                                  )
                                )
                              }
                              placeholder="Title..."
                              className="w-full rounded-md bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-[#c19ee0]"
                            />
                          )}

                          <input
                            type="text"
                            maxLength={MAX_LENGTHS.caption}
                            value={item.caption}
                            onChange={(e) =>
                              setQueuedItems((prev) =>
                                prev.map((q) =>
                                  q.localId === item.localId
                                    ? { ...q, caption: e.target.value }
                                    : q
                                )
                              )
                            }
                            placeholder="Optional caption..."
                            className="w-full rounded-md bg-slate-900 border border-slate-800 px-2 py-1 text-xs text-slate-100 focus:outline-none focus:border-[#c19ee0]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {queuedItems.length === 0 && (
                <>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                      <LinkIcon className="w-3.5 h-3.5" />
                      <span>Or Paste Direct Photo / Video / YouTube URL (Optional)</span>
                    </span>
                    <input
                      type="url"
                      value={newImageUrlInput}
                      onChange={(e) => setNewImageUrlInput(e.target.value)}
                      placeholder="https://... (.jpg, .png, .mp4, or YouTube link)"
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-[#c19ee0]"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-300">
                      Caption (Optional)
                    </span>
                    <input
                      type="text"
                      maxLength={MAX_LENGTHS.caption}
                      value={newCaption}
                      onChange={(e) => setNewCaption(e.target.value)}
                      placeholder="A short note shown in lightbox..."
                      className="w-full rounded-lg bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#c19ee0]"
                    />
                  </label>
                </>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={resetAddModal}
                className="min-h-[40px] px-4 py-2 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingNewPhoto || processingFiles}
                className="min-h-[40px] px-5 py-2 rounded-lg bg-[#7251b5] hover:bg-[#815ac0] text-[#f6f1fc] text-xs font-semibold disabled:opacity-60 cursor-pointer"
              >
                {submittingNewPhoto
                  ? publishProgress
                    ? `Publishing ${publishProgress.done}/${publishProgress.total}...`
                    : 'Publishing...'
                  : queuedItems.length > 1
                    ? `Publish All (${queuedItems.length})`
                    : 'Publish'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
