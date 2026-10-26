import React, { useMemo, useState } from 'react';
import {
  SessionParticipant,
  SessionRecord,
  computeSessionPlayerDeltas,
} from '@dfop/shared';
import {
  CheckCircleIcon,
  PitchIcon,
  StarBadgeIcon,
  UsersIcon,
} from './Icons.js';
import { TacticalPitch } from './TacticalPitch.js';

interface MatchdayViewProps {
  session: SessionRecord | null;
  onOpenAdmin: () => void;
}

export const MatchdayView: React.FC<MatchdayViewProps> = ({
  session,
  onOpenAdmin,
}) => {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);

  const participantsById = useMemo(() => {
    const map = new Map<string, SessionParticipant>();
    if (!session) return map;
    for (const p of session.participants) {
      map.set(p.playerId, p);
    }
    return map;
  }, [session]);

  const currentGame = useMemo(() => {
    if (!session || session.games.length === 0) return null;
    if (selectedGameId) {
      const found = session.games.find((g) => g.id === selectedGameId);
      if (found) return found;
    }
    const live = session.games.find((g) => g.status === 'live');
    if (live) return live;
    return session.games[session.games.length - 1];
  }, [session, selectedGameId]);

  const sessionStandings = useMemo(() => {
    if (!session) return [];
    const deltas = computeSessionPlayerDeltas(session);
    return session.participants
      .map((p) => {
        const d = deltas.get(p.playerId);
        return {
          participant: p,
          gamesPlayed: p.sessionGamesPlayed,
          wins: d?.wins ?? 0,
          draws: d?.draws ?? 0,
          losses: d?.losses ?? 0,
          points: d?.points ?? 0,
          goals: d?.goals ?? 0,
          assists: d?.assists ?? 0,
          gameMvps: d?.gameMvps ?? 0,
        };
      })
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.goals !== a.goals) return b.goals - a.goals;
        if (b.assists !== a.assists) return b.assists - a.assists;
        return b.gamesPlayed - a.gamesPlayed;
      });
  }, [session]);

  if (!session) {
    return (
      <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-8 sm:p-12 text-center max-w-2xl mx-auto my-8">
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[#1447E6]/15 border border-[#3B82F6]/30 flex items-center justify-center text-[#60A5FA]">
          <PitchIcon className="w-8 h-8" />
        </div>
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-white mb-3">
          No Open Play Session Currently Live
        </h2>
        <p className="text-slate-300 text-sm sm:text-base max-w-[60ch] mx-auto mb-6">
          Check Session Performance and Past Sessions while waiting for the next
          Davao Football Open Play kickoff, or open the Admin Console to upload today&apos;s
          CSV roster and generate teams.
        </p>
        <button
          type="button"
          onClick={onOpenAdmin}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#1447E6] hover:bg-[#1D4ED8] text-white font-semibold text-sm transition-colors cursor-pointer"
        >
          Open Matchday Admin
        </button>
      </section>
    );
  }

  const activeCount = session.participants.filter((p) => p.active).length;

  return (
    <div className="space-y-8">
      {/* Session Header Banner */}
      <section className="rounded-xl border border-[#3B82F6]/30 bg-[#0E1628] p-5 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                Live Open Play
              </span>
              <span className="font-mono-code text-xs px-2.5 py-0.5 rounded-full bg-[#15203B] text-[#93C5FD] border border-[#3B82F6]/30">
                {session.defaultFormat.toUpperCase()}
              </span>
              <span className="text-xs text-slate-300 tabular-nums">
                {session.date} · {session.location}
              </span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-white">
              {session.title}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-sm tabular-nums">
            <div className="px-3.5 py-2 rounded-lg bg-[#15203B] border border-slate-700/70">
              <span className="text-slate-300 text-xs block">Active Players</span>
              <span className="font-display font-bold text-lg text-white">
                {activeCount}{' '}
                <span className="text-xs font-normal text-slate-400">
                  / {session.participants.length}
                </span>
              </span>
            </div>
            <div className="px-3.5 py-2 rounded-lg bg-[#15203B] border border-slate-700/70">
              <span className="text-slate-300 text-xs block">Games Played</span>
              <span className="font-display font-bold text-lg text-white">
                {session.games.length}
              </span>
            </div>
          </div>
        </div>

        {/* Game Selector Tabs */}
        {session.games.length > 0 && (
          <div className="mt-5 pt-4 border-t border-slate-800 flex items-center gap-2 overflow-x-auto pb-1">
            {session.games.map((g) => {
              const isSelected = currentGame?.id === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGameId(g.id)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer border ${
                    isSelected
                      ? 'bg-[#1447E6] text-white border-[#60A5FA]'
                      : 'bg-[#15203B] text-slate-300 border-slate-700/70 hover:text-white hover:border-slate-500'
                  }`}
                >
                  <span>Game {g.gameNumber}</span>
                  <span className="font-mono-code tabular-nums px-1.5 py-0.5 rounded bg-black/30">
                    {g.scoreA} - {g.scoreB}
                  </span>
                  {g.status === 'live' ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                  ) : (
                    <CheckCircleIcon className="w-3.5 h-3.5 text-slate-300" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Active / Selected Game Scoreboard & Pitch */}
      {currentGame ? (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-5">
            {/* Scoreboard Header */}
            <div className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
              <div className="flex items-center justify-between text-xs text-slate-300 mb-3">
                <span className="font-mono-code uppercase">
                  Game #{currentGame.gameNumber} · {currentGame.format}
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-semibold ${
                    currentGame.status === 'live'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-slate-800 text-slate-300 border border-slate-700'
                  }`}
                >
                  {currentGame.status === 'live' ? 'In Progress' : 'Full Time'}
                </span>
              </div>

              <div className="grid grid-cols-3 items-center gap-3 py-2">
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 rounded-full bg-[#1447E6] border border-white/50 shrink-0" />
                    <span className="font-display font-bold text-base sm:text-xl text-white truncate">
                      {currentGame.teamAName}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400 block mt-0.5 tabular-nums">
                    {currentGame.teamAPlayerIds.length} players
                  </span>
                </div>

                <div className="text-center">
                  <div className="inline-flex items-center gap-3 px-4 py-2 rounded-xl bg-[#070B14] border border-slate-800 font-display font-bold text-2xl sm:text-4xl text-white tabular-nums">
                    <span>{currentGame.scoreA}</span>
                    <span className="text-slate-500 text-xl">:</span>
                    <span>{currentGame.scoreB}</span>
                  </div>
                </div>

                <div className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="font-display font-bold text-base sm:text-xl text-white truncate">
                      {currentGame.teamBName}
                    </span>
                    <span className="w-3.5 h-3.5 rounded-full bg-[#F8FAFC] border border-slate-400 shrink-0" />
                  </div>
                  <span className="text-xs text-slate-400 block mt-0.5 tabular-nums">
                    {currentGame.teamBPlayerIds.length} players
                  </span>
                </div>
              </div>

              {currentGame.mvpPlayerId && (
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-center gap-2 text-xs text-amber-300">
                  <StarBadgeIcon className="w-4 h-4 text-amber-400" />
                  <span>
                    Game MVP:{' '}
                    <strong className="text-white">
                      {participantsById.get(currentGame.mvpPlayerId)?.name ??
                        currentGame.mvpPlayerId}
                    </strong>
                  </span>
                </div>
              )}
            </div>

            {/* Tactical Pitch Lineup */}
            <TacticalPitch
              game={currentGame}
              participantsById={participantsById}
            />
          </div>

          {/* Right Column: Bench Rotation Queue & Match Goal/Assist Feed */}
          <div className="space-y-6">
            <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-lg font-bold text-white flex items-center gap-2">
                  <UsersIcon className="w-4 h-4 text-[#60A5FA]" />
                  Bench & Next Up Queue
                </h2>
                <span className="text-xs font-mono-code text-slate-300 tabular-nums">
                  {currentGame.benchPlayerIds.length} waiting
                </span>
              </div>
              <p className="text-xs text-slate-300 mb-4">
                Players with fewer games played today are automatically prioritized for
                the next game&apos;s rotation.
              </p>

              {currentGame.benchPlayerIds.length === 0 ? (
                <div className="rounded-lg border border-slate-800 bg-[#15203B]/50 p-4 text-xs text-slate-300 text-center">
                  All active players are currently on the pitch.
                </div>
              ) : (
                <ul className="space-y-2">
                  {currentGame.benchPlayerIds.map((id) => {
                    const p = participantsById.get(id);
                    if (!p) return null;
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#15203B] border border-slate-800 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono-code text-[10px] px-1.5 py-0.5 rounded bg-[#0E1628] text-[#93C5FD] border border-[#3B82F6]/30">
                            {p.preferredPosition}
                          </span>
                          <span className="font-semibold text-white">{p.name}</span>
                        </div>
                        <span className="font-mono-code text-slate-300 tabular-nums">
                          {p.sessionGamesPlayed} {p.sessionGamesPlayed === 1 ? 'game' : 'games'} today
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {/* Today's Session Standings */}
            <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-5">
              <h2 className="font-display text-lg font-bold text-white mb-3">
                Session Standings
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs tabular-nums">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="py-2 pr-2 font-medium">Player</th>
                      <th className="py-2 px-1.5 font-medium text-center">GP</th>
                      <th className="py-2 px-1.5 font-medium text-center">W-D-L</th>
                      <th className="py-2 px-1.5 font-medium text-center">G/A</th>
                      <th className="py-2 pl-1.5 font-medium text-right">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/70">
                    {sessionStandings.map((row) => (
                      <tr key={row.participant.playerId} className="hover:bg-[#15203B]/60">
                        <td className="py-2 pr-2 font-medium text-white">
                          <div className="flex items-center gap-1.5">
                            <span className="truncate max-w-[120px]">
                              {row.participant.name}
                            </span>
                            {row.gameMvps > 0 && (
                              <StarBadgeIcon className="w-3 h-3 text-amber-400 shrink-0" />
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-1.5 text-center text-slate-300">
                          {row.gamesPlayed}
                        </td>
                        <td className="py-2 px-1.5 text-center text-slate-300">
                          {row.wins}-{row.draws}-{row.losses}
                        </td>
                        <td className="py-2 px-1.5 text-center text-slate-300">
                          {row.goals}/{row.assists}
                        </td>
                        <td className="py-2 pl-1.5 text-right font-bold text-[#60A5FA]">
                          {row.points}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      ) : (
        <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-8 text-center">
          <h2 className="font-display text-xl font-bold text-white mb-2">
            Session Checked In ({session.participants.length} Players Ready)
          </h2>
          <p className="text-slate-300 text-sm max-w-[55ch] mx-auto mb-5">
            Participants are loaded for today&apos;s session. The Admin is currently
            balancing the lineups for Game #1.
          </p>
          <button
            type="button"
            onClick={onOpenAdmin}
            className="px-4 py-2 rounded-lg bg-[#1447E6] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            Generate Game #1 Teams in Admin
          </button>
        </section>
      )}
    </div>
  );
};
