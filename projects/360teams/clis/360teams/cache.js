/**
 * Simple file-based cache for 360teams CLI.
 * Stored at ~/.opencli/cache/360teams/<key>.json
 * so it's accessible regardless of working directory.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CACHE_DIR = join(homedir(), '.opencli', 'cache', '360teams');

function ensureDir() {
  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
}

/**
 * Read a cached value. Returns null if missing or expired.
 * @param {string} key
 * @returns {any|null}
 */
export function getCache(key) {
  try {
    const data = JSON.parse(readFileSync(join(CACHE_DIR, `${key}.json`), 'utf8'));
    if (data.expiresAt && Date.now() > data.expiresAt) return null;
    return data.value;
  } catch {
    return null;
  }
}

/**
 * Write a value to cache.
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs  Time-to-live in ms. Default 1 hour.
 */
export function setCache(key, value, ttlMs = 60 * 60 * 1000) {
  ensureDir();
  writeFileSync(
    join(CACHE_DIR, `${key}.json`),
    JSON.stringify({ value, expiresAt: Date.now() + ttlMs })
  );
}
