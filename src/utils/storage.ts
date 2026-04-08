import * as fs from 'fs';
import * as path from 'path';
import { Session, Vote, ModelElo, ArenaResult } from '../types';

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const DATA_DIR = path.join(HOME_DIR, '.llmarena');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const VOTES_FILE = path.join(DATA_DIR, 'votes.json');
const ELO_FILE = path.join(DATA_DIR, 'elo.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch {
    // Return default value on error
  }
  return defaultValue;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  ensureDataDir();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// Sessions
export function saveSession(session: Session): void {
  const sessions = getSessions();
  sessions.push(session);
  writeJsonFile(SESSIONS_FILE, sessions);
}

export function getSessions(): Session[] {
  return readJsonFile<Session[]>(SESSIONS_FILE, []);
}

export function getSessionById(id: string): Session | undefined {
  const sessions = getSessions();
  return sessions.find(s => s.id === id);
}

// Votes
export function saveVote(vote: Vote): void {
  const votes = getVotes();
  votes.push(vote);
  writeJsonFile(VOTES_FILE, votes);
}

export function getVotes(): Vote[] {
  return readJsonFile<Vote[]>(VOTES_FILE, []);
}

// Elo Ratings
export function getEloRatings(): Map<string, ModelElo> {
  const data = readJsonFile<Record<string, ModelElo>>(ELO_FILE, {});
  return new Map(Object.entries(data));
}

export function saveEloRatings(ratings: Map<string, ModelElo>): void {
  const data = Object.fromEntries(ratings);
  writeJsonFile(ELO_FILE, data);
}

function getExpectedScore(ratingA: number, ratingB: number): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

export function updateElo(winner: string, loser: string, isTie: boolean = false): void {
  const ratings = getEloRatings();
  const K = 32; // K-factor for Elo adjustment

  if (!ratings.has(winner)) {
    ratings.set(winner, { name: winner, elo: 1500, wins: 0, losses: 0, ties: 0, matches: 0 });
  }
  if (!ratings.has(loser)) {
    ratings.set(loser, { name: loser, elo: 1500, wins: 0, losses: 0, ties: 0, matches: 0 });
  }

  const winnerRating = ratings.get(winner)!;
  const loserRating = ratings.get(loser)!;

  const expectedWinner = getExpectedScore(winnerRating.elo, loserRating.elo);
  const expectedLoser = getExpectedScore(loserRating.elo, winnerRating.elo);

  if (isTie) {
    winnerRating.elo += Math.round(K * (0.5 - expectedWinner));
    loserRating.elo += Math.round(K * (0.5 - expectedLoser));
    winnerRating.ties++;
    loserRating.ties++;
  } else {
    winnerRating.elo += Math.round(K * (1 - expectedWinner));
    loserRating.elo += Math.round(K * (0 - expectedLoser));
    winnerRating.wins++;
    loserRating.losses++;
  }

  winnerRating.matches++;
  loserRating.matches++;

  ratings.set(winner, winnerRating);
  ratings.set(loser, loserRating);
  saveEloRatings(ratings);
}

export function getLeaderboard(): ModelElo[] {
  const ratings = getEloRatings();
  return Array.from(ratings.values())
    .sort((a, b) => b.elo - a.elo);
}

export function resetElo(): void {
  writeJsonFile(ELO_FILE, {});
}

// Export results
export function exportSession(session: Session, format: 'json' | 'csv'): string {
  if (format === 'json') {
    return JSON.stringify(session, null, 2);
  }

  // CSV format
  let csv = 'Model,Response,Tokens/sec,Time\n';
  for (const result of session.results) {
    const escapedResponse = result.response.replace(/"/g, '""').replace(/\n/g, ' ');
    csv += `"${result.modelName}","${escapedResponse}",${result.tokensPerSecond},${result.totalTime}\n`;
  }
  return csv;
}
