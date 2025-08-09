"use strict";
/**
 * LLM parse cache using SQLite
 * Stores results with TTL for performance optimization
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cleanupExpiredCache = exports.setCachedResult = exports.getCachedResult = void 0;
const crypto = __importStar(require("crypto"));
const path = __importStar(require("path"));
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const electron_1 = require("electron");
const config_1 = require("./config");
let cacheDb = null;
function getCacheDb() {
    if (!cacheDb) {
        const dbPath = path.join(electron_1.app.getPath('userData'), 'llm-cache.db');
        cacheDb = new better_sqlite3_1.default(dbPath);
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
function computeContentHash(subject, plaintext) {
    const content = `${subject}\n${plaintext}`;
    return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}
function isWithinTTL(parsedAt) {
    const now = Date.now();
    const ttlMs = config_1.ONLYJOBS_CACHE_TTL_HOURS * 60 * 60 * 1000;
    return (now - parsedAt) < ttlMs;
}
function getCachedResult(subject, plaintext) {
    try {
        const db = getCacheDb();
        const hash = computeContentHash(subject, plaintext);
        const stmt = db.prepare('SELECT result_json, parsed_at FROM llm_parse_cache WHERE plaintext_hash = ?');
        const row = stmt.get(hash);
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
    }
    catch (error) {
        console.warn('Cache read failed:', error.message);
        return null;
    }
}
exports.getCachedResult = getCachedResult;
function setCachedResult(subject, plaintext, result) {
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
    }
    catch (error) {
        console.warn('Cache write failed:', error.message);
    }
}
exports.setCachedResult = setCachedResult;
function cleanupExpiredCache() {
    try {
        const db = getCacheDb();
        const cutoff = Date.now() - (config_1.ONLYJOBS_CACHE_TTL_HOURS * 60 * 60 * 1000);
        const stmt = db.prepare('DELETE FROM llm_parse_cache WHERE parsed_at < ?');
        const result = stmt.run(cutoff);
        if (result.changes > 0) {
            console.log(`🧹 Cleaned ${result.changes} expired cache entries`);
        }
    }
    catch (error) {
        console.warn('Cache cleanup failed:', error.message);
    }
}
exports.cleanupExpiredCache = cleanupExpiredCache;
