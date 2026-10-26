import React from 'react';
import {
  PositionLine,
  SessionGame,
  SessionParticipant,
} from '@dfop/shared';
import { StarBadgeIcon } from './Icons.js';

interface TacticalPitchProps {
  game: SessionGame;
  participantsById: Map<string, SessionParticipant>;
}

function groupPlayersByTacticalLine(
  playerIds: string[],
  participantsById: Map<string, SessionParticipant>
): Record<'GK' | 'DEF' | 'MID' | 'FWD', SessionParticipant[]> {
  const lines: Record<'GK' | 'DEF' | 'MID' | 'FWD', SessionParticipant[]> = {
    GK: [],
    DEF: [],
    MID: [],
    FWD: [],
  };

  const resolved = playerIds
    .map((id) => participantsById.get(id))
    .filter((p): p is SessionParticipant => Boolean(p));

  const flexPlayers: SessionParticipant[] = [];

  for (const p of resolved) {
    if (p.preferredPosition === 'GK') {
      if (lines.GK.length === 0) {
        lines.GK.push(p);
      } else {
        lines.DEF.push(p);
      }
    } else if (p.preferredPosition === 'DEF') {
      lines.DEF.push(p);
    } else if (p.preferredPosition === 'MID') {
      lines.MID.push(p);
    } else if (p.preferredPosition === 'FWD') {
      lines.FWD.push(p);
    } else {
      flexPlayers.push(p);
    }
  }

  for (const flex of flexPlayers) {
    if (lines.GK.length === 0) {
      lines.GK.push(flex);
    } else if (lines.DEF.length <= lines.MID.length && lines.DEF.length <= lines.FWD.length) {
      lines.DEF.push(flex);
    } else if (lines.MID.length <= lines.FWD.length) {
      lines.MID.push(flex);
    } else {
      lines.FWD.push(flex);
    }
  }

  return lines;
}

const POSITION_BADGE_STYLE: Record<PositionLine, string> = {
  GK: 'bg-amber-500/20 text-amber-300 border-amber-400/30',
  DEF: 'bg-sky-500/20 text-sky-300 border-sky-400/30',
  MID: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/30',
  FWD: 'bg-rose-500/20 text-rose-300 border-rose-400/30',
  ANY: 'bg-slate-500/20 text-slate-300 border-slate-400/30',
};

