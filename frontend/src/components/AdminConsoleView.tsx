import React, { useEffect, useMemo, useState } from 'react';
import {
  FORMAT_TEAM_SIZE,
  FuzzyPlayerMatch,
  GameFormat,
  PlayerProfile,
  PositionLine,
  SessionParticipant,
  SessionRecord,
  SkillLevel,
  computeTeamMetrics,
  findFuzzyMatches,
  generateBalancedTeams,
  generateSampleCsv,
  getSuggestedSessionMvp,
  normalizePlayerName,
  parseParticipantsCsv,
} from '@dfop/shared';
import {
  AdminUserSession,
  clearAdminSession,
  getSavedAdminSession,
  signInAdmin,
} from '../lib/auth.js';
import {
  CheckCircleIcon,
  DownloadIcon,
  ShieldLockIcon,
  ShuffleIcon,
  StarBadgeIcon,
  UploadIcon,
} from './Icons.js';

interface AdminConsoleViewProps {
  activeSession: SessionRecord | null;
  allPlayers: PlayerProfile[];
  onCreateSession: (input: {
    title: string;
    date: string;
    location: string;
    defaultFormat: GameFormat;
    csvText: string;
    fuzzyAliasMap: Record<string, string>;
  }) => Promise<void>;
  onUpdateParticipants: (input: {
    togglePlayerId?: string;
    active?: boolean;
    addPlayer?: {
      name: string;
      skill: SkillLevel;
      preferredPosition: PositionLine;
    };
    csvText?: string;
  }) => Promise<void>;
  onCreateGame: (input: {
    format: GameFormat;
    teamAName: string;
    teamBName: string;
    teamAPlayerIds: string[];
    teamBPlayerIds: string[];
    benchPlayerIds: string[];
  }) => Promise<void>;
  onUpdateGame: (
    gameId: string,
    input: {
      scoreA?: number;
      scoreB?: number;
      status?: 'upcoming' | 'live' | 'completed';
      playerStats?: Record<string, { goals: number; assists: number }>;
      mvpPlayerId?: string | null;
    }
  ) => Promise<void>;
  onFinalizeSession: (input: {
    sessionMvpPlayerId?: string;
    notes?: string;
  }) => Promise<void>;
}

