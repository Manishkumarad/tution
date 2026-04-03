const env = require('../config/env');

const memoryStore = new Map();
let redisClient = null;
let redisReady = false;
let redisInitTried = false;

function parseRedisUrl() {
  if (!env.redisUrl) return null;
  return env.redisUrl;
}

async function initRedisIfNeeded() {
  if (redisInitTried) return;
  redisInitTried = true;

  if (!env.redisEnabled) {
    return;
  }

  const redisUrl = parseRedisUrl();
  if (!redisUrl) {
    console.warn('[cache] REDIS_ENABLED is true but REDIS_URL is missing. Falling back to in-memory cache.');
    return;
  }

  try {
    // Lazy require so local environments can run without Redis dependencies.
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const Redis = require('ioredis');

    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true
    });

    await redisClient.connect();
    redisReady = true;
    console.log('[cache] Redis connected.');
  } catch (err) {
    redisReady = false;
    console.warn(`[cache] Redis init failed (${err.message}). Falling back to in-memory cache.`);
  }
}

function nowMs() {
  return Date.now();
}

function memoryGet(key) {
  const entry = memoryStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= nowMs()) {
    memoryStore.delete(key);
    return null;
  }
  return entry.value;
}

function memorySet(key, value, ttlSec) {
  memoryStore.set(key, {
    value,
    expiresAt: nowMs() + ttlSec * 1000
  });
}

async function getJson(key) {
  await initRedisIfNeeded();

  if (redisReady && redisClient) {
    try {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    } catch (err) {
      console.warn(`[cache] Redis get failed (${err.message}).`);
    }
  }

  return memoryGet(key);
}

async function setJson(key, value, ttlSec) {
  await initRedisIfNeeded();

  if (redisReady && redisClient) {
    try {
      await redisClient.set(key, JSON.stringify(value), 'EX', Math.max(1, ttlSec));
      return;
    } catch (err) {
      console.warn(`[cache] Redis set failed (${err.message}).`);
    }
  }

  memorySet(key, value, ttlSec);
}

async function delKey(key) {
  await initRedisIfNeeded();

  if (redisReady && redisClient) {
    try {
      await redisClient.del(key);
      return;
    } catch (err) {
      console.warn(`[cache] Redis del failed (${err.message}).`);
    }
  }

  memoryStore.delete(key);
}

module.exports = {
  getJson,
  setJson,
  delKey,
  initRedisIfNeeded
};
