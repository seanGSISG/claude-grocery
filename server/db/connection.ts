import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { log } from '../utils/logger.js';

let db: Database.Database | null = null;

function getDbPath(): string {
  const dataDir = process.env.CLAUDE_GROCERY_DATA_DIR
    || path.join(os.homedir(), '.claude-grocery');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    log('info', `Created data directory: ${dataDir}`);
  }

  return path.join(dataDir, 'claude-grocery.db');
}

export function initDatabase(dbPath?: string): Database.Database {
  if (db) return db;

  const resolvedPath = dbPath || getDbPath();
  log('info', `Opening database at: ${resolvedPath}`);

  db = new Database(resolvedPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  return db;
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log('info', 'Database closed.');
  }
}
