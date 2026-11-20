# Security Specification & TDD Plan — The Princess Kingdom

## 1. Data Invariants
1. **Public Read / Admin-Only Write Separation**: Visitors can read `site_content` and `published` items in `photos` without signing in, but NO unauthenticated or non-admin user may ever create, update, or delete any document in `site_content`, `photos`, or `admins`.
2. **Verified Admin Identity**: Every admin check requires `request.auth != null && request.auth.token.email_verified == true`, and either matches the bootstrapped owner email (`ishtiaqhimel11@gmail.com`) or has a document in `/admins/$(request.auth.uid)`.
3. **Strict Schema & Key Whitelisting**: Every write to `site_content`, `photos`, and `admins` must pass exact `keys().hasAll(...)` and `keys().hasOnly(...)` validation plus string length bounds to prevent shadow fields and payload exhaustion.
4. **Temporal & Author Integrity**: `updatedAt` (and `createdAt` on `/admins`) must equal `request.time`, and `updatedByUid` / `createdByUid` must equal `request.auth.uid`.
5. **PII Isolation**: `/admins/{adminUid}` contains email addresses and is readable only by the matching user (`request.auth.uid == adminUid`) or an active admin; `allow list` on `/admins` is restricted solely to the bootstrap owner (`isBootstrapAdmin()`).
6. **Path ID Hardening**: All single-document operations enforce `isValidId()` (`^[a-zA-Z0-9_-]+$`, max 128 chars).
7. **Media & Music Chunk Master Gate**: `/photos/{photoId}/chunks/{chunkId}` and `/site_content/{docId}/music_chunks/{chunkId}` require parent document existence for writes, enforce `<= 700,000` chars per chunk, disable collection-wide `list`, and gate `get` on parent publication (`status == 'published'` or `bgMusicEnabled == true`) or `isAdmin()`.
8. **Monotonic Public Counters**: `/site_stats/counters` and `/site_stats_daily/{dateKey}` (`YYYY-MM-DD`) are readable via `get` and restrict public updates to strict `+1` increments on either `hugCount` or `visitorCount` individually with `updatedAt == request.time`. Public users cannot decrement, inflate by `> 1`, inject extra fields, or list the collections.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated `site_content` write**: `setDoc('/site_content/main', {...})` with `auth = null` -> `PERMISSION_DENIED`.
2. **Non-admin verified user updating `site_content`**: Authenticated user `other@example.com` tries to update `displayName` -> `PERMISSION_DENIED`.
3. **Email spoofing without verification**: `auth.token.email = 'ishtiaqhimel11@gmail.com'` with `email_verified = false` -> `PERMISSION_DENIED`.
4. **Shadow field injection on `site_content`**: Admin sends valid fields plus `isSuperUser: true` -> `PERMISSION_DENIED`.
5. **Client-forged timestamp on `photos`**: Admin sends `updatedAt: new Date('2020-01-01')` instead of `serverTimestamp()` -> `PERMISSION_DENIED`.
6. **Spoofed `updatedByUid` on `photos`**: Admin sends `updatedByUid: 'someone-else'` -> `PERMISSION_DENIED`.
7. **Oversized `imageData` / `chunk` payload**: Admin tries to write a 950KB string into `photos/s0` or >700KB into `chunks/0` -> `PERMISSION_DENIED`.
8. **Invalid `slotKey` / path ID poisoning**: Write to `/photos/bad$id/..` or `id` > 128 chars -> `PERMISSION_DENIED`.
9. **Self-escalation to `/admins`**: Non-admin user tries to create `/admins/{myUid}` with `role: 'admin'` -> `PERMISSION_DENIED`.
10. **Secondary admin escalating or deleting other admins**: Non-bootstrap admin tries to write or delete `/admins/{otherUid}` -> `PERMISSION_DENIED`.
11. **PII scraping via `list` on `/admins`**: Non-bootstrap user runs `getDocs(collection(db, 'admins'))` -> `PERMISSION_DENIED`.
12. **Reading hidden draft photos or their video chunks as public visitor**: Unauthenticated user runs `getDocs(collection(db, 'photos'))` without `where('status', '==', 'published')` or `getDoc('/photos/hiddenId/chunks/0')` -> `PERMISSION_DENIED`.
13. **Counter tampering on `/site_stats/counters`**: Public visitor tries to set `hugCount: 9999` or decrement `visitorCount` -> `PERMISSION_DENIED`.
