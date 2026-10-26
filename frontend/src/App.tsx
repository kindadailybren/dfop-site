import React, { useCallback, useEffect, useState } from 'react';
import {
  PublicStateResponse,
} from '@dfop/shared';
import { AdminConsoleView } from './components/AdminConsoleView.js';
import {
  HistoryIcon,
  PitchIcon,
  RefreshIcon,
  ShieldLockIcon,
  TrophyIcon,
} from './components/Icons.js';
import { LeaderboardView } from './components/LeaderboardView.js';
import { MatchdayView } from './components/MatchdayView.js';
import { SessionsArchiveView } from './components/SessionsArchiveView.js';
import {
  createGameApi,
  createSessionApi,
  fetchPublicState,
  finalizeSessionApi,
  updateGameApi,
  updateParticipantsApi,
} from './lib/apiClient.js';

type ActiveTab = 'matchday' | 'leaderboard' | 'sessions' | 'admin';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('matchday');
  const [selectedPerformanceSessionId, setSelectedPerformanceSessionId] =
    useState<string | null>(null);
  const [state, setState] = useState<PublicStateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadState = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setSyncing(true);
    try {
      const data = await fetchPublicState();
      setState(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to reach DFOP API server.'
      );
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    void loadState(false);
  }, [loadState]);

  // Auto-poll every 12 seconds so players at the pitch see live updates
  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadState(true);
    }, 12000);
    return () => window.clearInterval(timer);
  }, [loadState]);

  return (
    <div className="min-h-screen flex flex-col bg-[#070B14] text-[#F8FAFC]">
      {/* Top Club Header Bar built around the DFOP Crest */}
      <header className="sticky top-0 z-30 border-b border-slate-800/90 bg-[#070B14]/95">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between gap-4 py-2.5">
          <button
            type="button"
            onClick={() => setActiveTab('matchday')}
            className="flex items-center gap-3 text-left cursor-pointer group"
          >
            <img
              src="/dfoplogo.png"
              alt="Davao Football Open Play Crest"
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-full object-contain shrink-0 ring-2 ring-[#3B82F6]/40 group-hover:ring-[#60A5FA] transition-all"
            />
            <div>
              <span className="font-display font-bold text-base sm:text-lg text-white tracking-tight block leading-tight">
                DAVAO FOOTBALL OPEN PLAY
              </span>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-1.5 bg-[#0E1628] p-1 rounded-xl border border-slate-800"
          >
            <button
              type="button"
              onClick={() => setActiveTab('matchday')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'matchday'
                  ? 'bg-[#1447E6] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <PitchIcon className="w-4 h-4" />
              <span>Matchday Live</span>
              {state?.activeSession && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('leaderboard')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'leaderboard'
                  ? 'bg-[#1447E6] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <TrophyIcon className="w-4 h-4" />
              <span>Session Performance</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('sessions')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'sessions'
                  ? 'bg-[#1447E6] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <HistoryIcon className="w-4 h-4" />
              <span>Past Sessions</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeTab === 'admin'
                  ? 'bg-[#1447E6] text-white'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <ShieldLockIcon className="w-4 h-4" />
              <span>Admin</span>
            </button>
          </nav>

          {/* Sync Status & Manual Refresh */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadState(true)}
              title="Refresh live matchday state"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0E1628] hover:bg-[#15203B] border border-slate-800 text-xs text-slate-300 hover:text-white transition-colors cursor-pointer tabular-nums"
            >
              <RefreshIcon
                className={`w-3.5 h-3.5 text-[#60A5FA] ${
                  syncing ? 'animate-spin' : ''
                }`}
              />
              <span className="hidden sm:inline">
                {syncing ? 'Syncing...' : 'Live Sync'}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Bottom-of-Header Navigation */}
        <nav
          aria-label="Mobile navigation"
          className="md:hidden grid grid-cols-4 gap-1 px-3 pb-2.5 border-t border-slate-800/60 pt-2"
        >
          <button
            type="button"
            onClick={() => setActiveTab('matchday')}
            className={`flex flex-col items-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
              activeTab === 'matchday'
                ? 'bg-[#1447E6] text-white'
                : 'text-slate-300'
            }`}
          >
            <PitchIcon className="w-4 h-4" />
            <span>Live Pitch</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('leaderboard')}
            className={`flex flex-col items-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
              activeTab === 'leaderboard'
                ? 'bg-[#1447E6] text-white'
                : 'text-slate-300'
            }`}
          >
            <TrophyIcon className="w-4 h-4" />
            <span>Stats</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sessions')}
            className={`flex flex-col items-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
              activeTab === 'sessions'
                ? 'bg-[#1447E6] text-white'
                : 'text-slate-300'
            }`}
          >
            <HistoryIcon className="w-4 h-4" />
            <span>Sessions</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-[#1447E6] text-white'
                : 'text-slate-300'
            }`}
          >
            <ShieldLockIcon className="w-4 h-4" />
            <span>Admin</span>
          </button>
        </nav>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {error && (
          <div className="mb-6 p-4 rounded-xl border border-rose-500/35 bg-rose-500/15 text-xs sm:text-sm text-rose-200 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => void loadState(false)}
              className="px-3 py-1 rounded bg-rose-600 text-white text-xs font-semibold cursor-pointer"
            >
              Retry Connection
            </button>
          </div>
        )}

        {loading && !state ? (
          <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-12 text-center text-sm text-slate-300">
            Loading Davao Football Open Play matchday telemetry...
          </div>
        ) : state ? (
          <>
            {activeTab === 'matchday' && (
              <MatchdayView
                session={state.activeSession}
                onOpenAdmin={() => setActiveTab('admin')}
              />
            )}

            {activeTab === 'leaderboard' && (
              <LeaderboardView
                activeSession={state.activeSession}
                recentSessions={state.recentSessions}
                initialSessionId={selectedPerformanceSessionId}
              />
            )}

            {activeTab === 'sessions' && (
              <SessionsArchiveView
                sessions={state.recentSessions}
                onSelectSessionPerformance={(sessionId) => {
                  setSelectedPerformanceSessionId(sessionId);
                  setActiveTab('leaderboard');
                }}
              />
            )}

            {activeTab === 'admin' && (
              <AdminConsoleView
                activeSession={state.activeSession}
                allPlayers={state.leaderboard}
                onCreateSession={async (input) => {
                  const res = await createSessionApi(input);
                  setState((prev) =>
                    prev ? { ...prev, activeSession: res.session } : prev
                  );
                  await loadState(true);
                }}
                onUpdateParticipants={async (input) => {
                  if (!state.activeSession) return;
                  const res = await updateParticipantsApi(
                    state.activeSession.id,
                    input
                  );
                  setState((prev) =>
                    prev ? { ...prev, activeSession: res.session } : prev
                  );
                }}
                onCreateGame={async (input) => {
                  if (!state.activeSession) return;
                  const res = await createGameApi(
                    state.activeSession.id,
                    input
                  );
                  setState((prev) =>
                    prev ? { ...prev, activeSession: res.session } : prev
                  );
                }}
                onUpdateGame={async (gameId, input) => {
                  if (!state.activeSession) return;
                  const res = await updateGameApi(
                    state.activeSession.id,
                    gameId,
                    input
                  );
                  setState((prev) =>
                    prev ? { ...prev, activeSession: res.session } : prev
                  );
                }}
                onFinalizeSession={async (input) => {
                  if (!state.activeSession) return;
                  const res = await finalizeSessionApi(
                    state.activeSession.id,
                    input
                  );
                  setState((prev) =>
                    prev
                      ? {
                          ...prev,
                          activeSession: null,
                          leaderboard: res.leaderboard,
                          recentSessions: [res.session, ...prev.recentSessions],
                        }
                      : prev
                  );
                }}
              />
            )}
          </>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#070B14] py-5 px-4 sm:px-6 lg:px-8 text-xs text-slate-400">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src="/dfoplogo.png"
              alt="DFOP Crest"
              className="w-6 h-6 rounded-full"
            />
            <span>
              Davao Football Open Play (DFOP) ·{' '}
              <strong className="text-slate-300">dfop.breindel.me</strong>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
