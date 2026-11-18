/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useRef, useState } from 'react';
import { Crown } from 'lucide-react';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLoginView } from './components/AdminLoginView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PublicKingdomView } from './components/PublicKingdomView';
import { useKingdomData } from './hooks/useKingdomData';
import { type ThemeMode } from './types/kingdom';

type AppRoute = 'public' | 'admin';

function KingdomApp() {
  const {
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
  } = useKingdomData();

  const [route, setRoute] = useState<AppRoute>(() =>
    window.location.hash === '#/admin' ? 'admin' : 'public'
  );
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const transitionTimerRef = useRef<number | null>(null);

  const [themeOverride, setThemeOverride] = useState<ThemeMode | null>(null);
  const activeTheme: ThemeMode = themeOverride ?? siteContent.defaultTheme ?? 'dark';

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoadTimedOut(true);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    if (activeTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [activeTheme]);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(window.location.hash === '#/admin' ? 'admin' : 'public');
      setIsFadingOut(false);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
      if (transitionTimerRef.current !== null) {
        window.clearTimeout(transitionTimerRef.current);
      }
    };
  }, []);

  const navigateTo = (nextRoute: AppRoute) => {
    if (nextRoute === route) return;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setRoute(nextRoute);
      window.location.hash = nextRoute === 'admin' ? '#/admin' : '';
      window.scrollTo({ top: 0 });
      return;
    }

    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
    }

    setIsFadingOut(true);
    transitionTimerRef.current = window.setTimeout(() => {
      setRoute(nextRoute);
      window.location.hash = nextRoute === 'admin' ? '#/admin' : '';
      window.scrollTo({ top: 0 });
      setIsFadingOut(false);
      transitionTimerRef.current = null;
    }, 160);
  };

  const isPublicHydrated = (contentLoaded && photosLoaded) || loadTimedOut;

  const viewKey =
    route === 'admin'
      ? !authReady || !user || !adminCheckDone || !isAdmin
        ? 'admin-login'
        : 'admin-dashboard'
      : isPublicHydrated
        ? 'public-kingdom'
        : 'public-loading';

  const activeView = (() => {
    if (route === 'admin') {
      if (!authReady || !user || !adminCheckDone || !isAdmin) {
        return (
          <AdminLoginView
            user={user}
            authReady={authReady}
            adminCheckDone={adminCheckDone}
            isAdmin={isAdmin}
            signingIn={signingIn}
            authError={authError}
            onSignIn={() => void signInWithGoogle()}
            onSignOut={() => void signOut()}
            onBackToSite={() => navigateTo('public')}
          />
        );
      }

      return (
        <AdminDashboard
          user={user}
          isSuperAdmin={isSuperAdmin}
          siteContent={siteContent}
          hasRemoteContent={hasRemoteContent}
          photos={photos}
          admins={admins}
          onSaveSiteContent={saveSiteContent}
          onSaveBackgroundMusic={saveBackgroundMusic}
          onLoadBackgroundMusic={loadBackgroundMusicSource}
          onSavePhotoSlot={savePhotoSlot}
          onAddExtraPhoto={addExtraPhoto}
          onAddExtraMediaBatch={addExtraMediaBatch}
          onTogglePhotoStatus={togglePhotoStatus}
          onDeletePhoto={deletePhoto}
          onGrantAdmin={grantAdminAccess}
          onRevokeAdmin={revokeAdminAccess}
          onViewSite={() => navigateTo('public')}
          onSignOut={() => {
            void signOut();
            navigateTo('public');
          }}
        />
      );
    }

    if (!isPublicHydrated) {
      return (
        <div
          role="status"
          aria-live="polite"
          className="min-h-screen bg-[var(--kingdom-bg)] text-[var(--kingdom-ink)] flex flex-col items-center justify-center p-6 gap-4"
        >
          <div className="w-16 h-16 rounded-full bg-[var(--kingdom-wine)] text-[var(--kingdom-ivory)] border border-[var(--kingdom-ivory)]/25 flex items-center justify-center shadow-lg animate-pulse">
            <Crown className="w-7 h-7" />
          </div>
          <p className="font-display text-lg font-semibold tracking-wide text-[var(--kingdom-ink)]">
            Opening the Kingdom...
          </p>
        </div>
      );
    }

    return (
      <PublicKingdomView
        content={siteContent}
        photos={photos}
        theme={activeTheme}
        onToggleTheme={() =>
          setThemeOverride(activeTheme === 'dark' ? 'light' : 'dark')
        }
        isAdmin={isAdmin}
        onOpenAdmin={() => navigateTo('admin')}
        onLoadVideoSource={loadVideoSource}
        onLoadBackgroundMusic={loadBackgroundMusicSource}
      />
    );
  })();

  return (
    <div
      key={viewKey}
      className={`view-fade-in transition-opacity duration-150 ease-out ${
        isFadingOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {activeView}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <KingdomApp />
    </ErrorBoundary>
  );
}
