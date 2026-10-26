import {
  CsvParseResult,
  CsvRowInput,
  FuzzyPlayerMatch,
  PlayerProfile,
  PositionLine,
  SkillLevel,
} from './types.js';

export function normalizePlayerName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s-']/g, '');
}

export function parseSkillLevel(raw: string): SkillLevel | null {
  const val = raw.trim().toLowerCase();
  if (!val) return 'Intermediate';
  if (val.startsWith('beg') || val === '1' || val === 'low' || val === 'novice') {
    return 'Beginner';
  }
  if (val.startsWith('int') || val === '2' || val === 'med' || val === 'medium') {
    return 'Intermediate';
  }
  if (
    val.startsWith('adv') ||
    val === '3' ||
    val === 'high' ||
    val === 'pro' ||
    val === 'expert'
  ) {
    return 'Advanced';
  }
  return null;
}

export function parsePositionLine(raw: string): PositionLine | null {
  const val = raw.trim().toUpperCase();
  if (!val || val === 'ANY' || val === 'FLEX' || val === 'FLEXIBLE' || val === 'ALL') {
    return 'ANY';
  }
  if (val === 'GK' || val === 'GOALKEEPER' || val === 'KEEPER' || val === 'GOALIE') {
    return 'GK';
  }
  if (
    val === 'DEF' ||
    val === 'DEFENDER' ||
    val === 'DEFENSE' ||
    val === 'DEFENCE' ||
    val === 'CB' ||
    val === 'LB' ||
    val === 'RB' ||
    val === 'WB'
  ) {
    return 'DEF';
  }
  if (
    val === 'MID' ||
    val === 'MIDFIELDER' ||
    val === 'MIDFIELD' ||
    val === 'CM' ||
    val === 'CDM' ||
    val === 'CAM' ||
    val === 'LM' ||
    val === 'RM'
  ) {
    return 'MID';
  }
  if (
    val === 'FWD' ||
    val === 'FORWARD' ||
    val === 'STRIKER' ||
    val === 'ATTACK' ||
    val === 'ATTACKER' ||
    val === 'ST' ||
    val === 'CF' ||
    val === 'LW' ||
    val === 'RW'
  ) {
    return 'FWD';
  }
  return null;
}

function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseParticipantsCsv(csvText: string): CsvParseResult {
  const rows: CsvRowInput[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenNormalized = new Set<string>();

  const rawLines = csvText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n');

  for (let idx = 0; idx < rawLines.length; idx++) {
    const lineNumber = idx + 1;
    const rawLine = rawLines[idx].trim();
    if (!rawLine || rawLine.startsWith('#')) {
      continue;
    }

    const cols = splitCsvLine(rawLine);
    const firstColLower = (cols[0] ?? '').toLowerCase();

    if (
      idx === 0 &&
      (firstColLower === 'name' ||
        firstColLower === 'player' ||
        firstColLower === 'player name' ||
        firstColLower === 'participant')
    ) {
      continue;
    }

    const name = (cols[0] ?? '').trim();
    const rawSkill = cols[1] ?? 'Intermediate';
    const rawPos = cols[2] ?? 'ANY';

    if (!name) {
      errors.push(`Line ${lineNumber}: Missing player name.`);
      continue;
    }

    const normalized = normalizePlayerName(name);
    if (!normalized) {
      errors.push(`Line ${lineNumber}: Invalid player name "${name}".`);
      continue;
    }

    if (seenNormalized.has(normalized)) {
      warnings.push(`Line ${lineNumber}: Duplicate player "${name}" in CSV was skipped.`);
      continue;
    }

    const skill = parseSkillLevel(rawSkill);
    if (!skill) {
      errors.push(
        `Line ${lineNumber} (${name}): Invalid skill "${rawSkill}". Expected Beginner, Intermediate, or Advanced.`
      );
      continue;
    }

    const preferredPosition = parsePositionLine(rawPos);
    if (!preferredPosition) {
      errors.push(
        `Line ${lineNumber} (${name}): Invalid position "${rawPos}". Expected GK, DEF, MID, FWD, or ANY.`
      );
      continue;
    }

    seenNormalized.add(normalized);
    rows.push({
      name,
      skill,
      preferredPosition,
      rawLineNumber: lineNumber,
    });
  }

  return { rows, errors, warnings };
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

export function findFuzzyMatches(
  csvRows: CsvRowInput[],
  existingPlayers: PlayerProfile[]
): FuzzyPlayerMatch[] {
  const matches: FuzzyPlayerMatch[] = [];
  const exactMap = new Map<string, PlayerProfile>();

  for (const player of existingPlayers) {
    exactMap.set(player.normalizedName, player);
  }

  for (const row of csvRows) {
    const norm = normalizePlayerName(row.name);
    const exact = exactMap.get(norm);
    if (exact) {
      matches.push({
        csvName: row.name,
        matchedPlayerId: exact.id,
        matchedPlayerName: exact.name,
        distance: 0,
        exactNormalized: true,
      });
      continue;
    }

    let bestCandidate: PlayerProfile | null = null;
    let bestDistance = Infinity;

    for (const player of existingPlayers) {
      const dist = levenshteinDistance(norm, player.normalizedName);
      if (dist > 0 && dist <= 2 && Math.min(norm.length, player.normalizedName.length) >= 4) {
        if (dist < bestDistance) {
          bestDistance = dist;
          bestCandidate = player;
        }
      }
    }

    if (bestCandidate) {
      matches.push({
        csvName: row.name,
        matchedPlayerId: bestCandidate.id,
        matchedPlayerName: bestCandidate.name,
        distance: bestDistance,
        exactNormalized: false,
      });
    }
  }

  return matches;
}

export function generateSampleCsv(): string {
  return [
    'Name,Skill,Preferred Position',
    'Marcus Vance,Advanced,MID',
    'Liam OConnor,Intermediate,DEF',
    'Tariq Al-Mansoor,Advanced,FWD',
    'Devon Brooks,Beginner,DEF',
    'Kieran Patel,Intermediate,GK',
    'Rafael Silva,Advanced,MID',
    'Noah Takahashi,Intermediate,FWD',
    'Samir Hassan,Beginner,MID',
    'Lucas Lindqvist,Intermediate,DEF',
    'Jude Mensah,Advanced,FWD',
    'Owen Gallagher,Intermediate,GK',
    'Mateo Rossi,Beginner,DEF',
    'Callum Fraser,Intermediate,MID',
    'Zayd Karim,Advanced,DEF',
    'Elias Thorne,Intermediate,ANY',
    'Hugo Morales,Beginner,FWD',
  ].join('\n');
}