export const AdminConsoleView: React.FC<AdminConsoleViewProps> = ({
  activeSession,
  allPlayers,
  onCreateSession,
  onUpdateParticipants,
  onCreateGame,
  onUpdateGame,
  onFinalizeSession,
}) => {
  const [adminUser, setAdminUser] = useState<AdminUserSession | null>(() =>
    getSavedAdminSession()
  );
  const [username, setUsername] = useState('breindelm6@gmail.com');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // New Session CSV state
  const [sessionTitle, setSessionTitle] = useState(
    'Davao Open Play — Floodlit Session'
  );
  const [sessionDate, setSessionDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [sessionLocation, setSessionLocation] = useState(
    'Azuela Cove Pitch, Davao City'
  );
  const [defaultFormat, setDefaultFormat] = useState<GameFormat>('7-aside');
  const [csvText, setCsvText] = useState(() => generateSampleCsv());
  const [fuzzyAliasMap, setFuzzyAliasMap] = useState<Record<string, string>>({});
  const [actionBusy, setActionBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Team Maker interactive state
  const [makerFormat, setMakerFormat] = useState<GameFormat>(
    activeSession?.defaultFormat ?? '7-aside'
  );
  const [teamAName, setTeamAName] = useState('DFOP Royal Blue');
  const [teamBName, setTeamBName] = useState('DFOP Crest White');
  const [lockedAIds, setLockedAIds] = useState<string[]>([]);
  const [lockedBIds, setLockedBIds] = useState<string[]>([]);
  const [lockedBenchIds, setLockedBenchIds] = useState<string[]>([]);
  const [draftTeamAIds, setDraftTeamAIds] = useState<string[]>([]);
  const [draftTeamBIds, setDraftTeamBIds] = useState<string[]>([]);
  const [draftBenchIds, setDraftBenchIds] = useState<string[]>([]);

  // Walk-in player state
  const [walkInName, setWalkInName] = useState('');
  const [walkInSkill, setWalkInSkill] = useState<SkillLevel>('Intermediate');
  const [walkInPos, setWalkInPos] = useState<PositionLine>('MID');

  // Finalize Session MVP state
  const [selectedSessionMvpId, setSelectedSessionMvpId] = useState<string>('');

  // Parse CSV preview and fuzzy matches locally
  const csvPreview = useMemo(() => {
    const parsed = parseParticipantsCsv(csvText);
    const fuzzyMatches: FuzzyPlayerMatch[] = findFuzzyMatches(
      parsed.rows,
      allPlayers
    );
    return { ...parsed, fuzzyMatches };
  }, [csvText, allPlayers]);

  // Run initial balanced team generation whenever activeSession or format changes
  useEffect(() => {
    if (!activeSession) return;
    const generated = generateBalancedTeams({
      format: makerFormat,
      participants: activeSession.participants,
      games: activeSession.games,
      lockedTeamAIds: lockedAIds,
      lockedTeamBIds: lockedBIds,
      lockedBenchIds: lockedBenchIds,
    });
    setDraftTeamAIds(generated.teamA.map((p) => p.playerId));
    setDraftTeamBIds(generated.teamB.map((p) => p.playerId));
    setDraftBenchIds(generated.bench.map((p) => p.playerId));
  }, [activeSession?.id, makerFormat]);

  useEffect(() => {
    if (!activeSession) return;
    const suggested = getSuggestedSessionMvp(activeSession);
    if (suggested && !selectedSessionMvpId) {
      setSelectedSessionMvpId(suggested.playerId);
    }
  }, [activeSession, selectedSessionMvpId]);

  const participantsById = useMemo(() => {
    const map = new Map<string, SessionParticipant>();
    if (!activeSession) return map;
    for (const p of activeSession.participants) {
      map.set(p.playerId, p);
    }
    return map;
  }, [activeSession]);

  const draftMetrics = useMemo(() => {
    const resolve = (ids: string[]) =>
      ids
        .map((id) => participantsById.get(id))
        .filter((p): p is SessionParticipant => Boolean(p));
    return computeTeamMetrics(
      resolve(draftTeamAIds),
      resolve(draftTeamBIds),
      resolve(draftBenchIds)
    );
  }, [draftTeamAIds, draftTeamBIds, draftBenchIds, participantsById]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const session = await signInAdmin(username, password);
      setAdminUser(session);
      setPassword('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([generateSampleCsv()], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dfop-session-participants.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const runAutoBalance = () => {
    if (!activeSession) return;
    const generated = generateBalancedTeams({
      format: makerFormat,
      participants: activeSession.participants,
      games: activeSession.games,
      lockedTeamAIds: lockedAIds,
      lockedTeamBIds: lockedBIds,
      lockedBenchIds: lockedBenchIds,
      seed: Date.now(),
    });
    setDraftTeamAIds(generated.teamA.map((p) => p.playerId));
    setDraftTeamBIds(generated.teamB.map((p) => p.playerId));
    setDraftBenchIds(generated.bench.map((p) => p.playerId));
  };

  const movePlayerAssignment = (
    playerId: string,
    target: 'A' | 'B' | 'BENCH'
  ) => {
    setDraftTeamAIds((prev) => prev.filter((id) => id !== playerId));
    setDraftTeamBIds((prev) => prev.filter((id) => id !== playerId));
    setDraftBenchIds((prev) => prev.filter((id) => id !== playerId));

    if (target === 'A') {
      setDraftTeamAIds((prev) => [...prev, playerId]);
    } else if (target === 'B') {
      setDraftTeamBIds((prev) => [...prev, playerId]);
    } else {
      setDraftBenchIds((prev) => [...prev, playerId]);
    }
  };

  const toggleLock = (playerId: string, target: 'A' | 'B' | 'BENCH') => {
    setLockedAIds((prev) => prev.filter((id) => id !== playerId));
    setLockedBIds((prev) => prev.filter((id) => id !== playerId));
    setLockedBenchIds((prev) => prev.filter((id) => id !== playerId));

    const alreadyLocked =
      (target === 'A' && lockedAIds.includes(playerId)) ||
      (target === 'B' && lockedBIds.includes(playerId)) ||
      (target === 'BENCH' && lockedBenchIds.includes(playerId));

    if (!alreadyLocked) {
      if (target === 'A') setLockedAIds((prev) => [...prev, playerId]);
      if (target === 'B') setLockedBIds((prev) => [...prev, playerId]);
      if (target === 'BENCH') setLockedBenchIds((prev) => [...prev, playerId]);
      movePlayerAssignment(playerId, target);
    }
  };

  if (!adminUser) {
    const isCognitoConfigured = Boolean(
      import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID
    );
    return (
      <section className="max-w-md mx-auto my-8 rounded-xl border border-slate-800 bg-[#0E1628] p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-[#1447E6]/20 border border-[#3B82F6]/40 flex items-center justify-center text-[#60A5FA]">
            <ShieldLockIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-white">
              DFOP Admin Sign In
            </h1>
            <p className="text-xs text-slate-300">
              {isCognitoConfigured
                ? 'Authenticated via AWS Cognito User Pool'
                : 'Local Admin Console Mode (Cognito ready on deploy)'}
            </p>
          </div>
        </div>

        {authError && (
          <div className="mb-4 p-3 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
            {authError}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label
              htmlFor="admin-username"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Admin Email or Username
            </label>
            <input
              id="admin-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-3.5 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-sm text-white"
            />
          </div>
          <div>
            <label
              htmlFor="admin-password"
              className="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter admin password"
              required
              className="w-full px-3.5 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-sm text-white"
            />
          </div>
          <button
            type="submit"
            disabled={authLoading}
            className="w-full py-2.5 px-4 rounded-lg bg-[#1447E6] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-semibold text-sm transition-colors cursor-pointer"
          >
            {authLoading ? 'Signing in...' : 'Unlock Admin Console'}
          </button>
        </form>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {/* Admin Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-800 bg-[#0E1628] px-5 py-3.5">
        <div className="flex items-center gap-2.5 text-xs text-slate-300">
          <ShieldLockIcon className="w-4 h-4 text-[#60A5FA]" />
          <span>
            Signed in as <strong className="text-white">{adminUser.username}</strong>
          </span>
          <span className="px-2 py-0.5 rounded bg-[#15203B] text-[#93C5FD] border border-[#3B82F6]/30 font-mono-code">
            {adminUser.isCognito ? 'AWS Cognito JWT' : 'Local Admin Session'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            clearAdminSession();
            setAdminUser(null);
          }}
          className="text-xs text-slate-300 hover:text-white underline cursor-pointer self-start sm:self-auto"
        >
          Sign Out
        </button>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border text-xs sm:text-sm flex items-center justify-between ${
            feedback.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
              : 'bg-rose-500/15 border-rose-500/35 text-rose-200'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline ml-4 cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* If NO active session exists -> Show CSV Upload & New Session Setup */}
      {!activeSession ? (
        <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-white">
                Start New Davao Football Open Play Session
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 mt-1">
                Upload your DFOP sheet `.csv` (`Payment, Name, Position, Experience, Games played`)
                or copy-paste directly from Google Sheets (supports `/`, numbered names,
                `Defense`, `Attack`, `Attack/Defense`, `GK/Attack/Defense`, and `Beginner`/`Interm`/`Adv`).
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#15203B] hover:bg-[#1E2D4D] border border-slate-700 text-xs font-semibold text-white transition-colors cursor-pointer shrink-0"
            >
              <DownloadIcon className="w-4 h-4 text-[#60A5FA]" />
              Download Sample CSV
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Session Title
              </label>
              <input
                type="text"
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs sm:text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Session Date
              </label>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs sm:text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Pitch Location
              </label>
              <input
                type="text"
                value={sessionLocation}
                onChange={(e) => setSessionLocation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs sm:text-sm text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Default Pitch Format
              </label>
              <select
                value={defaultFormat}
                onChange={(e) => setDefaultFormat(e.target.value as GameFormat)}
                className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs sm:text-sm text-white"
              >
                <option value="7-aside">7-a-side (14 on pitch)</option>
                <option value="9-aside">9-a-side (18 on pitch)</option>
                <option value="11-aside">11-a-side (22 on pitch)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300">
                  DFOP Sheet Paste or CSV (`Payment, Name, Position, Experience`)
                </label>
                <label className="inline-flex items-center gap-1.5 px-3 py-1 rounded bg-[#1447E6]/20 border border-[#3B82F6]/40 text-xs text-[#93C5FD] hover:text-white cursor-pointer">
                  <UploadIcon className="w-3.5 h-3.5" />
                  <span>Upload .CSV File</span>
                  <input
                    type="file"
                    accept=".csv,text/csv,text/plain"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>
              <textarea
                rows={12}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="w-full p-3 rounded-lg bg-[#070B14] border border-slate-700 font-mono-code text-xs text-slate-200"
              />
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-[#15203B]/60 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-display font-bold text-sm text-white">
                    CSV Validation & Returning Player Match
                  </h2>
                  <span className="font-mono-code text-xs text-[#60A5FA] tabular-nums">
                    {csvPreview.rows.length} valid players
                  </span>
                </div>

                {csvPreview.errors.length > 0 && (
                  <div className="p-3 rounded bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200 space-y-1">
                    {csvPreview.errors.map((err, i) => (
                      <div key={i}>{err}</div>
                    ))}
                  </div>
                )}

                {csvPreview.fuzzyMatches.filter((m) => !m.exactNormalized).length >
                  0 && (
                  <div className="p-3 rounded bg-amber-500/15 border border-amber-400/30 text-xs text-amber-200 space-y-2">
                    <div className="font-semibold text-white">
                      Similar Player Names Detected in Database:
                    </div>
                    {csvPreview.fuzzyMatches
                      .filter((m) => !m.exactNormalized)
                      .map((m) => {
                        const norm = normalizePlayerName(m.csvName);
                        const isLinked = fuzzyAliasMap[norm] === m.matchedPlayerId;
                        return (
                          <div
                            key={m.csvName}
                            className="flex items-center justify-between gap-2 pt-1"
                          >
                            <span>
                              CSV <strong>&ldquo;{m.csvName}&rdquo;</strong> looks
                              like existing{' '}
                              <strong>&ldquo;{m.matchedPlayerName}&rdquo;</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setFuzzyAliasMap((prev) => {
                                  const next = { ...prev };
                                  if (next[norm]) delete next[norm];
                                  else next[norm] = m.matchedPlayerId;
                                  return next;
                                })
                              }
                              className={`px-2.5 py-1 rounded font-semibold cursor-pointer ${
                                isLinked
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-800 text-slate-200 border border-slate-600'
                              }`}
                            >
                              {isLinked
                                ? 'Linked to Existing'
                                : 'Link to Existing Player'}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}

                <div className="max-h-56 overflow-y-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left text-xs tabular-nums">
                    <thead className="bg-[#0E1628] text-slate-300 sticky top-0">
                      <tr>
                        <th className="py-2 px-3">Name</th>
                        <th className="py-2 px-3">Skill</th>
                        <th className="py-2 px-3">Pos</th>
                        <th className="py-2 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {csvPreview.rows.map((r) => {
                        const norm = normalizePlayerName(r.name);
                        const exact = csvPreview.fuzzyMatches.find(
                          (m) => m.csvName === r.name && m.exactNormalized
                        );
                        const linkedId = fuzzyAliasMap[norm];
                        return (
                          <tr key={r.rawLineNumber}>
                            <td className="py-1.5 px-3 font-medium text-white">
                              {r.name}
                            </td>
                            <td className="py-1.5 px-3 text-slate-300">
                              {r.skill}
                            </td>
                            <td className="py-1.5 px-3 font-mono-code text-[#93C5FD]">
                              {r.preferredPosition}
                            </td>
                            <td className="py-1.5 px-3 text-right">
                              {exact || linkedId ? (
                                <span className="text-emerald-300">Returning</span>
                              ) : (
                                <span className="text-amber-300">New Player</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <button
                type="button"
                disabled={
                  actionBusy ||
                  csvPreview.rows.length === 0 ||
                  csvPreview.errors.length > 0
                }
                onClick={async () => {
                  setActionBusy(true);
                  setFeedback(null);
                  try {
                    await onCreateSession({
                      title: sessionTitle,
                      date: sessionDate,
                      location: sessionLocation,
                      defaultFormat,
                      csvText,
                      fuzzyAliasMap,
                    });
                    setMakerFormat(defaultFormat);
                    setFeedback({
                      type: 'success',
                      message:
                        'Open Play session initialized from CSV. You can now balance teams and kick off Game #1.',
                    });
                  } catch (err) {
                    setFeedback({
                      type: 'error',
                      message:
                        err instanceof Error
                          ? err.message
                          : 'Failed to create session',
                    });
                  } finally {
                    setActionBusy(false);
                  }
                }}
                className="w-full py-3 px-5 rounded-lg bg-[#1447E6] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                {actionBusy
                  ? 'Creating Session...'
                  : `Launch Session with ${csvPreview.rows.length} Participants`}
              </button>
            </div>
          </div>
        </section>
      ) : (
        /* Active Session Workbench: Team Maker, Live Match Scorer, Attendance, Finalize */
        <div className="space-y-8">
          {/* 1. Dynamic Team Maker Workbench */}
          <section className="rounded-xl border border-[#3B82F6]/35 bg-[#0E1628] p-5 sm:p-6 space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
                  Dynamic Team Maker — Game #{activeSession.games.length + 1}
                </h1>
                <p className="text-xs sm:text-sm text-slate-300 mt-1">
                  Prioritizes players with the fewest games played today, then balances
                  Skill (`Beginner`, `Intermediate`, `Advanced`) and Position (`GK`,
                  `DEF`, `MID`, `FWD`). Pin or swap any player manually.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div
                  role="group"
                  aria-label="Select match format"
                  className="inline-flex rounded-lg bg-[#070B14] p-1 border border-slate-800"
                >
                  {(['7-aside', '9-aside', '11-aside'] as GameFormat[]).map(
                    (fmt) => (
                      <button
                        key={fmt}
                        type="button"
                        onClick={() => setMakerFormat(fmt)}
                        className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                          makerFormat === fmt
                            ? 'bg-[#1447E6] text-white'
                            : 'text-slate-300 hover:text-white'
                        }`}
                      >
                        {fmt} ({FORMAT_TEAM_SIZE[fmt]}v{FORMAT_TEAM_SIZE[fmt]})
                      </button>
                    )
                  )}
                </div>

                <button
                  type="button"
                  onClick={runAutoBalance}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#15203B] hover:bg-[#1E2D4D] border border-[#3B82F6]/40 text-xs font-semibold text-white transition-colors cursor-pointer"
                >
                  <ShuffleIcon className="w-4 h-4 text-[#60A5FA]" />
                  Auto-Balance Teams
                </button>
              </div>
            </div>

            {/* Balance Telemetry Bar */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 tabular-nums">
              <div className="rounded-lg border border-[#3B82F6]/35 bg-[#15203B] p-3.5">
                <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                  <span className="font-semibold text-white">{teamAName}</span>
                  <span>
                    {draftMetrics.teamACount} / {FORMAT_TEAM_SIZE[makerFormat]} spots
                  </span>
                </div>
                <div className="text-xs text-slate-300">
                  Skill Total:{' '}
                  <strong className="text-white">
                    {draftMetrics.teamASkillTotal}
                  </strong>{' '}
                  (Avg {draftMetrics.teamAAvgSkill}) · GK:{' '}
                  {draftMetrics.teamAPositions.GK} DEF:{' '}
                  {draftMetrics.teamAPositions.DEF} MID:{' '}
                  {draftMetrics.teamAPositions.MID} FWD:{' '}
                  {draftMetrics.teamAPositions.FWD}
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-[#15203B] p-3.5">
                <div className="flex items-center justify-between text-xs text-slate-300 mb-1">
                  <span className="font-semibold text-white">{teamBName}</span>
                  <span>
                    {draftMetrics.teamBCount} / {FORMAT_TEAM_SIZE[makerFormat]} spots
                  </span>
                </div>
                <div className="text-xs text-slate-300">
                  Skill Total:{' '}
                  <strong className="text-white">
                    {draftMetrics.teamBSkillTotal}
                  </strong>{' '}
                  (Avg {draftMetrics.teamBAvgSkill}) · GK:{' '}
                  {draftMetrics.teamBPositions.GK} DEF:{' '}
                  {draftMetrics.teamBPositions.DEF} MID:{' '}
                  {draftMetrics.teamBPositions.MID} FWD:{' '}
                  {draftMetrics.teamBPositions.FWD}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-[#070B14] p-3.5 flex flex-col justify-between">
                <div className="flex items-center justify-between text-xs text-slate-300">
                  <span>Skill Delta</span>
                  <span className="font-mono-code font-bold text-emerald-300">
                    {Math.abs(
                      draftMetrics.teamASkillTotal - draftMetrics.teamBSkillTotal
                    )}{' '}
                    pt diff
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-300 mt-1">
                  <span>Bench Rotation</span>
                  <span className="font-mono-code text-white">
                    {draftMetrics.benchCount} sitting out
                  </span>
                </div>
              </div>
            </div>

            {/* 3-Column Interactive Assignment Columns: Team A, Team B, Bench */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Team A Column */}
              <div className="rounded-xl border border-[#3B82F6]/35 bg-[#070B14] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={teamAName}
                    onChange={(e) => setTeamAName(e.target.value)}
                    aria-label="Team A Name"
                    className="font-display font-bold text-sm text-white bg-transparent border-b border-transparent focus:border-[#60A5FA] px-1 py-0.5"
                  />
                  <span className="text-xs font-mono-code text-[#60A5FA] tabular-nums">
                    {draftTeamAIds.length} players
                  </span>
                </div>
                <ul className="space-y-2">
                  {draftTeamAIds.map((id) => {
                    const p = participantsById.get(id);
                    if (!p) return null;
                    const isLocked = lockedAIds.includes(id);
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#0E1628] border border-slate-800 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-300 tabular-nums">
                            {p.preferredPosition} · {p.skill} · {p.sessionGamesPlayed}{' '}
                            GP
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleLock(id, 'A')}
                            className={`px-2 py-1 rounded text-[10px] font-semibold cursor-pointer ${
                              isLocked
                                ? 'bg-amber-500 text-black'
                                : 'bg-slate-800 text-slate-300 hover:text-white'
                            }`}
                          >
                            {isLocked ? 'Pinned' : 'Pin'}
                          </button>
                          <button
                            type="button"
                            onClick={() => movePlayerAssignment(id, 'B')}
                            className="px-2 py-1 rounded bg-[#15203B] hover:bg-[#1E2D4D] text-slate-200 text-[10px] cursor-pointer"
                          >
                            To B
                          </button>
                          <button
                            type="button"
                            onClick={() => movePlayerAssignment(id, 'BENCH')}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
                          >
                            Bench
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Team B Column */}
              <div className="rounded-xl border border-slate-700 bg-[#070B14] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={teamBName}
                    onChange={(e) => setTeamBName(e.target.value)}
                    aria-label="Team B Name"
                    className="font-display font-bold text-sm text-white bg-transparent border-b border-transparent focus:border-[#60A5FA] px-1 py-0.5"
                  />
                  <span className="text-xs font-mono-code text-slate-300 tabular-nums">
                    {draftTeamBIds.length} players
                  </span>
                </div>
                <ul className="space-y-2">
                  {draftTeamBIds.map((id) => {
                    const p = participantsById.get(id);
                    if (!p) return null;
                    const isLocked = lockedBIds.includes(id);
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#0E1628] border border-slate-800 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-300 tabular-nums">
                            {p.preferredPosition} · {p.skill} · {p.sessionGamesPlayed}{' '}
                            GP
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleLock(id, 'B')}
                            className={`px-2 py-1 rounded text-[10px] font-semibold cursor-pointer ${
                              isLocked
                                ? 'bg-amber-500 text-black'
                                : 'bg-slate-800 text-slate-300 hover:text-white'
                            }`}
                          >
                            {isLocked ? 'Pinned' : 'Pin'}
                          </button>
                          <button
                            type="button"
                            onClick={() => movePlayerAssignment(id, 'A')}
                            className="px-2 py-1 rounded bg-[#15203B] hover:bg-[#1E2D4D] text-slate-200 text-[10px] cursor-pointer"
                          >
                            To A
                          </button>
                          <button
                            type="button"
                            onClick={() => movePlayerAssignment(id, 'BENCH')}
                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] cursor-pointer"
                          >
                            Bench
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Bench Column */}
              <div className="rounded-xl border border-slate-800 bg-[#070B14] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold text-sm text-white">
                    Bench / Rotation Queue
                  </span>
                  <span className="text-xs font-mono-code text-slate-400 tabular-nums">
                    {draftBenchIds.length} waiting
                  </span>
                </div>
                <ul className="space-y-2">
                  {draftBenchIds.map((id) => {
                    const p = participantsById.get(id);
                    if (!p) return null;
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-[#0E1628] border border-slate-800 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">
                            {p.name}
                          </div>
                          <div className="text-[11px] text-slate-300 tabular-nums">
                            {p.preferredPosition} · {p.skill} · {p.sessionGamesPlayed}{' '}
                            GP today
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => movePlayerAssignment(id, 'A')}
                            className="px-2 py-1 rounded bg-[#1447E6] hover:bg-[#1D4ED8] text-white text-[10px] font-semibold cursor-pointer"
                          >
                            + Team A
                          </button>
                          <button
                            type="button"
                            onClick={() => movePlayerAssignment(id, 'B')}
                            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[10px] font-semibold cursor-pointer"
                          >
                            + Team B
                          </button>
                        </div>
                      </li>
                    );
                  })}
                  {draftBenchIds.length === 0 && (
                    <li className="text-xs text-slate-400 py-4 text-center">
                      No active players sitting out.
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={
                  actionBusy ||
                  draftTeamAIds.length === 0 ||
                  draftTeamBIds.length === 0
                }
                onClick={async () => {
                  setActionBusy(true);
                  setFeedback(null);
                  try {
                    await onCreateGame({
                      format: makerFormat,
                      teamAName,
                      teamBName,
                      teamAPlayerIds: draftTeamAIds,
                      teamBPlayerIds: draftTeamBIds,
                      benchPlayerIds: draftBenchIds,
                    });
                    setFeedback({
                      type: 'success',
                      message: `Game #${activeSession.games.length + 1} (${makerFormat}) is now LIVE on the pitch.`,
                    });
                  } catch (err) {
                    setFeedback({
                      type: 'error',
                      message:
                        err instanceof Error ? err.message : 'Failed to start game',
                    });
                  } finally {
                    setActionBusy(false);
                  }
                }}
                className="px-6 py-2.5 rounded-lg bg-[#1447E6] hover:bg-[#1D4ED8] disabled:opacity-50 text-white font-semibold text-sm transition-colors cursor-pointer"
              >
                Kick Off Game #{activeSession.games.length + 1} ({makerFormat})
              </button>
            </div>
          </section>

          {/* 2. Live Match Scoreboard & Player Goal/Assist/MVP Logger */}
          {activeSession.games.length > 0 && (
            <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-5 sm:p-6 space-y-6">
              <h2 className="font-display text-xl font-bold text-white">
                Session Games — Live Score, Goals, Assists & MVP Logger
              </h2>

              <div className="space-y-6">
                {[...activeSession.games]
                  .sort((a, b) => b.gameNumber - a.gameNumber)
                  .map((g) => {
                    const gamePlayers = [
                      ...g.teamAPlayerIds,
                      ...g.teamBPlayerIds,
                    ]
                      .map((id) => participantsById.get(id))
                      .filter((p): p is SessionParticipant => Boolean(p));

                    const adjustPlayerStat = async (
                      playerId: string,
                      field: 'goals' | 'assists',
                      delta: number
                    ) => {
                      const existing = g.playerStats?.[playerId] ?? {
                        goals: 0,
                        assists: 0,
                      };
                      const nextVal = Math.max(0, existing[field] + delta);
                      const nextStats = {
                        ...(g.playerStats ?? {}),
                        [playerId]: {
                          ...existing,
                          [field]: nextVal,
                        },
                      };
                      await onUpdateGame(g.id, { playerStats: nextStats });
                    };

                    return (
                      <div
                        key={g.id}
                        className="rounded-xl border border-slate-800 bg-[#070B14] p-4 sm:p-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                          <div className="flex items-center gap-2.5">
                            <span className="font-display font-bold text-base text-white">
                              Game #{g.gameNumber}
                            </span>
                            <span className="font-mono-code text-xs px-2 py-0.5 rounded bg-[#15203B] text-[#93C5FD]">
                              {g.format}
                            </span>
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-semibold ${
                                g.status === 'live'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {g.status === 'live' ? 'LIVE' : 'COMPLETED'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            <label className="text-xs text-slate-300">
                              Game MVP:
                            </label>
                            <select
                              value={g.mvpPlayerId ?? ''}
                              onChange={(e) =>
                                onUpdateGame(g.id, {
                                  mvpPlayerId: e.target.value || null,
                                })
                              }
                              className="px-2.5 py-1 rounded bg-[#0E1628] border border-slate-700 text-xs text-white"
                            >
                              <option value="">-- Select Game MVP --</option>
                              {gamePlayers.map((p) => (
                                <option key={p.playerId} value={p.playerId}>
                                  {p.name} ({p.preferredPosition})
                                </option>
                              ))}
                            </select>

                            <button
                              type="button"
                              onClick={() =>
                                onUpdateGame(g.id, {
                                  status:
                                    g.status === 'live' ? 'completed' : 'live',
                                })
                              }
                              className={`px-3 py-1 rounded text-xs font-semibold cursor-pointer ${
                                g.status === 'live'
                                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                              }`}
                            >
                              {g.status === 'live'
                                ? 'Mark Full Time'
                                : 'Reopen Game'}
                            </button>
                          </div>
                        </div>

                        {/* Score Controls */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 tabular-nums">
                          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0E1628] border border-[#3B82F6]/30">
                            <span className="font-display font-bold text-sm text-white">
                              {g.teamAName}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateGame(g.id, {
                                    scoreA: Math.max(0, g.scoreA - 1),
                                  })
                                }
                                className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer"
                              >
                                -
                              </button>
                              <span className="font-display font-bold text-xl text-white w-8 text-center">
                                {g.scoreA}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateGame(g.id, { scoreA: g.scoreA + 1 })
                                }
                                className="w-7 h-7 rounded bg-[#1447E6] hover:bg-[#1D4ED8] text-white font-bold cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between p-3 rounded-lg bg-[#0E1628] border border-slate-700">
                            <span className="font-display font-bold text-sm text-white">
                              {g.teamBName}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateGame(g.id, {
                                    scoreB: Math.max(0, g.scoreB - 1),
                                  })
                                }
                                className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-white font-bold cursor-pointer"
                              >
                                -
                              </button>
                              <span className="font-display font-bold text-xl text-white w-8 text-center">
                                {g.scoreB}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  onUpdateGame(g.id, { scoreB: g.scoreB + 1 })
                                }
                                className="w-7 h-7 rounded bg-[#1447E6] hover:bg-[#1D4ED8] text-white font-bold cursor-pointer"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* Individual Player Goal / Assist Quick Toggles */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs tabular-nums">
                          {[
                            { label: g.teamAName, ids: g.teamAPlayerIds },
                            { label: g.teamBName, ids: g.teamBPlayerIds },
                          ].map((side) => (
                            <div key={side.label} className="space-y-1.5">
                              <div className="text-slate-400 font-semibold mb-1">
                                {side.label} Goal / Assist Sheet
                              </div>
                              {side.ids.map((pid) => {
                                const p = participantsById.get(pid);
                                if (!p) return null;
                                const st = g.playerStats?.[pid] ?? {
                                  goals: 0,
                                  assists: 0,
                                };
                                return (
                                  <div
                                    key={pid}
                                    className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#0E1628] border border-slate-800/80"
                                  >
                                    <span className="text-white font-medium truncate">
                                      {p.name}
                                    </span>
                                    <div className="flex items-center gap-3">
                                      <div className="flex items-center gap-1">
                                        <span className="text-slate-400">G:</span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            adjustPlayerStat(pid, 'goals', -1)
                                          }
                                          className="px-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
                                        >
                                          -
                                        </button>
                                        <span className="text-emerald-300 font-bold w-4 text-center">
                                          {st.goals}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            adjustPlayerStat(pid, 'goals', 1)
                                          }
                                          className="px-1.5 rounded bg-emerald-600/30 text-emerald-200 cursor-pointer"
                                        >
                                          +
                                        </button>
                                      </div>

                                      <div className="flex items-center gap-1">
                                        <span className="text-slate-400">A:</span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            adjustPlayerStat(pid, 'assists', -1)
                                          }
                                          className="px-1.5 rounded bg-slate-800 text-slate-300 cursor-pointer"
                                        >
                                          -
                                        </button>
                                        <span className="text-sky-300 font-bold w-4 text-center">
                                          {st.assists}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            adjustPlayerStat(pid, 'assists', 1)
                                          }
                                          className="px-1.5 rounded bg-sky-600/30 text-sky-200 cursor-pointer"
                                        >
                                          +
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* 3. Attendance & Walk-in Manager + Session Finalizer */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-5 space-y-4">
              <h2 className="font-display text-lg font-bold text-white">
                Session Attendance & Walk-In Players
              </h2>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!walkInName.trim()) return;
                  await onUpdateParticipants({
                    addPlayer: {
                      name: walkInName.trim(),
                      skill: walkInSkill,
                      preferredPosition: walkInPos,
                    },
                  });
                  setWalkInName('');
                }}
                className="flex flex-wrap items-center gap-2"
              >
                <input
                  type="text"
                  value={walkInName}
                  onChange={(e) => setWalkInName(e.target.value)}
                  placeholder="Add walk-in player name..."
                  className="px-3 py-1.5 rounded-lg bg-[#070B14] border border-slate-700 text-xs text-white flex-1 min-w-[140px]"
                />
                <select
                  value={walkInSkill}
                  onChange={(e) => setWalkInSkill(e.target.value as SkillLevel)}
                  aria-label="Walk-in player skill"
                  className="px-2.5 py-1.5 rounded-lg bg-[#070B14] border border-slate-700 text-xs text-white"
                >
                  <option value="Beginner">Beginner</option>
                  <option value="Intermediate">Intermediate</option>
                  <option value="Advanced">Advanced</option>
                </select>
                <select
                  value={walkInPos}
                  onChange={(e) => setWalkInPos(e.target.value as PositionLine)}
                  aria-label="Walk-in player position"
                  className="px-2.5 py-1.5 rounded-lg bg-[#070B14] border border-slate-700 text-xs text-white"
                >
                  <option value="GK">GK</option>
                  <option value="DEF">DEF</option>
                  <option value="MID">MID</option>
                  <option value="FWD">FWD</option>
                  <option value="ANY">ANY</option>
                </select>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-lg bg-[#1447E6] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer"
                >
                  + Add Player
                </button>
              </form>

              <div className="max-h-60 overflow-y-auto divide-y divide-slate-800/70 border border-slate-800 rounded-lg">
                {activeSession.participants.map((p) => (
                  <div
                    key={p.playerId}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                  >
                    <div>
                      <span
                        className={`font-semibold ${
                          p.active ? 'text-white' : 'text-slate-500 line-through'
                        }`}
                      >
                        {p.name}
                      </span>
                      <span className="ml-2 text-slate-400 font-mono-code">
                        {p.preferredPosition} · {p.skill} · {p.sessionGamesPlayed} GP
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateParticipants({
                          togglePlayerId: p.playerId,
                          active: !p.active,
                        })
                      }
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                        p.active
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {p.active ? 'Present' : 'Paused'}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            {/* Finalize & Commit Session to DynamoDB */}
            <section className="rounded-xl border border-amber-500/35 bg-[#0E1628] p-5 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <StarBadgeIcon className="w-5 h-5 text-amber-400" />
                  End & Save Session Results to Database
                </h2>
                <p className="text-xs sm:text-sm text-slate-300">
                  Finalizing the session marks all live games as completed, crowns the
                  Session MVP, and saves the session&apos;s final results and player
                  performance (Games Played, Wins/Draws/Losses, Win Points, Goals,
                  Assists, and MVP awards) to the database.
                </p>

                <div className="pt-2">
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Select Overall Session MVP
                  </label>
                  <select
                    value={selectedSessionMvpId}
                    onChange={(e) => setSelectedSessionMvpId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#070B14] border border-slate-700 text-xs sm:text-sm text-white"
                  >
                    <option value="">Auto-select Top Performer of the Session</option>
                    {activeSession.participants.map((p) => (
                      <option key={p.playerId} value={p.playerId}>
                        {p.name} ({p.preferredPosition} · {p.sessionGamesPlayed} GP)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="button"
                disabled={actionBusy}
                onClick={async () => {
                  setActionBusy(true);
                  setFeedback(null);
                  try {
                    await onFinalizeSession({
                      sessionMvpPlayerId: selectedSessionMvpId || undefined,
                    });
                    setFeedback({
                      type: 'success',
                      message:
                        'Session finalized! Session results and player performance have been saved to the database.',
                    });
                  } catch (err) {
                    setFeedback({
                      type: 'error',
                      message:
                        err instanceof Error
                          ? err.message
                          : 'Failed to finalize session',
                    });
                  } finally {
                    setActionBusy(false);
                  }
                }}
                className="w-full py-3 px-5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-display font-bold text-sm transition-colors cursor-pointer flex items-center justify-center gap-2"
              >
                <CheckCircleIcon className="w-4 h-4" />
                Finalize &amp; Save Session Results
              </button>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
