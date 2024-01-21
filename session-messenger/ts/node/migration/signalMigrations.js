"use strict";
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
exports.getSQLCipherIntegrityCheck = exports.openAndMigrateDatabase = exports.updateSchema = void 0;
const path_1 = __importDefault(require("path"));
const BetterSqlite3 = __importStar(require("@signalapp/better-sqlite3"));
const lodash_1 = require("lodash");
const database_utility_1 = require("../database_utility");
const getRootPath_1 = require("../getRootPath");
const sessionMigrations_1 = require("./sessionMigrations");
const sessionjs_logger_1 = require("../../sessionjs-logger");
const openDbOptions = {
    verbose: false ? sessionjs_logger_1.console.log : undefined,
    nativeBinding: path_1.default.join((0, getRootPath_1.getAppRootPath)(), 'node_modules', '@signalapp', 'better-sqlite3', 'build', 'Release', 'better_sqlite3.node'),
};
function updateToSchemaVersion1(currentVersion, db) {
    if (currentVersion >= 1) {
        return;
    }
    sessionjs_logger_1.console.log('updateToSchemaVersion1: starting...');
    db.transaction(() => {
        db.exec(`CREATE TABLE ${database_utility_1.MESSAGES_TABLE}(
        id STRING PRIMARY KEY ASC,
        json TEXT,

        unread INTEGER,
        expires_at INTEGER,
        sent BOOLEAN,
        sent_at INTEGER,
        schemaVersion INTEGER,
        conversationId STRING,
        received_at INTEGER,
        source STRING,
        sourceDevice STRING,
        hasAttachments INTEGER,
        hasFileAttachments INTEGER,
        hasVisualMediaAttachments INTEGER
      );

      CREATE INDEX messages_unread ON ${database_utility_1.MESSAGES_TABLE} (
        unread
      );

      CREATE INDEX messages_expires_at ON ${database_utility_1.MESSAGES_TABLE} (
        expires_at
      );

      CREATE INDEX messages_receipt ON ${database_utility_1.MESSAGES_TABLE} (
        sent_at
      );

      CREATE INDEX messages_schemaVersion ON ${database_utility_1.MESSAGES_TABLE} (
        schemaVersion
      );

      CREATE INDEX messages_conversation ON ${database_utility_1.MESSAGES_TABLE} (
        conversationId,
        received_at
      );

      CREATE INDEX messages_duplicate_check ON ${database_utility_1.MESSAGES_TABLE} (
        source,
        sourceDevice,
        sent_at
      );

      CREATE INDEX messages_hasAttachments ON ${database_utility_1.MESSAGES_TABLE} (
        conversationId,
        hasAttachments,
        received_at
      );

      CREATE INDEX messages_hasFileAttachments ON ${database_utility_1.MESSAGES_TABLE} (
        conversationId,
        hasFileAttachments,
        received_at
      );

      CREATE INDEX messages_hasVisualMediaAttachments ON ${database_utility_1.MESSAGES_TABLE} (
        conversationId,
        hasVisualMediaAttachments,
        received_at
      );

      CREATE TABLE unprocessed(
        id STRING,
        timestamp INTEGER,
        json TEXT
      );

      CREATE INDEX unprocessed_id ON unprocessed (
        id
      );

      CREATE INDEX unprocessed_timestamp ON unprocessed (
        timestamp
      );


      `);
        db.pragma('user_version = 1');
    })();
    sessionjs_logger_1.console.log('updateToSchemaVersion1: success!');
}
function updateToSchemaVersion2(currentVersion, db) {
    if (currentVersion >= 2) {
        return;
    }
    sessionjs_logger_1.console.log('updateToSchemaVersion2: starting...');
    db.transaction(() => {
        db.exec(`ALTER TABLE ${database_utility_1.MESSAGES_TABLE}
       ADD COLUMN expireTimer INTEGER;

       ALTER TABLE ${database_utility_1.MESSAGES_TABLE}
       ADD COLUMN expirationStartTimestamp INTEGER;

       ALTER TABLE ${database_utility_1.MESSAGES_TABLE}
       ADD COLUMN type STRING;

       CREATE INDEX messages_expiring ON ${database_utility_1.MESSAGES_TABLE} (
        expireTimer,
        expirationStartTimestamp,
        expires_at
      );

      UPDATE ${database_utility_1.MESSAGES_TABLE} SET
        expirationStartTimestamp = json_extract(json, '$.expirationStartTimestamp'),
        expireTimer = json_extract(json, '$.expireTimer'),
        type = json_extract(json, '$.type');


       `);
        db.pragma('user_version = 2');
    })();
    sessionjs_logger_1.console.log('updateToSchemaVersion2: success!');
}
function updateToSchemaVersion3(currentVersion, db) {
    if (currentVersion >= 3) {
        return;
    }
    sessionjs_logger_1.console.log('updateToSchemaVersion3: starting...');
    db.transaction(() => {
        db.exec(`
      DROP INDEX messages_expiring;
      DROP INDEX messages_unread;

      CREATE INDEX messages_without_timer ON ${database_utility_1.MESSAGES_TABLE} (
        expireTimer,
        expires_at,
        type
      ) WHERE expires_at IS NULL AND expireTimer IS NOT NULL;

      CREATE INDEX messages_unread ON ${database_utility_1.MESSAGES_TABLE} (
        conversationId,
        unread
      ) WHERE unread IS NOT NULL;

      ANALYZE;

      `);
        db.pragma('user_version = 3');
    })();
    sessionjs_logger_1.console.log('updateToSchemaVersion3: success!');
}
function updateToSchemaVersion4(currentVersion, db) {
    if (currentVersion >= 4) {
        return;
    }
    sessionjs_logger_1.console.log('updateToSchemaVersion4: starting...');
    db.transaction(() => {
        db.exec(`

      CREATE TABLE ${database_utility_1.CONVERSATIONS_TABLE}(
        id STRING PRIMARY KEY ASC,
        json TEXT,

        active_at INTEGER,
        type STRING,
        members TEXT,
        name TEXT,
        profileName TEXT
      );

      CREATE INDEX conversations_active ON ${database_utility_1.CONVERSATIONS_TABLE} (
        active_at
      ) WHERE active_at IS NOT NULL;
      CREATE INDEX conversations_type ON ${database_utility_1.CONVERSATIONS_TABLE} (
        type
      ) WHERE type IS NOT NULL;

      `);
        db.pragma('user_version = 4');
    })();
    sessionjs_logger_1.console.log('updateToSchemaVersion4: success!');
}
function updateToSchemaVersion6(currentVersion, db) {
    if (currentVersion >= 6) {
        return;
    }
    sessionjs_logger_1.console.log('updateToSchemaVersion6: starting...');
    db.transaction(() => {
        db.exec(`
      CREATE TABLE ${database_utility_1.LAST_HASHES_TABLE}(
        snode TEXT PRIMARY KEY,
        hash TEXT,
        expiresAt INTEGER
      );

      CREATE TABLE seenMessages(
        hash TEXT PRIMARY KEY,
        expiresAt INTEGER
      );


      CREATE TABLE sessions(
        id STRING PRIMARY KEY ASC,
        number STRING,
        json TEXT
      );

      CREATE INDEX sessions_number ON sessions (
        number
      ) WHERE number IS NOT NULL;

      CREATE TABLE groups(
        id STRING PRIMARY KEY ASC,
        json TEXT
      );


      CREATE TABLE ${database_utility_1.IDENTITY_KEYS_TABLE}(
        id STRING PRIMARY KEY ASC,
        json TEXT
      );

      CREATE TABLE ${database_utility_1.ITEMS_TABLE}(
        id STRING PRIMARY KEY ASC,
        json TEXT
      );


      CREATE TABLE preKeys(
        id INTEGER PRIMARY KEY ASC,
        recipient STRING,
        json TEXT
      );


      CREATE TABLE signedPreKeys(
        id INTEGER PRIMARY KEY ASC,
        json TEXT
      );

      CREATE TABLE contactPreKeys(
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        identityKeyString VARCHAR(255),
        keyId INTEGER,
        json TEXT
      );

      CREATE UNIQUE INDEX contact_prekey_identity_key_string_keyid ON contactPreKeys (
        identityKeyString,
        keyId
      );

      CREATE TABLE contactSignedPreKeys(
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        identityKeyString VARCHAR(255),
        keyId INTEGER,
        json TEXT
      );

      CREATE UNIQUE INDEX contact_signed_prekey_identity_key_string_keyid ON contactSignedPreKeys (
        identityKeyString,
        keyId
      );

      `);
        db.pragma('user_version = 6');
    })();
    sessionjs_logger_1.console.log('updateToSchemaVersion6: success!');
}
function updateToSchemaVersion7(currentVersion, db) {
    if (currentVersion >= 7) {
        return;
    }
    sessionjs_logger_1.console.log('updateToSchemaVersion7: starting...');
    db.transaction(() => {
        db.exec(`
        -- SQLite has been coercing our STRINGs into numbers, so we force it with TEXT
        -- We create a new table then copy the data into it, since we can't modify columns
        DROP INDEX sessions_number;
        ALTER TABLE sessions RENAME TO sessions_old;

        CREATE TABLE sessions(
          id TEXT PRIMARY KEY,
          number TEXT,
          json TEXT
        );
        CREATE INDEX sessions_number ON sessions (
          number
        ) WHERE number IS NOT NULL;
        INSERT INTO sessions(id, number, json)
      SELECT id, number, json FROM sessions_old;
        DROP TABLE sessions_old;
      `);
        db.pragma('user_version = 7');
    })();
    sessionjs_logger_1.console.log('updateToSchemaVersion7: success!');
}
function updateToSchemaVersion8(currentVersion, db) {
    if (currentVersion >= 8) {
        return;
    }
    sessionjs_logger_1.console.log('updateToSchemaVersion8: starting...');
    db.transaction(() => {
        db.exec(`
      -- First, we pull a new body field out of the message table's json blob
      ALTER TABLE ${database_utility_1.MESSAGES_TABLE}
        ADD COLUMN body TEXT;
      UPDATE ${database_utility_1.MESSAGES_TABLE} SET body = json_extract(json, '$.body');

      -- Then we create our full-text search table and populate it
      CREATE VIRTUAL TABLE ${database_utility_1.MESSAGES_FTS_TABLE}
        USING fts5(id UNINDEXED, body);

      INSERT INTO ${database_utility_1.MESSAGES_FTS_TABLE}(id, body)
        SELECT id, body FROM ${database_utility_1.MESSAGES_TABLE};

      -- Then we set up triggers to keep the full-text search table up to date
      CREATE TRIGGER messages_on_insert AFTER INSERT ON ${database_utility_1.MESSAGES_TABLE} BEGIN
        INSERT INTO ${database_utility_1.MESSAGES_FTS_TABLE} (
          id,
          body
        ) VALUES (
          new.id,
          new.body
        );
      END;
      CREATE TRIGGER messages_on_delete AFTER DELETE ON ${database_utility_1.MESSAGES_TABLE} BEGIN
        DELETE FROM ${database_utility_1.MESSAGES_FTS_TABLE} WHERE id = old.id;
      END;
      CREATE TRIGGER messages_on_update AFTER UPDATE ON ${database_utility_1.MESSAGES_TABLE} BEGIN
        DELETE FROM ${database_utility_1.MESSAGES_FTS_TABLE} WHERE id = old.id;
        INSERT INTO ${database_utility_1.MESSAGES_FTS_TABLE}(
          id,
          body
        ) VALUES (
          new.id,
          new.body
        );
      END;

      `);
        db.pragma('user_version = 8');
    })();
    sessionjs_logger_1.console.log('updateToSchemaVersion8: success!');
}
function updateToSchemaVersion9(currentVersion, db) {
    if (currentVersion >= 9) {
        return;
    }
    sessionjs_logger_1.console.log('updateToSchemaVersion9: starting...');
    db.transaction(() => {
        db.exec(`
        CREATE TABLE ${database_utility_1.ATTACHMENT_DOWNLOADS_TABLE}(
          id STRING primary key,
          timestamp INTEGER,
          pending INTEGER,
          json TEXT
        );

        CREATE INDEX attachment_downloads_timestamp
          ON ${database_utility_1.ATTACHMENT_DOWNLOADS_TABLE} (
            timestamp
        ) WHERE pending = 0;
        CREATE INDEX attachment_downloads_pending
          ON ${database_utility_1.ATTACHMENT_DOWNLOADS_TABLE} (
            pending
        ) WHERE pending != 0;
      `);
        db.pragma('user_version = 9');
    })();
    sessionjs_logger_1.console.log('updateToSchemaVersion9: success!');
}
function updateToSchemaVersion10(currentVersion, db) {
    if (currentVersion >= 10) {
        return;
    }
    sessionjs_logger_1.console.log('updateToSchemaVersion10: starting...');
    db.transaction(() => {
        db.exec(`
        DROP INDEX unprocessed_id;
        DROP INDEX unprocessed_timestamp;
        ALTER TABLE unprocessed RENAME TO unprocessed_old;

        CREATE TABLE unprocessed(
          id STRING,
          timestamp INTEGER,
          version INTEGER,
          attempts INTEGER,
          envelope TEXT,
          decrypted TEXT,
          source TEXT,
          sourceDevice TEXT,
          serverTimestamp INTEGER
        );

        CREATE INDEX unprocessed_id ON unprocessed (
          id
        );
        CREATE INDEX unprocessed_timestamp ON unprocessed (
          timestamp
        );

        INSERT INTO unprocessed (
          id,
          timestamp,
          version,
          attempts,
          envelope,
          decrypted,
          source,
          sourceDevice,
          serverTimestamp
        ) SELECT
          id,
          timestamp,
          json_extract(json, '$.version'),
          json_extract(json, '$.attempts'),
          json_extract(json, '$.envelope'),
          json_extract(json, '$.decrypted'),
          json_extract(json, '$.source'),
          json_extract(json, '$.sourceDevice'),
          json_extract(json, '$.serverTimestamp')
        FROM unprocessed_old;

        DROP TABLE unprocessed_old;
      `);
        db.pragma('user_version = 10');
    })();
    sessionjs_logger_1.console.log('updateToSchemaVersion10: success!');
}
function updateToSchemaVersion11(currentVersion, db) {
    if (currentVersion >= 11) {
        return;
    }
    sessionjs_logger_1.console.log('updateToSchemaVersion11: starting...');
    db.transaction(() => {
        db.exec(`
        DROP TABLE groups;
      `);
        db.pragma('user_version = 11');
    })();
    sessionjs_logger_1.console.log('updateToSchemaVersion11: success!');
}
const SCHEMA_VERSIONS = [
    updateToSchemaVersion1,
    updateToSchemaVersion2,
    updateToSchemaVersion3,
    updateToSchemaVersion4,
    () => null,
    updateToSchemaVersion6,
    updateToSchemaVersion7,
    updateToSchemaVersion8,
    updateToSchemaVersion9,
    updateToSchemaVersion10,
    updateToSchemaVersion11,
];
async function updateSchema(db) {
    const sqliteVersion = getSQLiteVersion(db);
    const sqlcipherVersion = getSQLCipherVersion(db);
    const userVersion = getUserVersion(db);
    const maxUserVersion = SCHEMA_VERSIONS.length;
    const schemaVersion = getSchemaVersion(db);
    sessionjs_logger_1.console.log('updateSchema:');
    sessionjs_logger_1.console.log(` Current user_version: ${userVersion}`);
    sessionjs_logger_1.console.log(` Most recent db schema: ${maxUserVersion}`);
    sessionjs_logger_1.console.log(` SQLite version: ${sqliteVersion}`);
    sessionjs_logger_1.console.log(` SQLCipher version: ${sqlcipherVersion}`);
    sessionjs_logger_1.console.log(` (deprecated) schema_version: ${schemaVersion}`);
    for (let index = 0, max = SCHEMA_VERSIONS.length; index < max; index += 1) {
        const runSchemaUpdate = SCHEMA_VERSIONS[index];
        runSchemaUpdate(schemaVersion, db);
    }
    await (0, sessionMigrations_1.updateSessionSchema)(db);
}
exports.updateSchema = updateSchema;
function migrateSchemaVersion(db) {
    const userVersion = getUserVersion(db);
    if (userVersion > 0) {
        return;
    }
    const schemaVersion = getSchemaVersion(db);
    const newUserVersion = schemaVersion > 18 ? 16 : schemaVersion;
    sessionjs_logger_1.console.log('migrateSchemaVersion: Migrating from schema_version ' +
        `${schemaVersion} to user_version ${newUserVersion}`);
    setUserVersion(db, newUserVersion);
}
function getUserVersion(db) {
    try {
        return db.pragma('user_version', { simple: true });
    }
    catch (e) {
        sessionjs_logger_1.console.error('getUserVersion error', e);
        return 0;
    }
}
function setUserVersion(db, version) {
    if (!(0, lodash_1.isNumber)(version)) {
        throw new Error(`setUserVersion: version ${version} is not a number`);
    }
    db.pragma(`user_version = ${version}`);
}
function openAndMigrateDatabase(filePath, key) {
    let db;
    try {
        db = new BetterSqlite3.default(filePath, openDbOptions);
        keyDatabase(db, key);
        switchToWAL(db);
        migrateSchemaVersion(db);
        db.pragma('secure_delete = ON');
        return db;
    }
    catch (error) {
        if (db) {
            db.close();
        }
        sessionjs_logger_1.console.log('migrateDatabase: Migration without cipher change failed', error.message);
    }
    let db1;
    try {
        db1 = new BetterSqlite3.default(filePath, openDbOptions);
        keyDatabase(db1, key);
        db1.pragma('cipher_compatibility = 3');
        migrateSchemaVersion(db1);
        db1.close();
    }
    catch (error) {
        if (db1) {
            db1.close();
        }
        sessionjs_logger_1.console.log('migrateDatabase: migrateSchemaVersion failed', error);
        return null;
    }
    let db2;
    try {
        db2 = new BetterSqlite3.default(filePath, openDbOptions);
        keyDatabase(db2, key);
        db2.pragma('cipher_migrate');
        switchToWAL(db2);
        db2.pragma('foreign_keys = OFF');
        return db2;
    }
    catch (error) {
        if (db2) {
            db2.close();
        }
        sessionjs_logger_1.console.log('migrateDatabase: switchToWAL failed');
        return null;
    }
}
exports.openAndMigrateDatabase = openAndMigrateDatabase;
function getSQLiteVersion(db) {
    const { sqlite_version } = db.prepare('select sqlite_version() as sqlite_version').get();
    return sqlite_version;
}
function getSchemaVersion(db) {
    return db.pragma('schema_version', { simple: true });
}
function getSQLCipherVersion(db) {
    return db.pragma('cipher_version', { simple: true });
}
function getSQLCipherIntegrityCheck(db) {
    const rows = db.pragma('cipher_integrity_check');
    if (rows.length === 0) {
        return undefined;
    }
    return rows.map((row) => row.cipher_integrity_check);
}
exports.getSQLCipherIntegrityCheck = getSQLCipherIntegrityCheck;
function keyDatabase(db, key) {
    const deriveKey = database_utility_1.HEX_KEY.test(key);
    const value = deriveKey ? `'${key}'` : `"x'${key}'"`;
    const pragramToRun = `key = ${value}`;
    db.pragma(pragramToRun);
}
function switchToWAL(db) {
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
}
