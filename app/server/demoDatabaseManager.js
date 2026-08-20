const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const Database = require("better-sqlite3");

const dataPath = path.join(
  __dirname,
  "..",
  "data"
);

const templateDatabasePath = path.join(
  dataPath,
  "demo-template.db"
);

const sessionsPath = path.join(
  dataPath,
  "sessions"
);

fs.mkdirSync(sessionsPath, {
  recursive: true,
});

const openDatabases = new Map();

function getSessionDatabasePath(sessionId) {
  return path.join(
    sessionsPath,
    `${sessionId}.db`
  );
}

function createSession() {
  const sessionId = crypto.randomUUID();

  const sessionDatabasePath =
    getSessionDatabasePath(sessionId);

  fs.copyFileSync(
    templateDatabasePath,
    sessionDatabasePath
  );

  return sessionId;
}

function getSessionDatabase(sessionId) {
  if (openDatabases.has(sessionId)) {
    return openDatabases.get(sessionId);
  }

  const sessionDatabasePath =
    getSessionDatabasePath(sessionId);

  if (!fs.existsSync(sessionDatabasePath)) {
    return null;
  }

  const db = new Database(
    sessionDatabasePath
  );

  db.pragma("foreign_keys = ON");

  openDatabases.set(sessionId, db);

  return db;
}

function resetSessionDatabase(sessionId) {
  const sessionDatabasePath =
    getSessionDatabasePath(sessionId);

  /*
   * The session must already exist.
   */
  if (!fs.existsSync(sessionDatabasePath)) {
    return false;
  }

  /*
   * Close the cached SQLite connection before
   * replacing the file underneath it.
   */
  const existingDatabase =
    openDatabases.get(sessionId);

  if (existingDatabase) {
    existingDatabase.close();
    openDatabases.delete(sessionId);
  }

  /*
   * Restore the pristine database snapshot.
   */
  fs.copyFileSync(
    templateDatabasePath,
    sessionDatabasePath
  );

  /*
   * Reopen it immediately so subsequent requests
   * use a fresh connection to the restored file.
   */
  const db = new Database(
    sessionDatabasePath
  );

  db.pragma("foreign_keys = ON");

  openDatabases.set(sessionId, db);

  return true;
}

module.exports = {
  createSession,
  getSessionDatabase,
  resetSessionDatabase,
};