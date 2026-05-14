/**
 * In-memory JWT Token Blacklist
 * Tokens are added on logout and checked on every authenticated request.
 * Expired entries are automatically cleaned up every 15 minutes.
 */
const logger = require('../config/logger');

// Map<tokenString, expiresAtTimestamp>
const blacklist = new Map();

/**
 * Add a token to the blacklist.
 * @param {string} token - The JWT token string
 * @param {number} expiresAt - Unix timestamp (seconds) when the token expires
 */
const addToken = (token, expiresAt) => {
  blacklist.set(token, expiresAt * 1000); // Convert to ms
  logger.info(`Token añadido a la blacklist. Total: ${blacklist.size}`);
};

/**
 * Check if a token is blacklisted.
 * @param {string} token
 * @returns {boolean}
 */
const isBlacklisted = (token) => {
  return blacklist.has(token);
};

/**
 * Remove expired tokens from the blacklist.
 */
const cleanup = () => {
  const now = Date.now();
  let removed = 0;
  for (const [token, expiresAt] of blacklist.entries()) {
    if (expiresAt <= now) {
      blacklist.delete(token);
      removed++;
    }
  }
  if (removed > 0) {
    logger.info(`Blacklist cleanup: ${removed} tokens expirados eliminados. Restantes: ${blacklist.size}`);
  }
};

// Run cleanup every 15 minutes
const cleanupInterval = setInterval(cleanup, 15 * 60 * 1000);

// Prevent the interval from keeping the process alive
if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

module.exports = {
  addToken,
  isBlacklisted,
  cleanup,
  getSize: () => blacklist.size
};
