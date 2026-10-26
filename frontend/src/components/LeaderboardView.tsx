import React, { useEffect, useMemo, useState } from 'react';
import {
  PositionLine,
  SessionRecord,
  SkillLevel,
  computePerformanceIndex,
  computeSessionPlayerDeltas,
} from '@dfop/shared';
import { SearchIcon, StarBadgeIcon, TrophyIcon } from './Icons.js';

interface LeaderboardViewProps {
  activeSession: SessionRecord | null;
  recentSessions: SessionRecord[];
  initialSessionId?: string | null;
}

type SortKey =
  | 'performanceIndex'
  | 'points'
  | 'gamesPlayed'
  | 'wins'
  | 'goals'
  | 'assists'
  | 'mvps';

export interface SessionPlayerPerformanceRow {
  playerId: string;
  name: string;
  skill: SkillLevel;
  preferredPosition: PositionLine;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  goals: number;
  assists: number;
  gameMvps: number;
  isSessionMvp: boolean;
  performanceIndex: number;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  activeSession,
  recentSessions,
  initialSessionId,
}) => {
  const allSessions = useMemo(() => {
    const list: SessionRecord[] = [];
    if (activeSession) list.push(activeSession);
    for (const s of recentSessions) {
      if (!list.some((existing) => existing.id === s.id)) {
        list.push(s);
      }
    }
    return list;
  }, [activeSession, recentSessions]);

  const [selectedSessionId, setSelectedSessionId] = useState<string>(
    initialSessionId || activeSession?.id || recentSessions[0]?.id || ''
  );

  useEffect(() => {
    if (initialSessionId) {
      setSelectedSessionId(initialSessionId);
    } else if (
      !selectedSessionId &&
      (activeSession?.id || recentSessions[0]?.id)
    ) {
      setSelectedSessionId(activeSession?.id || recentSessions[0]?.id || '');
    }
  }, [initialSessionId, activeSession, recentSessions, selectedSessionId]);

  const currentSession = useMemo(() => {
    return (
      allSessions.find((s) => s.id === selectedSessionId) ??
      allSessions[0] ??
      null
    );
  }, [allSessions, selectedSessionId]);

  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState<PositionLine | 'ALL'>('ALL');
  const [skillFilter, setSkillFilter] = useState<SkillLevel | 'ALL'>('ALL');
  const [sortBy, setSortBy] = useState<SortKey>('performanceIndex');

  const sessionRows = useMemo<SessionPlayerPerformanceRow[]>(() => {
    if (!currentSession) return [];
    const deltas = computeSessionPlayerDeltas(currentSession);

    const rows: SessionPlayerPerformanceRow[] = currentSession.participants.map(
      (p) => {
        const d = deltas.get(p.playerId);
        const points = d?.points ?? 0;
        const goals = d?.goals ?? 0;
        const assists = d?.assists ?? 0;
        const gameMvps = d?.gameMvps ?? 0;
        const isSessionMvp = currentSession.sessionMvpPlayerId === p.playerId;

        return {
          playerId: p.playerId,
          name: p.name,
          skill: p.skill,
          preferredPosition: p.preferredPosition,
          gamesPlayed: p.sessionGamesPlayed,
          wins: d?.wins ?? 0,
          draws: d?.draws ?? 0,
          losses: d?.losses ?? 0,
          points,
          goals,
          assists,
          gameMvps,
          isSessionMvp,
          performanceIndex: computePerformanceIndex({
            points,
            goals,
            assists,
            gameMvps,
            sessionMvps: isSessionMvp ? 1 : 0,
          }),
        };
      }
    );

    return rows.sort((a, b) => {
      if (b.performanceIndex !== a.performanceIndex) {
        return b.performanceIndex - a.performanceIndex;
      }
      if (b.points !== a.points) return b.points - a.points;
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      return b.gamesPlayed - a.gamesPlayed;
    });
  }, [currentSession]);

  const bestPlayer = useMemo(() => {
    if (!currentSession || sessionRows.length === 0) return null;
    if (currentSession.sessionMvpPlayerId) {
      const explicit = sessionRows.find(
        (r) => r.playerId === currentSession.sessionMvpPlayerId
      );
      if (explicit) return explicit;
    }
    return sessionRows[0] ?? null;
  }, [currentSession, sessionRows]);

  const filteredAndSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sessionRows
      .filter((p) => {
        if (q && !p.name.toLowerCase().includes(q)) return false;
        if (posFilter !== 'ALL' && p.preferredPosition !== posFilter)
          return false;
        if (skillFilter !== 'ALL' && p.skill !== skillFilter) return false;
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'performanceIndex')
          return b.performanceIndex - a.performanceIndex;
        if (sortBy === 'points') return b.points - a.points;
        if (sortBy === 'gamesPlayed') return b.gamesPlayed - a.gamesPlayed;
        if (sortBy === 'wins') return b.wins - a.wins;
        if (sortBy === 'goals') return b.goals - a.goals;
        if (sortBy === 'assists') return b.assists - a.assists;
        if (sortBy === 'mvps') {
          const aMvp = (a.isSessionMvp ? 1 : 0) + a.gameMvps;
          const bMvp = (b.isSessionMvp ? 1 : 0) + b.gameMvps;
          return bMvp - aMvp;
        }
        return 0;
      });
  }, [sessionRows, search, posFilter, skillFilter, sortBy]);

  if (!currentSession) {
    return (
      <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-8 text-center">
        <TrophyIcon className="w-8 h-8 text-[#60A5FA] mx-auto mb-3" />
        <h1 className="font-display text-xl font-bold text-white mb-2">
          No Session Performance Data Yet
        </h1>
        <p className="text-slate-300 text-sm">
          Start or complete a session to view player performance and Best Player stats.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      {/* Session Selector Bar */}
      <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-white">
            Session Performance — {currentSession.title}
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 mt-0.5 tabular-nums">
            {currentSession.date} · {currentSession.location} ·{' '}
            {currentSession.games.length}{' '}
            {currentSession.games.length === 1 ? 'Game' : 'Games'} ·{' '}
            {currentSession.status === 'active' ? 'Live Session' : 'Completed Session'}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <label
            htmlFor="session-select"
            className="text-xs font-semibold text-slate-300 shrink-0"
          >
            Select Session:
          </label>
          <select
            id="session-select"
            value={currentSession.id}
            onChange={(e) => setSelectedSessionId(e.target.value)}
            className="px-3.5 py-2 rounded-lg bg-[#070B14] border border-[#3B82F6]/40 text-xs sm:text-sm text-white font-semibold"
          >
            {allSessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} — {s.title} ({s.status === 'active' ? 'LIVE' : 'Saved'})
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Session Best Player Spotlight */}
      {bestPlayer && (
        <section className="rounded-xl border border-[#3B82F6]/35 bg-[#0E1628] p-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-semibold">
                <TrophyIcon className="w-4 h-4 text-amber-400" />
                {currentSession.status === 'active'
                  ? 'Current Session Best Player Leader'
                  : 'Session Best Player / MVP'}
              </div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
                {bestPlayer.name}
              </h2>
              <p className="text-sm text-slate-300">
                Position:{' '}
                <strong className="text-white font-mono-code">
                  {bestPlayer.preferredPosition}
                </strong>{' '}
                · Tier: <strong className="text-white">{bestPlayer.skill}</strong> ·{' '}
                {bestPlayer.gamesPlayed} Games Played in Session
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 tabular-nums">
              <div className="px-3.5 py-2.5 rounded-lg bg-[#15203B] border border-slate-700/80">
                <span className="text-xs text-slate-300 block">Session Index</span>
                <span className="font-display font-bold text-xl text-amber-300">
                  {bestPlayer.performanceIndex}
                </span>
              </div>
              <div className="px-3.5 py-2.5 rounded-lg bg-[#15203B] border border-slate-700/80">
                <span className="text-xs text-slate-300 block">Session Points</span>
                <span className="font-display font-bold text-xl text-[#60A5FA]">
                  {bestPlayer.points}
                </span>
              </div>
              <div className="px-3.5 py-2.5 rounded-lg bg-[#15203B] border border-slate-700/80">
                <span className="text-xs text-slate-300 block">Record (W-D-L)</span>
                <span className="font-display font-bold text-xl text-white">
                  {bestPlayer.wins}-{bestPlayer.draws}-{bestPlayer.losses}
                </span>
              </div>
              <div className="px-3.5 py-2.5 rounded-lg bg-[#15203B] border border-slate-700/80">
                <span className="text-xs text-slate-300 block">Goals / Assists</span>
                <span className="font-display font-bold text-xl text-emerald-300">
                  {bestPlayer.goals}G / {bestPlayer.assists}A
                </span>
              </div>
              <div className="px-3.5 py-2.5 rounded-lg bg-[#15203B] border border-slate-700/80">
                <span className="text-xs text-slate-300 block">Game MVPs</span>
                <span className="font-display font-bold text-xl text-white">
                  {bestPlayer.gameMvps}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Filter & Search Bar */}
      <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-5 space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-white">
              Session Player Performance Table
            </h2>
            <p className="text-xs text-slate-300 mt-0.5">
              Stats for {currentSession.title} (3 pts/Win, 1 pt/Draw, Goals, Assists, and
              MVP awards).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <SearchIcon className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search player name..."
                aria-label="Search player name"
                className="pl-9 pr-3 py-1.5 rounded-lg bg-[#070B14] border border-slate-700 text-xs text-white placeholder:text-slate-400 w-48 sm:w-56"
              />
            </div>

            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value as PositionLine | 'ALL')}
              aria-label="Filter by position"
              className="px-3 py-1.5 rounded-lg bg-[#070B14] border border-slate-700 text-xs text-white"
            >
              <option value="ALL">All Positions</option>
              <option value="GK">GK — Goalkeeper</option>
              <option value="DEF">DEF — Defender</option>
              <option value="MID">MID — Midfielder</option>
              <option value="FWD">FWD — Forward</option>
              <option value="ANY">ANY — Utility</option>
            </select>

            <select
              value={skillFilter}
              onChange={(e) => setSkillFilter(e.target.value as SkillLevel | 'ALL')}
              aria-label="Filter by skill level"
              className="px-3 py-1.5 rounded-lg bg-[#070B14] border border-slate-700 text-xs text-white"
            >
              <option value="ALL">All Skill Tiers</option>
              <option value="Advanced">Advanced</option>
              <option value="Intermediate">Intermediate</option>
              <option value="Beginner">Beginner</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortKey)}
              aria-label="Sort players by"
              className="px-3 py-1.5 rounded-lg bg-[#15203B] border border-[#3B82F6]/40 text-xs text-white font-semibold"
            >
              <option value="performanceIndex">Sort: Session Index</option>
              <option value="points">Sort: Win Points</option>
              <option value="gamesPlayed">Sort: Games Played</option>
              <option value="wins">Sort: Wins</option>
              <option value="goals">Sort: Goals</option>
              <option value="assists">Sort: Assists</option>
              <option value="mvps">Sort: MVP Awards</option>
            </select>
          </div>
        </div>

        {/* Standings Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm tabular-nums">
            <thead>
              <tr className="border-b border-slate-800 text-slate-300 text-xs">
                <th className="py-3 pr-3 font-semibold">#</th>
                <th className="py-3 px-3 font-semibold">Player</th>
                <th className="py-3 px-3 font-semibold">Pos</th>
                <th className="py-3 px-3 font-semibold">Skill</th>
                <th className="py-3 px-3 font-semibold text-center">Games</th>
                <th className="py-3 px-3 font-semibold text-center">W - D - L</th>
                <th className="py-3 px-3 font-semibold text-center">Win %</th>
                <th className="py-3 px-3 font-semibold text-center">Goals</th>
                <th className="py-3 px-3 font-semibold text-center">Assists</th>
                <th className="py-3 px-3 font-semibold text-center">Game MVPs</th>
                <th className="py-3 px-3 font-semibold text-right">Pts</th>
                <th className="py-3 pl-3 font-semibold text-right">Index</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredAndSorted.map((player, idx) => {
                const winRate =
                  player.gamesPlayed > 0
                    ? Math.round((player.wins / player.gamesPlayed) * 100)
                    : 0;

                return (
                  <tr
                    key={player.playerId}
                    className="hover:bg-[#15203B]/60 transition-colors"
                  >
                    <td className="py-3 pr-3 font-mono-code text-slate-400">
                      {idx + 1}
                    </td>
                    <td className="py-3 px-3 font-semibold text-white">
                      <div className="flex items-center gap-2">
                        <span>{player.name}</span>
                        {player.isSessionMvp && (
                          <span
                            title="Session MVP"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px]"
                          >
                            <StarBadgeIcon className="w-3 h-3" />
                            MVP
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="font-mono-code text-xs px-2 py-0.5 rounded bg-[#15203B] text-[#93C5FD] border border-[#3B82F6]/30">
                        {player.preferredPosition}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-300 text-xs">
                      {player.skill}
                    </td>
                    <td className="py-3 px-3 text-center text-white font-medium">
                      {player.gamesPlayed}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-300">
                      {player.wins} - {player.draws} - {player.losses}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-300">
                      {winRate}%
                    </td>
                    <td className="py-3 px-3 text-center text-emerald-300 font-medium">
                      {player.goals}
                    </td>
                    <td className="py-3 px-3 text-center text-sky-300 font-medium">
                      {player.assists}
                    </td>
                    <td className="py-3 px-3 text-center text-amber-300 font-medium">
                      {player.gameMvps}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-[#60A5FA]">
                      {player.points}
                    </td>
                    <td className="py-3 pl-3 text-right font-display font-bold text-white">
                      {player.performanceIndex}
                    </td>
                  </tr>
                );
              })}
              {filteredAndSorted.length === 0 && (
                <tr>
                  <td
                    colSpan={12}
                    className="py-8 text-center text-slate-300 text-sm"
                  >
                    No players match the current search or filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
