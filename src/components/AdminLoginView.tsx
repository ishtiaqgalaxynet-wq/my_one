import React from 'react';
import { type User } from 'firebase/auth';
import { ArrowLeft, Crown, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';

interface AdminLoginViewProps {
  user: User | null;
  authReady: boolean;
  adminCheckDone: boolean;
  isAdmin: boolean;
  signingIn: boolean;
  authError: string | null;
  onSignIn: () => void;
  onSignOut: () => void;
  onBackToSite: () => void;
}

export const AdminLoginView: React.FC<AdminLoginViewProps> = ({
  user,
  authReady,
  adminCheckDone,
  isAdmin,
  signingIn,
  authError,
  onSignIn,
  onSignOut,
  onBackToSite,
}) => {
  const isChecking = !authReady || (Boolean(user) && !adminCheckDone);
  const unauthorized = Boolean(user) && adminCheckDone && !isAdmin;

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 flex flex-col justify-between p-6">
      <div className="max-w-5xl w-full mx-auto">
        <button
          type="button"
          onClick={onBackToSite}
          className="inline-flex items-center gap-2 text-sm text-slate-300 hover:text-white transition-colors min-h-[40px] cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to The Princess Kingdom</span>
        </button>
      </div>

      <div className="max-w-md w-full mx-auto rounded-2xl bg-slate-900 border border-slate-800 p-8 space-y-6 shadow-xl">
        <div className="space-y-2">
          <div className="w-11 h-11 rounded-xl bg-[#7251b5] text-[#f6f1fc] flex items-center justify-center">
            <Crown className="w-5 h-5" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">
            Admin Portal Sign In
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed">
            Sign in with an authorized Google account to manage photos, edit website copy, and publish updates.
          </p>
        </div>

        {isChecking ? (
          <div className="py-6 text-center text-sm text-slate-400">
            Verifying administrator session...
          </div>
        ) : unauthorized && user ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-red-950/50 border border-red-800/70 p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-300 font-semibold text-sm">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Access Denied</span>
              </div>
              <p className="text-xs text-red-200/85 leading-relaxed">
                Signed in as <span className="font-mono-tabular">{user.email}</span>, which does not have administrator permissions for this site.
              </p>
              <p className="text-[11px] text-red-200/70 font-mono-tabular break-all">
                UID: {user.uid}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onSignOut}
                className="flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out &amp; Switch Account</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {authError && (
              <div className="rounded-xl bg-red-950/50 border border-red-800/70 p-3 text-xs text-red-200">
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={onSignIn}
              disabled={signingIn}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-3 rounded-xl bg-white text-slate-900 font-semibold text-sm px-5 py-3 hover:bg-slate-100 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-[#6247aa]" />
              <span>{signingIn ? 'Signing in with Google...' : 'Continue with Google'}</span>
            </button>

            <p className="text-xs text-slate-500 text-center">
              Protected by Firebase Authentication and Firestore security rules.
            </p>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-slate-500">
        The Princess Kingdom · Content Administration
      </div>
    </div>
  );
};
