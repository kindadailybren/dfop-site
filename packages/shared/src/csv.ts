import {
  CsvParseResult,
  CsvRowInput,
  FuzzyPlayerMatch,
  PlayerProfile,
  PositionLine,
  SkillLevel,
} from './types.js';

export function cleanNumberedPlayerName(raw: string): string {
  return raw
    .trim()
    .replace(/^\d+\.\s*/, '')
    .replace(/[“”]/g, '"')
    .trim();
}

export function normalizePlayerName(name: string): string {
  return cleanNumberedPlayerName(name)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s-']/g, '')
    .trim();
}

export function parseSkillLevel(raw: string): SkillLevel | null {
  const val = raw.trim().toLowerCase();
  if (!val) return 'Intermediate';
  if (val.startsWith('beg') || val === '1' || val === 'low' || val === 'novice') {
    return 'Beginner';
  }
  if (
    val.startsWith('int') ||
    val === 'interm' ||
    val === '2' ||
    val === 'med' ||
    val === 'medium'
  ) {
    return 'Intermediate';
  }
  if (
    val.startsWith('adv') ||
    val === 'messi' ||
    val === 'goat' ||
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
  const val = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!val || val === 'ANY' || val === 'FLEX' || val === 'FLEXIBLE' || val === 'ALL') {
    return 'ANY';
  }
  // Players who listed GK (e.g. GK, GK/Attack, GK/Defense, GK/Attack/Defense)
  // are mapped to GK so the Team Maker distributes Goalkeeper-capable players evenly across Team A and Team B
  if (
    val === 'GK' ||
    val === 'GOALKEEPER' ||
    val === 'KEEPER' ||
    val === 'GOALIE' ||
    val.startsWith('GK/') ||
    val.endsWith('/GK') ||
    val.includes('/GK/')
  ) {
    return 'GK';
  }
  if (val === 'ATTACK/DEFENSE' || val === 'DEFENSE/ATTACK' || val === 'ATTACK/DEFENCE') {
    return 'MID';
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
  if (val.includes('/')) {
    return 'MID';
  }
  return null;
}

function splitDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
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
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Detects and parses the multi-line vertical copy-paste format from Google Sheets:
 * e.g.:
 * Payment
 * Name
 * Position
 * Experience
 * Games played
 * /
 * 1. Geolina, Jeffren John
 * Defense
 * Interm
 */
function tryParseMultilineSheetPaste(rawLines: string[]): CsvRowInput[] | null {
  const nonEmpty = rawLines.map((l) => l.trim()).filter(Boolean);
  if (nonEmpty.length < 3) return null;

  // Check if any line has commas AND looks like standard CSV (with >= 3 columns)
  const commaRichLines = nonEmpty.filter((l) => l.split(',').length >= 3);
  if (commaRichLines.length > nonEmpty.length / 2) {
    return null;
  }

  // Look for numbered player lines like "1. Geolina, Jeffren John" or "21.Bergante, Jiro"
  const numberedLineCount = nonEmpty.filter((l) => /^\d+\./.test(l)).length;
  if (numberedLineCount === 0) {
    return null;
  }

  const rows: CsvRowInput[] = [];
  let idx = 0;

  while (idx < nonEmpty.length) {
    const line = nonEmpty[idx];

    // Match numbered entry: e.g. "1. Geolina, Jeffren John" or empty "25."
    if (/^\d+\./.test(line)) {
      const cleanedName = cleanNumberedPlayerName(line);
      if (!cleanedName) {
        // Empty numbered slot like "25." -> skip
        idx++;
        continue;
      }

      const posCandidate = nonEmpty[idx + 1] ?? '';
      const expCandidate = nonEmpty[idx + 2] ?? '';

      const pos = parsePositionLine(posCandidate);
      const skill = parseSkillLevel(expCandidate);

      if (pos && skill) {
        rows.push({
          name: cleanedName,
          skill,
          preferredPosition: pos,
          rawLineNumber: idx + 1,
        });
        idx += 3;
        continue;
      }
    }
    idx++;
  }

  return rows.length > 0 ? rows : null;
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

  // 1. Check if this is a vertical multi-line Google Sheet copy-paste
  const multilineRows = tryParseMultilineSheetPaste(rawLines);
  if (multilineRows) {
    for (const r of multilineRows) {
      const norm = normalizePlayerName(r.name);
      if (!norm || seenNormalized.has(norm)) continue;
      seenNormalized.add(norm);
      rows.push(r);
    }
    return { rows, errors, warnings };
  }

  // 2. Standard CSV or TSV (Tab-separated Google Sheets paste)
  let nameCol = 0;
  let skillCol = 1;
  let posCol = 2;
  let hasDetectedHeader = false;

  for (let idx = 0; idx < rawLines.length; idx++) {
    const lineNumber = idx + 1;
    const rawLine = rawLines[idx].trim();
    if (!rawLine || rawLine.startsWith('#')) {
      continue;
    }

    const delimiter: ',' | '\t' =
      rawLine.includes('\t') && splitDelimitedLine(rawLine, '\t').length >= 3
        ? '\t'
        : ',';
    const cols = splitDelimitedLine(rawLine, delimiter);
    const lowerCols = cols.map((c) => c.toLowerCase().trim());

    // Header row detection (supports Payment,Name,Position,Experience,Games played OR Name,Skill,Position, etc.)
    if (
      !hasDetectedHeader &&
      (lowerCols.includes('name') ||
        lowerCols.includes('player') ||
        lowerCols.includes('position') ||
        lowerCols.includes('experience') ||
        lowerCols.includes('skill'))
    ) {
      hasDetectedHeader = true;
      const detectedName = lowerCols.findIndex(
        (c) => c === 'name' || c === 'player' || c === 'player name' || c === 'participant'
      );
      const detectedSkill = lowerCols.findIndex(
        (c) => c === 'experience' || c === 'skill' || c === 'level' || c === 'tier'
      );
      const detectedPos = lowerCols.findIndex(
        (c) =>
          c === 'position' ||
          c === 'preferred position' ||
          c === 'prefered position' ||
          c === 'pos'
      );

      if (detectedName >= 0) nameCol = detectedName;
      if (detectedSkill >= 0) skillCol = detectedSkill;
      if (detectedPos >= 0) posCol = detectedPos;
      continue;
    }

    // If no header was explicitly provided, auto-detect if column 0 is Payment ("/" or empty)
    let rowNameCol = nameCol;
    let rowSkillCol = skillCol;
    let rowPosCol = posCol;

    if (!hasDetectedHeader && cols.length >= 4 && (cols[0] === '/' || cols[0] === '')) {
      rowNameCol = 1;
      // Check whether col 2 is Position or Experience
      if (parsePositionLine(cols[2]) && !parseSkillLevel(cols[2])) {
        rowPosCol = 2;
        rowSkillCol = 3;
      } else {
        rowSkillCol = 2;
        rowPosCol = 3;
      }
    } else if (!hasDetectedHeader && cols.length >= 3) {
      // Check if col 1 is Position and col 2 is Experience (e.g. Name,Position,Experience)
      if (
        parsePositionLine(cols[1]) !== null &&
        parseSkillLevel(cols[1]) === null &&
        parseSkillLevel(cols[2]) !== null
      ) {
        rowPosCol = 1;
        rowSkillCol = 2;
      }
    }

    const rawName = cols[rowNameCol] ?? '';
    const cleanedName = cleanNumberedPlayerName(rawName);

    // Ignore empty numbered slots at the bottom of the sheet (e.g., "25.", "26.", or blank rows)
    if (!cleanedName) {
      continue;
    }

    const rawSkill = cols[rowSkillCol] ?? 'Intermediate';
    const rawPos = cols[rowPosCol] ?? 'ANY';

    const normalized = normalizePlayerName(cleanedName);
    if (!normalized) {
      continue;
    }

    if (seenNormalized.has(normalized)) {
      warnings.push(`Line ${lineNumber}: Duplicate player "${cleanedName}" was skipped.`);
      continue;
    }

    const skill = parseSkillLevel(rawSkill);
    if (!skill) {
      errors.push(
        `Line ${lineNumber} (${cleanedName}): Unrecognized experience/skill "${rawSkill}".`
      );
      continue;
    }

    const preferredPosition = parsePositionLine(rawPos);
    if (!preferredPosition) {
      errors.push(
        `Line ${lineNumber} (${cleanedName}): Unrecognized position "${rawPos}".`
      );
      continue;
    }

    seenNormalized.add(normalized);
    rows.push({
      name: cleanedName,
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
    'Payment,Name,Position,Experience,Games played',
    '/,"1. Geolina, Jeffren John",Defense,Interm,',
    '/,"2. Lalong, Zainne Nazar",Attack/Defense,Beginner,',
    '/,"3. Montillano, Ramses Matthew",Attack/Defense,Interm,',
    '/,"4. Sunga, Jake",Defense,Adv,',
    '/,"5. Flores, Matthew Dylan",Attack,Adv,',
    '/,"6. Placer, Nathan",Attack/Defense,Adv,',
    '/,"7. Cordilla, Kharll Vince Nino",Defense,Interm,',
    '/,"8. Arlos, Chad Kenjie",Attack/Defense,Beginner,',
    ',"9. Estacio, Jerald Nitram Plenyos",GK/Attack/Defense,Adv,',
    ',"10. Dalauta, Louisse",Attack,Beginner,',
    ',"11. Aquino, Jose",Defense,Interm,',
    '/,"12. Guevara, Bhuvan ""Boo""",GK/Attack/Defense,Beginner,',
    ',"13. Estioko, Moner ""Moy""",GK/Attack,Beginner,',
    '/,"14. Kando, Shiyota",Attack,Interm,',
    '/,"15. Medina, Breindel Obtial",GK/Attack/Defense,Messi,',
    ',"16. Ramos, James Steezrack",GK/Attack/Defense,Beginner,',
    '/,"17. Pahayahay, Jay Luis",Attack,Beginner,',
    '/,"18. Pajaron, First",Defense,Beginner,',
    '/,"19. Pajaron, Antonio One",Defense,Beginner,',
    '/,"20. Dela Cruz, Marc Angelo",Attack,Beginner,',
    '/,"21. Bergante, Jiro",Attack/Defense,Interm,',
    ',"22. Fagel, Antonio Fudge",GK/Attack/Defense,Adv,',
    ',"23. Hori, Reon",Defense,Interm,',
    ',"24. Mendoza, Rhianne",GK/Attack/Defense,Adv,',
  ].join('\n');
}
