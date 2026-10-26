import React, { useState } from 'react';
import { SessionRecord } from '@dfop/shared';
import { HistoryIcon, StarBadgeIcon } from './Icons.js';

interface SessionsArchiveViewProps {
  sessions: SessionRecord[];
  onSelectSessionPerformance?: (sessionId: string) => void;
}

export const SessionsArchiveView: React.FC<SessionsArchiveViewProps> = ({
  sessions,
  onSelectSessionPerformance,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(
    sessions[0]?.id ?? null
  );

  if (sessions.length === 0) {
    return (
      <section className="rounded-xl border border-slate-800 bg-[#0E1628] p-8 text-center">
        <HistoryIcon className="w-8 h-8 text-[#60A5FA] mx-auto mb-3" />
        <h1 className="font-display text-xl font-bold text-white mb-2">
          No Completed Sessions Yet
        </h1>
        <p className="text-slate-300 text-sm">
          Once an Open Play session is finalized, its full match results and MVP honours
          appear here.
        </p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">
          Completed Open Play Sessions
        </h1>
        <p className="text-sm text-slate-300 mt-1">
          Full historical archive of Davao Football Open Play matchdays, game scores, and
          Session MVPs.
        </p>
      </div>

      <div className="space-y-4">
        {sessions.map((s) => {
          const isExpanded = expandedId === s.id;
          const mvpParticipant = s.participants.find(
            (p) => p.playerId === s.sessionMvpPlayerId
          );

          return (
            <article
              key={s.id}
              className="rounded-xl border border-slate-800 bg-[#0E1628] overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedId(isExpanded ? null : s.id)}
                className="w-full p-5 text-left flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#15203B]/50 transition-colors cursor-pointer"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mb-1.5 tabular-nums">
                    <span>{s.date}</span>
                    <span>·</span>
                    <span>{s.location}</span>
                    <span className="font-mono-code px-2 py-0.5 rounded bg-[#15203B] text-[#93C5FD] border border-[#3B82F6]/30">
                      {s.defaultFormat.toUpperCase()}
                    </span>
                  </div>
                  <h2 className="font-display text-lg sm:text-xl font-bold text-white">
                    {s.title}
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs tabular-nums">
                  {mvpParticipant && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-300 border border-amber-400/30 font-semibold">
                      <StarBadgeIcon className="w-3.5 h-3.5 text-amber-400" />
                      Session MVP: {mvpParticipant.name}
                    </span>
                  )}
                  <span className="px-3 py-1.5 rounded-lg bg-[#15203B] border border-slate-700 text-slate-200">
                    {s.games.length} {s.games.length === 1 ? 'Game' : 'Games'} ·{' '}
                    {s.participants.length} Players
                  </span>
                </div>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 pt-2 border-t border-slate-800/80 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {s.games.map((g) => {
                      const gameMvp = s.participants.find(
                        (p) => p.playerId === g.mvpPlayerId
                      );
                      return (
                        <div
                          key={g.id}
                          className="rounded-lg border border-slate-800 bg-[#15203B]/70 p-4 tabular-nums"
                        >
                          <div className="flex items-center justify-between text-xs text-slate-300 mb-2">
                            <span className="font-mono-code">
                              Game #{g.gameNumber} ({g.format})
                            </span>
                            {gameMvp && (
                              <span className="inline-flex items-center gap-1 text-amber-300">
                                <StarBadgeIcon className="w-3 h-3" />
                                MVP: {gameMvp.name}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center justify-between font-display font-bold text-base text-white">
                            <span>{g.teamAName}</span>
                            <span className="px-2.5 py-0.5 rounded bg-[#070B14] border border-slate-700">
                              {g.scoreA} : {g.scoreB}
                            </span>
                            <span>{g.teamBName}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {onSelectSessionPerformance && (
                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => onSelectSessionPerformance(s.id)}
                        className="px-4 py-2 rounded-lg bg-[#1447E6] hover:bg-[#1D4ED8] text-white text-xs font-semibold transition-colors cursor-pointer"
                      >
                        View Full Session Player Performance
                      </button>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
};
