/**
 * LLM parse cache using SQLite
 * Stores results with TTL for performance optimization
 */

import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { ONLYJOBS_CACHE_TTL_HOURS } from './config';

let cacheDb: Database.Database | null = null;

function resolveLLMCachePath(): string {
  const explicit = process.env.ONLYJOBS_DB_PATH;
  if (explicit) return explicit;

  // Try Electron app path if available
  try {
    const { app } = require('electron');
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'llm-cache.sqlite3');
    }
  } catch (_) {
    // ignore: not in full Electron runtime
  }

  // Fallback for ELECTRON_RUN_AS_NODE or tests
  const dir = path.resolve(process.cwd(), '.cache');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_e) {}
  return path.join(dir, 'llm-cache.sqlite3');
}

function getCacheDb(): Database.Database {
  if (!cacheDb) {
    const dbPath = resolveLLMCachePath();
    cacheDb = new Database(dbPath);
    
    // Create cache table if not exists
    cacheDb.exec(`
      CREATE TABLE IF NOT EXISTS llm_parse_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plaintext_hash TEXT UNIQUE NOT NULL,
        subject TEXT NOT NULL,
        result_json TEXT NOT NULL,
        parsed_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_hash ON llm_parse_cache(plaintext_hash);
      CREATE INDEX IF NOT EXISTS idx_parsed_at ON llm_parse_cache(parsed_at);
    `);
  }
  return cacheDb;
}

function computeContentHash(subject: string, plaintext: string): string {
  const content = `${subject}\n${plaintext}`;
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function isWithinTTL(parsedAt: number): boolean {
  const now = Date.now();
  const ttlMs = ONLYJOBS_CACHE_TTL_HOURS * 60 * 60 * 1000;
  return (now - parsedAt) < ttlMs;
}

export function getCachedResult(subject: string, plaintext: string): any | null {
  // Check if caching is disabled for testing
  if (process.env.ONLYJOBS_DISABLE_CACHE_FOR_TEST === '1') {
    return null;
  }
  
  try {
    const db = getCacheDb();
    const hash = computeContentHash(subject, plaintext);
    
    const stmt = db.prepare('SELECT result_json, parsed_at FROM llm_parse_cache WHERE plaintext_hash = ?');
    const row = stmt.get(hash) as any;
    
    if (row && isWithinTTL(row.parsed_at)) {
      const result = JSON.parse(row.result_json);
      console.log('📦 Cache hit for LLM result');
      return result;
    }
    
    // Clean up expired entry if exists
    if (row) {
      console.log('🗑️ Cleaning expired cache entry');
      const deleteStmt = db.prepare('DELETE FROM llm_parse_cache WHERE plaintext_hash = ?');
      deleteStmt.run(hash);
    }
    
    return null;
  } catch (error) {
    console.warn('Cache read failed:', error.message);
    return null;
  }
}

export function setCachedResult(subject: string, plaintext: string, result: any): void {
  // Check if caching is disabled for testing
  if (process.env.ONLYJOBS_DISABLE_CACHE_FOR_TEST === '1') {
    return;
  }
  
  try {
    const db = getCacheDb();
    const hash = computeContentHash(subject, plaintext);
    const now = Date.now();
    
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO llm_parse_cache (plaintext_hash, subject, result_json, parsed_at)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(hash, subject, JSON.stringify(result), now);
    console.log('💾 Cached LLM result');
  } catch (error) {
    console.warn('Cache write failed:', error.message);
  }
}

export function cleanupExpiredCache(): void {
  try {
    const db = getCacheDb();
    const cutoff = Date.now() - (ONLYJOBS_CACHE_TTL_HOURS * 60 * 60 * 1000);
    
    const stmt = db.prepare('DELETE FROM llm_parse_cache WHERE parsed_at < ?');
    const result = stmt.run(cutoff);
    
    if (result.changes > 0) {
      console.log(`🧹 Cleaned ${result.changes} expired cache entries`);
    }
  } catch (error) {
    console.warn('Cache cleanup failed:', error.message);
  }
}