export const TacticalPitch: React.FC<TacticalPitchProps> = ({
  game,
  participantsById,
}) => {
  const teamALines = groupPlayersByTacticalLine(
    game.teamAPlayerIds,
    participantsById
  );
  const teamBLines = groupPlayersByTacticalLine(
    game.teamBPlayerIds,
    participantsById
  );

  const renderPlayerToken = (
    player: SessionParticipant,
    team: 'A' | 'B'
  ) => {
    const stats = game.playerStats?.[player.playerId];
    const goals = stats?.goals ?? 0;
    const assists = stats?.assists ?? 0;
    const isMvp = game.mvpPlayerId === player.playerId;

    return (
      <div
        key={player.playerId}
        className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-xs transition-colors ${
          team === 'A'
            ? 'bg-[#0C1D4A]/95 border-[#3B82F6]/45 text-[#F8FAFC]'
            : 'bg-[#F8FAFC]/95 border-[#CBD5E1] text-[#0B132B]'
        }`}
      >
        <span
          className={`font-mono-code text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
            team === 'A'
              ? POSITION_BADGE_STYLE[player.preferredPosition]
              : 'bg-[#0D3CE0]/10 text-[#0D3CE0] border-[#0D3CE0]/25'
          }`}
        >
          {player.preferredPosition}
        </span>
        <span className="font-semibold truncate max-w-[110px] sm:max-w-[135px]">
          {player.name}
        </span>

        {(goals > 0 || assists > 0 || isMvp) && (
          <div className="flex items-center gap-1 ml-auto pl-1 tabular-nums">
            {goals > 0 && (
              <span
                title={`${goals} Goal(s)`}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  team === 'A'
                    ? 'bg-emerald-500/25 text-emerald-200'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {goals}G
              </span>
            )}
            {assists > 0 && (
              <span
                title={`${assists} Assist(s)`}
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                  team === 'A'
                    ? 'bg-sky-500/25 text-sky-200'
                    : 'bg-sky-700 text-white'
                }`}
              >
                {assists}A
              </span>
            )}
            {isMvp && (
              <span
                title="Match MVP"
                className="text-amber-400 flex items-center"
              >
                <StarBadgeIcon className="w-3.5 h-3.5" />
              </span>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderLineRow = (
    players: SessionParticipant[],
    team: 'A' | 'B',
    label: string
  ) => {
    if (players.length === 0) return null;
    return (
      <div className="flex flex-col items-center gap-1.5 z-10 w-full">
        <span className="text-[10px] font-mono-code uppercase tracking-wider text-emerald-200/60">
          {label}
        </span>
        <div className="flex flex-wrap justify-center gap-2 w-full px-2">
          {players.map((p) => renderPlayerToken(p, team))}
        </div>
      </div>
    );
  };

  return (
    <div className="relative rounded-xl border border-emerald-500/25 bg-[#0B2216] overflow-hidden p-4 sm:p-6">
      {/* Crisp Geometric Pitch Markings SVG */}
      <svg
        viewBox="0 0 800 520"
        className="absolute inset-0 w-full h-full pointer-events-none opacity-20"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <rect
          x="16"
          y="16"
          width="768"
          height="488"
          fill="none"
          stroke="#F8FAFC"
          strokeWidth="2"
        />
        <line
          x1="400"
          y1="16"
          x2="400"
          y2="504"
          stroke="#F8FAFC"
          strokeWidth="2"
        />
        <circle
          cx="400"
          cy="260"
          r="64"
          fill="none"
          stroke="#F8FAFC"
          strokeWidth="2"
        />
        <circle cx="400" cy="260" r="4" fill="#F8FAFC" />
        {/* Left penalty box */}
        <rect
          x="16"
          y="130"
          width="110"
          height="260"
          fill="none"
          stroke="#F8FAFC"
          strokeWidth="2"
        />
        <rect
          x="16"
          y="190"
          width="45"
          height="140"
          fill="none"
          stroke="#F8FAFC"
          strokeWidth="2"
        />
        {/* Right penalty box */}
        <rect
          x="674"
          y="130"
          width="110"
          height="260"
          fill="none"
          stroke="#F8FAFC"
          strokeWidth="2"
        />
        <rect
          x="739"
          y="190"
          width="45"
          height="140"
          fill="none"
          stroke="#F8FAFC"
          strokeWidth="2"
        />
      </svg>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Team A Half (DFOP Royal Blue) */}
        <div className="flex flex-col justify-between gap-3 pb-4 lg:pb-0 lg:pr-4 border-b lg:border-b-0 lg:border-r border-emerald-200/15">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#1447E6] border border-white/40" />
              <span className="font-display font-bold text-sm text-white">
                {game.teamAName}
              </span>
            </div>
            <span className="text-xs font-mono-code text-emerald-200/80 tabular-nums">
              {game.teamAPlayerIds.length} on pitch
            </span>
          </div>

          <div className="flex flex-col gap-3 my-auto">
            {renderLineRow(teamALines.GK, 'A', 'Goalkeeper')}
            {renderLineRow(teamALines.DEF, 'A', 'Defense')}
            {renderLineRow(teamALines.MID, 'A', 'Midfield')}
            {renderLineRow(teamALines.FWD, 'A', 'Attack')}
          </div>
        </div>

        {/* Team B Half (DFOP Crest White) */}
        <div className="flex flex-col justify-between gap-3 pt-2 lg:pt-0 lg:pl-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-[#F8FAFC] border border-slate-400" />
              <span className="font-display font-bold text-sm text-white">
                {game.teamBName}
              </span>
            </div>
            <span className="text-xs font-mono-code text-emerald-200/80 tabular-nums">
              {game.teamBPlayerIds.length} on pitch
            </span>
          </div>

          <div className="flex flex-col gap-3 my-auto">
            {renderLineRow(teamBLines.FWD, 'B', 'Attack')}
            {renderLineRow(teamBLines.MID, 'B', 'Midfield')}
            {renderLineRow(teamBLines.DEF, 'B', 'Defense')}
            {renderLineRow(teamBLines.GK, 'B', 'Goalkeeper')}
          </div>
        </div>
      </div>
    </div>
  );
};
