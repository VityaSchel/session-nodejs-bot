"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSessionSchema = exports.printTableColumns = void 0;
const libsession_util_nodejs_1 = require("libsession_util_nodejs");
const lodash_1 = require("lodash");
const conversationAttributes_1 = require("../../models/conversationAttributes");
const String_1 = require("../../session/utils/String");
const sqlSharedTypes_1 = require("../../types/sqlSharedTypes");
const database_utility_1 = require("../database_utility");
const sql_1 = require("../sql");
const Promise_1 = require("../../session/utils/Promise");
const settings_key_1 = require("../../data/settings-key");
const sessionjs_logger_1 = require("../../sessionjs-logger");
const hasDebugEnvVariable = Boolean(process.env.SESSION_DEBUG);
function getSessionSchemaVersion(db) {
    const result = db
        .prepare(`
      SELECT MAX(version) as version FROM loki_schema;
      `)
        .get();
    if (!result || !result.version) {
        return 0;
    }
    return result.version;
}
function createSessionSchemaTable(db) {
    db.transaction(() => {
        db.exec(`
      CREATE TABLE loki_schema(
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        version INTEGER
      );
      INSERT INTO loki_schema (
        version
      ) values (
        0
      );
      `);
    })();
}
const LOKI_SCHEMA_VERSIONS = [
    updateToSessionSchemaVersion1,
    updateToSessionSchemaVersion2,
    updateToSessionSchemaVersion3,
    updateToSessionSchemaVersion4,
    updateToSessionSchemaVersion5,
    updateToSessionSchemaVersion6,
    updateToSessionSchemaVersion7,
    updateToSessionSchemaVersion8,
    updateToSessionSchemaVersion9,
    updateToSessionSchemaVersion10,
    updateToSessionSchemaVersion11,
    updateToSessionSchemaVersion12,
    updateToSessionSchemaVersion13,
    updateToSessionSchemaVersion14,
    updateToSessionSchemaVersion15,
    updateToSessionSchemaVersion16,
    updateToSessionSchemaVersion17,
    updateToSessionSchemaVersion18,
    updateToSessionSchemaVersion19,
    updateToSessionSchemaVersion20,
    updateToSessionSchemaVersion21,
    updateToSessionSchemaVersion22,
    updateToSessionSchemaVersion23,
    updateToSessionSchemaVersion24,
    updateToSessionSchemaVersion25,
    updateToSessionSchemaVersion26,
    updateToSessionSchemaVersion27,
    updateToSessionSchemaVersion28,
    updateToSessionSchemaVersion29,
    updateToSessionSchemaVersion30,
    updateToSessionSchemaVersion31,
    updateToSessionSchemaVersion32,
    updateToSessionSchemaVersion33,
];
function updateToSessionSchemaVersion1(currentVersion, db) {
    const targetVersion = 1;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
      ALTER TABLE ${database_utility_1.MESSAGES_TABLE}
      ADD COLUMN serverId INTEGER;

      CREATE TABLE servers(
        serverUrl STRING PRIMARY KEY ASC,
        token TEXT
      );
      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion2(currentVersion, db) {
    const targetVersion = 2;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
      CREATE TABLE pairingAuthorisations(
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        primaryDevicePubKey VARCHAR(255),
        secondaryDevicePubKey VARCHAR(255),
        isGranted BOOLEAN,
        json TEXT,
        UNIQUE(primaryDevicePubKey, secondaryDevicePubKey)
      );
      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion3(currentVersion, db) {
    const targetVersion = 3;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
      CREATE TABLE ${database_utility_1.GUARD_NODE_TABLE}(
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        ed25519PubKey VARCHAR(64)
      );
      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion4(currentVersion, db) {
    const targetVersion = 4;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
      DROP TABLE ${database_utility_1.LAST_HASHES_TABLE};
      CREATE TABLE ${database_utility_1.LAST_HASHES_TABLE}(
        id TEXT,
        snode TEXT,
        hash TEXT,
        expiresAt INTEGER,
        PRIMARY KEY (id, snode)
      );
      -- Add senderIdentity field to unprocessed needed for medium size groups
      ALTER TABLE unprocessed ADD senderIdentity TEXT;
      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion5(currentVersion, db) {
    const targetVersion = 5;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
      CREATE TABLE ${database_utility_1.NODES_FOR_PUBKEY_TABLE} (
        pubkey TEXT PRIMARY KEY,
        json TEXT
      );

      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion6(currentVersion, db) {
    const targetVersion = 6;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
      -- Remove RSS Feed conversations
      DELETE FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE
      type = 'group' AND
      id LIKE 'rss://%';

      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion7(currentVersion, db) {
    const targetVersion = 7;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
      -- Remove multi device data

      DELETE FROM pairingAuthorisations;
      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion8(currentVersion, db) {
    const targetVersion = 8;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`

      ALTER TABLE ${database_utility_1.MESSAGES_TABLE}
      ADD COLUMN serverTimestamp INTEGER;
      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion9(currentVersion, db) {
    const targetVersion = 9;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        const rows = db
            .prepare(`SELECT * FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE
        type = 'group' AND
        id LIKE '__textsecure_group__!%';
      `)
            .all();
        const conversationIdRows = db
            .prepare(`SELECT id FROM ${database_utility_1.CONVERSATIONS_TABLE} ORDER BY id ASC;`)
            .all();
        const allOldConversationIds = (0, lodash_1.map)(conversationIdRows, row => row.id);
        rows.forEach(o => {
            const oldId = o.id;
            const newId = oldId.replace('__textsecure_group__!', '');
            sessionjs_logger_1.console.log(`migrating conversation, ${oldId} to ${newId}`);
            if (allOldConversationIds.includes(newId)) {
                sessionjs_logger_1.console.log('Found a duplicate conversation after prefix removing. We need to take care of it');
                const countMessagesOld = sql_1.sqlNode.getMessagesCountByConversation(oldId, db);
                const countMessagesNew = sql_1.sqlNode.getMessagesCountByConversation(newId, db);
                sessionjs_logger_1.console.log(`countMessagesOld: ${countMessagesOld}, countMessagesNew: ${countMessagesNew}`);
                const deleteId = countMessagesOld > countMessagesNew ? newId : oldId;
                db.prepare(`DELETE FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE id = $deleteId;`).run({ deleteId });
            }
            const morphedObject = {
                ...o,
                id: newId,
            };
            db.prepare(`UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET
          id = $newId,
          json = $json
          WHERE id = $oldId;`).run({
                newId,
                json: (0, database_utility_1.objectToJSON)(morphedObject),
                oldId,
            });
        });
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion10(currentVersion, db) {
    const targetVersion = 10;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
      CREATE TABLE ${database_utility_1.CLOSED_GROUP_V2_KEY_PAIRS_TABLE} (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        groupPublicKey TEXT,
        timestamp NUMBER,
        json TEXT
      );

      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion11(currentVersion, db) {
    const targetVersion = 11;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    function remove05PrefixFromStringIfNeeded(str) {
        if (str.length === 66 && str.startsWith('05')) {
            return str.substr(2);
        }
        return str;
    }
    db.transaction(() => {
        const allClosedGroupV1Ids = db
            .prepare(`SELECT id FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE
        type = 'group' AND
        id NOT LIKE 'publicChat:%';`)
            .all()
            .map(m => m.id);
        allClosedGroupV1Ids.forEach(groupV1Id => {
            try {
                sessionjs_logger_1.console.log('Migrating closed group v1 to v2: pubkey', groupV1Id);
                const groupV1IdentityKey = sql_1.sqlNode.getIdentityKeyById(groupV1Id, db);
                if (!groupV1IdentityKey) {
                    return;
                }
                const encryptionPubKeyWithoutPrefix = remove05PrefixFromStringIfNeeded(groupV1IdentityKey.id);
                const keyPair = {
                    publicHex: encryptionPubKeyWithoutPrefix,
                    privateHex: groupV1IdentityKey.secretKey,
                };
                sql_1.sqlNode.addClosedGroupEncryptionKeyPair(groupV1Id, keyPair, db);
            }
            catch (e) {
                sessionjs_logger_1.console.error(e);
            }
        });
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion12(currentVersion, db) {
    const targetVersion = 12;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
      CREATE TABLE ${database_utility_1.OPEN_GROUP_ROOMS_V2_TABLE} (
        serverUrl TEXT NOT NULL,
        roomId TEXT NOT NULL,
        conversationId TEXT,
        json TEXT,
        PRIMARY KEY (serverUrl, roomId)
      );

      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion13(currentVersion, db) {
    const targetVersion = 13;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.pragma('secure_delete = ON');
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion14(currentVersion, db) {
    const targetVersion = 14;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
      DROP TABLE IF EXISTS servers;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS preKeys;
      DROP TABLE IF EXISTS contactPreKeys;
      DROP TABLE IF EXISTS contactSignedPreKeys;
      DROP TABLE IF EXISTS signedPreKeys;
      DROP TABLE IF EXISTS senderKeys;
      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion15(currentVersion, db) {
    const targetVersion = 15;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
        DROP TABLE pairingAuthorisations;
        DROP TRIGGER IF EXISTS messages_on_delete;
        DROP TRIGGER IF EXISTS messages_on_update;
      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion16(currentVersion, db) {
    const targetVersion = 16;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
        ALTER TABLE ${database_utility_1.MESSAGES_TABLE} ADD COLUMN serverHash TEXT;
        ALTER TABLE ${database_utility_1.MESSAGES_TABLE} ADD COLUMN isDeleted BOOLEAN;

        CREATE INDEX messages_serverHash ON ${database_utility_1.MESSAGES_TABLE} (
          serverHash
        ) WHERE serverHash IS NOT NULL;

        CREATE INDEX messages_isDeleted ON ${database_utility_1.MESSAGES_TABLE} (
          isDeleted
        ) WHERE isDeleted IS NOT NULL;

        ALTER TABLE unprocessed ADD serverHash TEXT;
        CREATE INDEX messages_messageHash ON unprocessed (
          serverHash
        ) WHERE serverHash IS NOT NULL;
      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion17(currentVersion, db) {
    const targetVersion = 17;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
        UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET
        json = json_set(json, '$.isApproved', 1)
      `);
        db.exec(`
        UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET
        json = json_remove(json, '$.moderators', '$.dataMessage', '$.accessKey', '$.profileSharing', '$.sessionRestoreSeen')
      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion18(currentVersion, db) {
    const targetVersion = 18;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        (0, database_utility_1.dropFtsAndTriggers)(db);
        (0, database_utility_1.rebuildFtsTable)(db);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion19(currentVersion, db) {
    const targetVersion = 19;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
        DROP INDEX messages_schemaVersion;
        ALTER TABLE ${database_utility_1.MESSAGES_TABLE} DROP COLUMN schemaVersion;
      `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion20(currentVersion, db) {
    const targetVersion = 20;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        const rows = db.pragma(`table_info(${database_utility_1.CONVERSATIONS_TABLE});`);
        if (rows.some((m) => m.name === 'friendRequestStatus')) {
            sessionjs_logger_1.console.info('found column friendRequestStatus. Dropping it');
            db.exec(`ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN friendRequestStatus;`);
        }
        writeSessionSchemaVersion(targetVersion, db);
    });
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion21(currentVersion, db) {
    const targetVersion = 21;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
          UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET
          json = json_set(json, '$.didApproveMe', 1, '$.isApproved', 1)
          WHERE type = 'private';
        `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion22(currentVersion, db) {
    const targetVersion = 22;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`DROP INDEX messages_duplicate_check;`);
        db.exec(`
      ALTER TABLE ${database_utility_1.MESSAGES_TABLE} DROP sourceDevice;
      `);
        db.exec(`
      ALTER TABLE unprocessed DROP sourceDevice;
      `);
        db.exec(`
      CREATE INDEX messages_duplicate_check ON ${database_utility_1.MESSAGES_TABLE} (
        source,
        sent_at
      );
      `);
        (0, database_utility_1.dropFtsAndTriggers)(db);
        db.exec(`
          UPDATE ${database_utility_1.MESSAGES_TABLE} SET
          json = json_remove(json, '$.schemaVersion', '$.recipients', '$.decrypted_at', '$.sourceDevice', '$.read_by')
        `);
        (0, database_utility_1.rebuildFtsTable)(db);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion23(currentVersion, db) {
    const targetVersion = 23;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
        ALTER TABLE ${database_utility_1.LAST_HASHES_TABLE} RENAME TO ${database_utility_1.LAST_HASHES_TABLE}_old;
        CREATE TABLE ${database_utility_1.LAST_HASHES_TABLE}(
          id TEXT,
          snode TEXT,
          hash TEXT,
          expiresAt INTEGER,
          namespace INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (id, snode, namespace)
        );`);
        db.exec(`INSERT INTO ${database_utility_1.LAST_HASHES_TABLE}(id, snode, hash, expiresAt) SELECT id, snode, hash, expiresAt FROM ${database_utility_1.LAST_HASHES_TABLE}_old;`);
        db.exec(`DROP TABLE ${database_utility_1.LAST_HASHES_TABLE}_old;`);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion24(currentVersion, db) {
    const targetVersion = 24;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.prepare(`DELETE FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE
        type = 'group' AND
        id LIKE 'publicChat:1@%';`).run();
        db.exec(`
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN zombies TEXT DEFAULT "[]";
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN left INTEGER;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN expireTimer INTEGER;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN mentionedUs INTEGER;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN unreadCount INTEGER;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN lastMessageStatus TEXT;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN lastMessage TEXT;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN lastJoinedTimestamp INTEGER;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN groupAdmins TEXT DEFAULT "[]";
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN isKickedFromGroup INTEGER;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN subscriberCount INTEGER;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN is_medium_group INTEGER;

         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN avatarPointer TEXT; -- this is the url of the avatar for that conversation
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN avatarHash TEXT; -- only used for opengroup avatar.
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN nickname TEXT;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN profileKey TEXT;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN triggerNotificationsFor TEXT DEFAULT "all";
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN isTrustedForAttachmentDownload INTEGER DEFAULT "FALSE";
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN isPinned INTEGER DEFAULT "FALSE";
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN isApproved INTEGER DEFAULT "FALSE";
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN didApproveMe INTEGER DEFAULT "FALSE";
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN avatarInProfile TEXT;
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN avatarPathInAvatar TEXT; -- this is very temporary, removed right below
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN displayNameInProfile TEXT;

         UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET
          zombies = json_extract(json, '$.zombies'),
          members = json_extract(json, '$.members'),
          left = json_extract(json, '$.left'),
          expireTimer = json_extract(json, '$.expireTimer'),
          mentionedUs = json_extract(json, '$.mentionedUs'),
          unreadCount = json_extract(json, '$.unreadCount'),
          lastMessageStatus = json_extract(json, '$.lastMessageStatus'),
          lastMessage = json_extract(json, '$.lastMessage'),
          lastJoinedTimestamp = json_extract(json, '$.lastJoinedTimestamp'),
          groupAdmins = json_extract(json, '$.groupAdmins'),
          isKickedFromGroup = json_extract(json, '$.isKickedFromGroup'),
          subscriberCount = json_extract(json, '$.subscriberCount'),
          is_medium_group = json_extract(json, '$.is_medium_group'),
          avatarPointer = json_extract(json, '$.avatarPointer'),
          avatarHash = json_extract(json, '$.avatarHash'),
          nickname = json_extract(json, '$.nickname'),
          profileKey = json_extract(json, '$.profileKey'),
          triggerNotificationsFor = json_extract(json, '$.triggerNotificationsFor'),
          isTrustedForAttachmentDownload = json_extract(json, '$.isTrustedForAttachmentDownload'),
          isPinned = json_extract(json, '$.isPinned'),
          isApproved = json_extract(json, '$.isApproved'),
          didApproveMe = json_extract(json, '$.didApproveMe'),
          avatarInProfile = json_extract(json, '$.profile.avatar'),-- profile.avatar is no longer used. We rely on avatarInProfile only (for private chats and opengroups )
          avatarPathInAvatar = json_extract(json, '$.avatar.path'),-- this is very temporary
          displayNameInProfile =  json_extract(json, '$.profile.displayName');

          UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET json = json_remove(json,
              '$.zombies',
              '$.members',
              '$.left',
              '$.expireTimer',
              '$.mentionedUs',
              '$.unreadCount',
              '$.lastMessageStatus',
              '$.lastJoinedTimestamp',
              '$.lastMessage',
              '$.groupAdmins',
              '$.isKickedFromGroup',
              '$.subscriberCount',
              '$.is_medium_group',
              '$.avatarPointer',
              '$.avatarHash',
              '$.nickname',
              '$.profileKey',
              '$.triggerNotificationsFor',
              '$.isTrustedForAttachmentDownload',
              '$.isPinned',
              '$.isApproved',
              '$.type',
              '$.version',
              '$.isMe',
              '$.didApproveMe',
              '$.active_at',
              '$.id',
              '$.moderators',
              '$.sessionRestoreSeen',
              '$.profileName',
              '$.timestamp',
              '$.profile',
              '$.name',
              '$.profileAvatar',
              '$.avatarPath
          ');

          ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN json;
          UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET displayNameInProfile = name WHERE
          type = 'group' AND
          id NOT LIKE 'publicChat:%';

          ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN profileName;
          ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN name;

          -- we want to rely on avatarInProfile only, but it can be set either in avatarInProfile or in avatarPathInAvatar.
          -- make sure to override avatarInProfile with the value from avatarPathInAvatar if avatarInProfile is unset
          UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET avatarInProfile = avatarPathInAvatar WHERE avatarInProfile IS NULL;
          ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN avatarPathInAvatar;

          CREATE INDEX conversation_nickname ON ${database_utility_1.CONVERSATIONS_TABLE} (
            nickname
          );
          CREATE INDEX conversation_displayNameInProfile ON ${database_utility_1.CONVERSATIONS_TABLE} (
            displayNameInProfile
          );

         `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion25(currentVersion, db) {
    const targetVersion = 25;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
          ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN readCapability INTEGER DEFAULT 1;
          ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN writeCapability INTEGER DEFAULT 1;
          ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN uploadCapability INTEGER DEFAULT 1;
          ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN conversationIdOrigin TEXT;
          ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN avatarHash;
          ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN avatarImageId INTEGER;

          CREATE INDEX messages_convo_serverID ON ${database_utility_1.MESSAGES_TABLE} (
            serverId,
            conversationId
          );
         `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion26(currentVersion, db) {
    const targetVersion = 26;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
         ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN groupModerators TEXT DEFAULT "[]"; -- those are for sogs only (for closed groups we only need the groupAdmins)
         `);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion27(currentVersion, db) {
    const targetVersion = 27;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    const domainNameToUse = 'open.getsession.org';
    const urlToUse = `https://${domainNameToUse}`;
    const ipToRemove = '116.203.70.33';
    function getNewConvoId(oldConvoId) {
        if (!oldConvoId) {
            return null;
        }
        return oldConvoId
            ?.replace(`https://${ipToRemove}`, urlToUse)
            ?.replace(`http://${ipToRemove}`, urlToUse)
            ?.replace(ipToRemove, urlToUse);
    }
    function getAllOpenGroupV2Conversations(instance) {
        const rows = instance
            .prepare(`SELECT * FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE
        type = 'group' AND
        id LIKE 'publicChat:__%@%'
       ORDER BY id ASC;`)
            .all();
        return rows || [];
    }
    function getRoomIdFromConversationAttributes(attributes) {
        if (!attributes) {
            return null;
        }
        const indexSemiColon = attributes.id.indexOf(':');
        const indexAt = attributes.id.indexOf('@');
        if (indexSemiColon < 0 || indexAt < 0 || indexSemiColon >= indexAt) {
            return null;
        }
        const roomId = attributes.id.substring(indexSemiColon, indexAt);
        if (roomId.length <= 0) {
            return null;
        }
        return roomId;
    }
    db.transaction(() => {
        const rows = db.pragma(`table_info(${database_utility_1.CONVERSATIONS_TABLE});`);
        if (rows.some((m) => m.name === 'friendRequestStatus')) {
            sessionjs_logger_1.console.info('found column friendRequestStatus. Dropping it');
            db.exec(`ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN friendRequestStatus;`);
        }
        const allSessionV2RoomsIp = sql_1.sqlNode
            .getAllV2OpenGroupRooms(db)
            .filter(m => m.serverUrl.includes(ipToRemove));
        const allSessionV2RoomsDns = sql_1.sqlNode
            .getAllV2OpenGroupRooms(db)
            .filter(m => m.serverUrl.includes(domainNameToUse));
        const duplicatesRoomsIpAndDns = allSessionV2RoomsIp.filter(ip => allSessionV2RoomsDns.some(dns => dns.roomId === ip.roomId));
        const withIpButNotDuplicateRoom = allSessionV2RoomsIp.filter(ip => {
            return !duplicatesRoomsIpAndDns.some(dns => dns.roomId === ip.roomId);
        });
        sessionjs_logger_1.console.info('allSessionV2RoomsIp', allSessionV2RoomsIp.map(m => (0, lodash_1.pick)(m, ['serverUrl', 'roomId'])));
        sessionjs_logger_1.console.info('allSessionV2RoomsDns', allSessionV2RoomsDns.map(m => (0, lodash_1.pick)(m, ['serverUrl', 'roomId'])));
        sessionjs_logger_1.console.info('duplicatesRoomsIpAndDns', duplicatesRoomsIpAndDns.map(m => (0, lodash_1.pick)(m, ['serverUrl', 'roomId'])));
        sessionjs_logger_1.console.info('withIpButNotDuplicateRoom', withIpButNotDuplicateRoom.map(m => (0, lodash_1.pick)(m, ['serverUrl', 'roomId'])));
        sessionjs_logger_1.console.info('========> before room update:', sql_1.sqlNode
            .getAllV2OpenGroupRooms(db)
            .filter(m => m.serverUrl.includes(domainNameToUse) || m.serverUrl.includes(ipToRemove))
            .map(m => (0, lodash_1.pick)(m, ['conversationId', 'serverUrl', 'roomId'])));
        db.exec(`DELETE FROM ${database_utility_1.OPEN_GROUP_ROOMS_V2_TABLE} WHERE serverUrl LIKE '%${ipToRemove}%';`);
        withIpButNotDuplicateRoom.forEach(r => {
            const newConvoId = getNewConvoId(r.conversationId);
            if (!newConvoId) {
                return;
            }
            sessionjs_logger_1.console.info(`withIpButNotDuplicateRoom: renaming room old:${r.conversationId} with saveV2OpenGroupRoom() new- conversationId:${newConvoId}: serverUrl:${urlToUse}`);
            sql_1.sqlNode.saveV2OpenGroupRoom({
                ...r,
                serverUrl: urlToUse,
                conversationId: newConvoId,
            }, db);
        });
        sessionjs_logger_1.console.info('<======== after room update:', sql_1.sqlNode
            .getAllV2OpenGroupRooms(db)
            .filter(m => m.serverUrl.includes(domainNameToUse) || m.serverUrl.includes(ipToRemove))
            .map(m => (0, lodash_1.pick)(m, ['conversationId', 'serverUrl', 'roomId'])));
        const allSessionV2ConvosIp = (0, lodash_1.compact)(getAllOpenGroupV2Conversations(db).filter(m => m?.id.includes(ipToRemove)));
        const allSessionV2ConvosDns = (0, lodash_1.compact)(getAllOpenGroupV2Conversations(db).filter(m => m?.id.includes(domainNameToUse)));
        const withIpButNotDuplicateConvo = allSessionV2ConvosIp.filter(ip => {
            const roomId = getRoomIdFromConversationAttributes(ip);
            if (!roomId) {
                return false;
            }
            return !allSessionV2ConvosDns.some(dns => {
                return getRoomIdFromConversationAttributes(dns) === roomId;
            });
        });
        db.exec(`DELETE FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE id LIKE '%${ipToRemove}%';`);
        const convoIdsToMigrateFromIpToDns = new Map();
        withIpButNotDuplicateConvo.forEach(r => {
            if (!r) {
                return;
            }
            const newConvoId = getNewConvoId(r.id);
            if (!newConvoId) {
                return;
            }
            sessionjs_logger_1.console.info(`withIpButNotDuplicateConvo: renaming convo old:${r.id} with saveConversation() new- conversationId:${newConvoId}`);
            convoIdsToMigrateFromIpToDns.set(r.id, newConvoId);
        });
        (0, database_utility_1.dropFtsAndTriggers)(db);
        sessionjs_logger_1.console.info('convoIdsToMigrateFromIpToDns', [...convoIdsToMigrateFromIpToDns.entries()]);
        [...convoIdsToMigrateFromIpToDns.keys()].forEach(oldConvoId => {
            const newConvoId = convoIdsToMigrateFromIpToDns.get(oldConvoId);
            if (!newConvoId) {
                return;
            }
            sessionjs_logger_1.console.info(`About to migrate messages of ${oldConvoId} to ${newConvoId}`);
            db.prepare(`UPDATE ${database_utility_1.MESSAGES_TABLE} SET
          conversationId = $newConvoId,
          json = json_set(json,'$.conversationId', $newConvoId)
          WHERE conversationId = $oldConvoId;`).run({ oldConvoId, newConvoId });
        });
        sessionjs_logger_1.console.log('Count of messages to be migrated: ', db
            .prepare(`SELECT COUNT(*) FROM ${database_utility_1.MESSAGES_TABLE} WHERE conversationId LIKE '%${ipToRemove}%';`)
            .get());
        const messageWithIdsToUpdate = db
            .prepare(`SELECT DISTINCT conversationId FROM ${database_utility_1.MESSAGES_TABLE} WHERE conversationID LIKE '%${ipToRemove}%'`)
            .all();
        sessionjs_logger_1.console.info('messageWithConversationIdsToUpdate', messageWithIdsToUpdate);
        messageWithIdsToUpdate.forEach(oldConvo => {
            const newConvoId = getNewConvoId(oldConvo.conversationId);
            if (!newConvoId) {
                return;
            }
            sessionjs_logger_1.console.info('oldConvo.conversationId', oldConvo.conversationId, newConvoId);
            db.prepare(`UPDATE ${database_utility_1.MESSAGES_TABLE} SET
          conversationId = $newConvoId,
          json = json_set(json,'$.conversationId', $newConvoId)
          WHERE conversationId = $oldConvoId;`).run({ oldConvoId: oldConvo.conversationId, newConvoId });
        });
        (0, database_utility_1.rebuildFtsTable)(db);
        sessionjs_logger_1.console.info('removing lastMessageDeletedServerID & lastMessageFetchedServerID from rooms table');
        db.exec(`UPDATE ${database_utility_1.OPEN_GROUP_ROOMS_V2_TABLE} SET
        json = json_remove(json, '$.lastMessageDeletedServerID', '$.lastMessageFetchedServerID', '$.token' );`);
        sessionjs_logger_1.console.info('removing lastMessageDeletedServerID & lastMessageFetchedServerID from rooms table. done');
        writeSessionSchemaVersion(targetVersion, db);
        sessionjs_logger_1.console.log('... done');
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion28(currentVersion, db) {
    const targetVersion = 28;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function updateToSessionSchemaVersion29(currentVersion, db) {
    const targetVersion = 29;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        (0, database_utility_1.dropFtsAndTriggers)(db);
        db.exec(`CREATE INDEX messages_unread_by_conversation ON ${database_utility_1.MESSAGES_TABLE} (
      unread,
      conversationId
    );`);
        (0, database_utility_1.rebuildFtsTable)(db);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function insertContactIntoContactWrapper(contact, blockedNumbers, contactsConfigWrapper, volatileConfigWrapper, db) {
    if (contactsConfigWrapper !== null) {
        const dbApproved = !!contact.isApproved || false;
        const dbApprovedMe = !!contact.didApproveMe || false;
        const dbBlocked = blockedNumbers.includes(contact.id);
        const priority = contact.priority || conversationAttributes_1.CONVERSATION_PRIORITIES.default;
        const wrapperContact = (0, sqlSharedTypes_1.getContactInfoFromDBValues)({
            id: contact.id,
            dbApproved,
            dbApprovedMe,
            dbBlocked,
            dbName: contact.displayNameInProfile || undefined,
            dbNickname: contact.nickname || undefined,
            dbProfileKey: contact.profileKey || undefined,
            dbProfileUrl: contact.avatarPointer || undefined,
            priority,
            dbCreatedAtSeconds: Math.floor((contact.active_at || Date.now()) / 1000),
        });
        try {
            hasDebugEnvVariable && sessionjs_logger_1.console.info('Inserting contact into wrapper: ', wrapperContact);
            contactsConfigWrapper.set(wrapperContact);
        }
        catch (e) {
            sessionjs_logger_1.console.error(`contactsConfigWrapper.set during migration failed with ${e.message} for id: ${contact.id}`);
            try {
                hasDebugEnvVariable && sessionjs_logger_1.console.info('Inserting edited contact into wrapper: ', contact.id);
                contactsConfigWrapper.set((0, sqlSharedTypes_1.getContactInfoFromDBValues)({
                    id: contact.id,
                    dbApproved,
                    dbApprovedMe,
                    dbBlocked,
                    dbName: undefined,
                    dbNickname: undefined,
                    dbProfileKey: undefined,
                    dbProfileUrl: undefined,
                    priority: conversationAttributes_1.CONVERSATION_PRIORITIES.default,
                    dbCreatedAtSeconds: Math.floor(Date.now() / 1000),
                }));
            }
            catch (err2) {
                sessionjs_logger_1.console.error(`contactsConfigWrapper.set during migration failed with ${err2.message} for id: ${contact.id}. Skipping contact entirely`);
            }
        }
    }
    try {
        const rows = db
            .prepare(`
      SELECT MAX(COALESCE(sent_at, 0)) AS max_sent_at
      FROM ${database_utility_1.MESSAGES_TABLE} WHERE
        conversationId = $conversationId AND
        unread = $unread;
    `)
            .get({
            conversationId: contact.id,
            unread: (0, database_utility_1.toSqliteBoolean)(false),
        });
        const maxRead = rows?.max_sent_at;
        const lastRead = (0, lodash_1.isNumber)(maxRead) && (0, lodash_1.isFinite)(maxRead) ? maxRead : 0;
        hasDebugEnvVariable &&
            sessionjs_logger_1.console.info(`Inserting contact into volatile wrapper maxread: ${contact.id} :${lastRead}`);
        volatileConfigWrapper.set1o1(contact.id, lastRead, false);
    }
    catch (e) {
        sessionjs_logger_1.console.error(`volatileConfigWrapper.set1o1 during migration failed with ${e.message} for id: ${contact.id}. skipping`);
    }
}
function insertCommunityIntoWrapper(community, userGroupConfigWrapper, volatileConfigWrapper, db) {
    const priority = community.priority;
    const convoId = community.id;
    const roomDetails = sql_1.sqlNode.getV2OpenGroupRoom(convoId, db);
    if (!roomDetails ||
        (0, lodash_1.isEmpty)(roomDetails) ||
        (0, lodash_1.isEmpty)(roomDetails.serverUrl) ||
        (0, lodash_1.isEmpty)(roomDetails.roomId) ||
        (0, lodash_1.isEmpty)(roomDetails.serverPublicKey)) {
        sessionjs_logger_1.console.info('insertCommunityIntoWrapper did not find corresponding room details', convoId, roomDetails);
        return;
    }
    hasDebugEnvVariable ??
        sessionjs_logger_1.console.info(`building fullUrl from serverUrl:"${roomDetails.serverUrl}" roomId:"${roomDetails.roomId}" pubkey:"${roomDetails.serverPublicKey}"`);
    const fullUrl = userGroupConfigWrapper.buildFullUrlFromDetails(roomDetails.serverUrl, roomDetails.roomId, roomDetails.serverPublicKey);
    const wrapperComm = (0, sqlSharedTypes_1.getCommunityInfoFromDBValues)({
        fullUrl,
        priority,
    });
    try {
        hasDebugEnvVariable && sessionjs_logger_1.console.info('Inserting community into group wrapper: ', wrapperComm);
        userGroupConfigWrapper.setCommunityByFullUrl(wrapperComm.fullUrl, wrapperComm.priority);
        const rows = db
            .prepare(`
      SELECT MAX(COALESCE(serverTimestamp, 0)) AS max_sent_at
      FROM ${database_utility_1.MESSAGES_TABLE} WHERE
        conversationId = $conversationId AND
        unread = $unread;
    `)
            .get({
            conversationId: convoId,
            unread: (0, database_utility_1.toSqliteBoolean)(false),
        });
        const maxRead = rows?.max_sent_at;
        const lastRead = (0, lodash_1.isNumber)(maxRead) && (0, lodash_1.isFinite)(maxRead) ? maxRead : 0;
        hasDebugEnvVariable &&
            sessionjs_logger_1.console.info(`Inserting community into volatile wrapper: ${wrapperComm.fullUrl} :${lastRead}`);
        volatileConfigWrapper.setCommunityByFullUrl(wrapperComm.fullUrl, lastRead, false);
    }
    catch (e) {
        sessionjs_logger_1.console.error(`userGroupConfigWrapper.set during migration failed with ${e.message} for fullUrl: "${wrapperComm.fullUrl}". Skipping community entirely`);
    }
}
function insertLegacyGroupIntoWrapper(legacyGroup, userGroupConfigWrapper, volatileInfoConfigWrapper, db) {
    const { priority, id, groupAdmins, members, displayNameInProfile, lastJoinedTimestamp, } = legacyGroup;
    const latestEncryptionKeyPairHex = sql_1.sqlNode.getLatestClosedGroupEncryptionKeyPair(legacyGroup.id, db);
    const wrapperLegacyGroup = (0, sqlSharedTypes_1.getLegacyGroupInfoFromDBValues)({
        id,
        priority,
        groupAdmins,
        members,
        displayNameInProfile,
        encPubkeyHex: latestEncryptionKeyPairHex?.publicHex || '',
        encSeckeyHex: latestEncryptionKeyPairHex?.privateHex || '',
        lastJoinedTimestamp,
    });
    try {
        hasDebugEnvVariable &&
            sessionjs_logger_1.console.info('Inserting legacy group into wrapper: ', wrapperLegacyGroup);
        userGroupConfigWrapper.setLegacyGroup(wrapperLegacyGroup);
        const rows = db
            .prepare(`
      SELECT MAX(COALESCE(sent_at, 0)) AS max_sent_at
      FROM ${database_utility_1.MESSAGES_TABLE} WHERE
        conversationId = $conversationId AND
        unread = $unread;
    `)
            .get({
            conversationId: id,
            unread: (0, database_utility_1.toSqliteBoolean)(false),
        });
        const maxRead = rows?.max_sent_at;
        const lastRead = (0, lodash_1.isNumber)(maxRead) && (0, lodash_1.isFinite)(maxRead) ? maxRead : 0;
        hasDebugEnvVariable &&
            sessionjs_logger_1.console.info(`Inserting legacy group into volatile wrapper maxread: ${id} :${lastRead}`);
        volatileInfoConfigWrapper.setLegacyGroup(id, lastRead, false);
    }
    catch (e) {
        sessionjs_logger_1.console.error(`userGroupConfigWrapper.set during migration failed with ${e.message} for legacyGroup.id: "${legacyGroup.id}". Skipping that legacy group entirely`);
    }
}
function getBlockedNumbersDuringMigration(db) {
    try {
        const blockedItem = sql_1.sqlNode.getItemById('blocked', db);
        if (!blockedItem) {
            return [];
        }
        const foundBlocked = blockedItem?.value;
        hasDebugEnvVariable && sessionjs_logger_1.console.info('foundBlockedNumbers during migration', foundBlocked);
        if ((0, lodash_1.isArray)(foundBlocked)) {
            return foundBlocked;
        }
        return [];
    }
    catch (e) {
        sessionjs_logger_1.console.info('failed to read blocked numbers. Considering no blocked numbers', e.stack);
        return [];
    }
}
function updateToSessionSchemaVersion30(currentVersion, db) {
    const targetVersion = 30;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`
      ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN readCapability; -- stored in a redux slice now
      ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN writeCapability; -- stored in a redux slice now
      ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN uploadCapability; -- stored in a redux slice now
      ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN subscriberCount; -- stored in a redux slice now
      ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN groupModerators; -- stored in a redux slice now

      ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} RENAME COLUMN isPinned TO priority; -- isPinned was 0 for false and 1 for true, which matches our way of handling the priority
      ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} DROP COLUMN is_medium_group; -- a medium group starts with 05 and has a type of group. We cache everything renderer side so there is no need for that field
      `);
        db.exec(`
      ALTER TABLE unprocessed DROP COLUMN serverTimestamp;
      `);
        db.exec(`ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN markedAsUnread BOOLEAN;`);
        db.prepare(`UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET
            active_at = 0
            WHERE type = 'private' AND active_at > 0 AND active_at < ${1000 * 1651363200};`).run({});
        db.prepare(`UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET
        priority = ${conversationAttributes_1.CONVERSATION_PRIORITIES.hidden}
        WHERE type = 'private' AND (active_at IS NULL OR active_at = 0 );`).run({});
        db.exec(`CREATE TABLE ${sqlSharedTypes_1.CONFIG_DUMP_TABLE}(
          variant TEXT NOT NULL,
          publicKey TEXT NOT NULL,
          data BLOB,
          PRIMARY KEY (publicKey, variant)
          );
          `);
        const allOpengroupsConvo = db
            .prepare(`SELECT id FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE
      type = 'group' AND
      id LIKE 'publicChat:%'
     ORDER BY id ASC;`)
            .all();
        const allValidOpengroupsDetails = allOpengroupsConvo
            .filter(m => (0, lodash_1.isString)(m.id) && m.id.indexOf('@') > 0)
            .map(row => {
            const roomNameStart = row.id.indexOf(':') + 1;
            const roomNameEnd = row.id.indexOf('@');
            const roomName = row.id.substring(roomNameStart, roomNameEnd);
            const baseUrl = row.id.substring(roomNameEnd + 1);
            return { roomName, baseUrl, oldConvoId: row.id };
        });
        allValidOpengroupsDetails.forEach(convoDetails => {
            const newId = `${convoDetails.baseUrl}/${convoDetails.roomName}`;
            db.prepare(`UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET
          id = $newId
          WHERE id = $oldId;`).run({
                newId,
                oldId: convoDetails.oldConvoId,
            });
            db.prepare(`UPDATE ${database_utility_1.MESSAGES_TABLE} SET
          conversationId = $newId,
          json = json_set(json,'$.conversationId', $newId)
          WHERE conversationId = $oldConvoId;`).run({ oldConvoId: convoDetails.oldConvoId, newId });
            db.prepare(`UPDATE ${database_utility_1.OPEN_GROUP_ROOMS_V2_TABLE} SET
          conversationId = $newId,
          json = json_set(json, '$.conversationId', $newId)
          WHERE conversationId = $oldConvoId;`).run({ newId, oldConvoId: convoDetails.oldConvoId });
        });
        db.prepare(`UPDATE ${database_utility_1.CONVERSATIONS_TABLE} SET
        priority = ${conversationAttributes_1.CONVERSATION_PRIORITIES.default}
        WHERE priority IS NULL;`).run({});
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function getLoggedInUserConvoDuringMigration(db) {
    const ourKeys = (0, sql_1.getIdentityKeys)(db);
    if (!ourKeys || !ourKeys.publicKeyHex || !ourKeys.privateEd25519) {
        return null;
    }
    const ourConversation = db.prepare(`SELECT * FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE id = $id;`).get({
        id: ourKeys.publicKeyHex,
    });
    return { ourKeys, ourConversation: ourConversation || null };
}
function updateToSessionSchemaVersion31(currentVersion, db) {
    const targetVersion = 31;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        try {
            const loggedInUser = getLoggedInUserConvoDuringMigration(db);
            if (!loggedInUser || !loggedInUser.ourKeys) {
                throw new Error('privateEd25519 was empty. Considering no users are logged in');
            }
            const blockedNumbers = getBlockedNumbersDuringMigration(db);
            const { privateEd25519, publicKeyHex } = loggedInUser.ourKeys;
            const userProfileWrapper = new libsession_util_nodejs_1.UserConfigWrapperNode(privateEd25519, null);
            const contactsConfigWrapper = new libsession_util_nodejs_1.ContactsConfigWrapperNode(privateEd25519, null);
            const userGroupsConfigWrapper = new libsession_util_nodejs_1.UserGroupsWrapperNode(privateEd25519, null);
            const volatileInfoConfigWrapper = new libsession_util_nodejs_1.ConvoInfoVolatileWrapperNode(privateEd25519, null);
            const { ourConversation } = loggedInUser;
            if (!ourConversation) {
                throw new Error('Failed to find our logged in conversation while migrating');
            }
            const ourDbName = ourConversation.displayNameInProfile || '';
            const ourDbProfileUrl = ourConversation.avatarPointer || '';
            const ourDbProfileKey = (0, String_1.fromHexToArray)(ourConversation.profileKey || '');
            const ourConvoPriority = ourConversation.priority;
            if (ourDbProfileUrl && !(0, lodash_1.isEmpty)(ourDbProfileKey)) {
                userProfileWrapper.setUserInfo(ourDbName, ourConvoPriority, {
                    url: ourDbProfileUrl,
                    key: ourDbProfileKey,
                });
            }
            insertContactIntoContactWrapper(ourConversation, blockedNumbers, null, volatileInfoConfigWrapper, db);
            const userDump = userProfileWrapper.dump();
            db.prepare(`INSERT OR REPLACE INTO ${sqlSharedTypes_1.CONFIG_DUMP_TABLE} (
              publicKey,
              variant,
              data
          ) values (
            $publicKey,
            $variant,
            $data
          );`).run({
                publicKey: publicKeyHex,
                variant: 'UserConfig',
                data: userDump,
            });
            const contactsToWriteInWrapper = db
                .prepare(`SELECT * FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE type = 'private' AND active_at > 0 AND priority <> ${conversationAttributes_1.CONVERSATION_PRIORITIES.hidden} AND (didApproveMe OR isApproved) AND id <> '$us' AND id NOT LIKE '15%' AND id NOT LIKE '25%' ;`)
                .all({
                us: publicKeyHex,
            });
            if ((0, lodash_1.isArray)(contactsToWriteInWrapper) && contactsToWriteInWrapper.length) {
                sessionjs_logger_1.console.info(`===================== Starting contact inserting into wrapper ${contactsToWriteInWrapper?.length} =======================`);
                contactsToWriteInWrapper.forEach(contact => {
                    insertContactIntoContactWrapper(contact, blockedNumbers, contactsConfigWrapper, volatileInfoConfigWrapper, db);
                });
                sessionjs_logger_1.console.info('===================== Done with contact inserting =======================');
            }
            const contactsDump = contactsConfigWrapper.dump();
            db.prepare(`INSERT OR REPLACE INTO ${sqlSharedTypes_1.CONFIG_DUMP_TABLE} (
              publicKey,
              variant,
              data
          ) values (
            $publicKey,
            $variant,
            $data
          );`).run({
                publicKey: publicKeyHex,
                variant: 'ContactsConfig',
                data: contactsDump,
            });
            const communitiesToWriteInWrapper = db
                .prepare(`SELECT * FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE type = 'group' AND active_at > 0 AND id LIKE 'http%' ;`)
                .all({});
            if ((0, lodash_1.isArray)(communitiesToWriteInWrapper) && communitiesToWriteInWrapper.length) {
                sessionjs_logger_1.console.info(`===================== Starting communities inserting into wrapper ${communitiesToWriteInWrapper?.length} =======================`);
                communitiesToWriteInWrapper.forEach(community => {
                    try {
                        insertCommunityIntoWrapper(community, userGroupsConfigWrapper, volatileInfoConfigWrapper, db);
                    }
                    catch (e) {
                        sessionjs_logger_1.console.info(`failed to insert community with ${e.message}`, community);
                    }
                });
                sessionjs_logger_1.console.info('===================== Done with communinities inserting =======================');
            }
            const legacyGroupsToWriteInWrapper = db
                .prepare(`SELECT * FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE type = 'group' AND active_at > 0 AND id LIKE '05%' AND NOT isKickedFromGroup AND NOT left ;`)
                .all({});
            if ((0, lodash_1.isArray)(legacyGroupsToWriteInWrapper) && legacyGroupsToWriteInWrapper.length) {
                sessionjs_logger_1.console.info(`===================== Starting legacy group inserting into wrapper length: ${legacyGroupsToWriteInWrapper?.length} =======================`);
                legacyGroupsToWriteInWrapper.forEach(legacyGroup => {
                    try {
                        hasDebugEnvVariable &&
                            sessionjs_logger_1.console.info('Writing legacy group: ', JSON.stringify(legacyGroup));
                        insertLegacyGroupIntoWrapper(legacyGroup, userGroupsConfigWrapper, volatileInfoConfigWrapper, db);
                    }
                    catch (e) {
                        sessionjs_logger_1.console.info(`failed to insert legacy group with ${e.message}`, legacyGroup);
                    }
                });
                sessionjs_logger_1.console.info('===================== Done with legacy group inserting =======================');
            }
            const userGroupsDump = userGroupsConfigWrapper.dump();
            db.prepare(`INSERT OR REPLACE INTO ${sqlSharedTypes_1.CONFIG_DUMP_TABLE} (
              publicKey,
              variant,
              data
          ) values (
            $publicKey,
            $variant,
            $data
          );`).run({
                publicKey: publicKeyHex,
                variant: 'UserGroupsConfig',
                data: userGroupsDump,
            });
            const convoVolatileDump = volatileInfoConfigWrapper.dump();
            db.prepare(`INSERT OR REPLACE INTO ${sqlSharedTypes_1.CONFIG_DUMP_TABLE} (
              publicKey,
              variant,
              data
          ) values (
            $publicKey,
            $variant,
            $data
          );`).run({
                publicKey: publicKeyHex,
                variant: 'ConvoInfoVolatileConfig',
                data: convoVolatileDump,
            });
        }
        catch (e) {
            sessionjs_logger_1.console.error(`failed to create initial wrapper. Might just not have a logged in user yet? `, e.message, e.stack, e);
        }
        writeSessionSchemaVersion(targetVersion, db);
    })();
}
function updateToSessionSchemaVersion32(currentVersion, db) {
    const targetVersion = 32;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`CREATE INDEX messages_conversationId ON ${database_utility_1.MESSAGES_TABLE} (
      conversationId
    );`);
        (0, database_utility_1.dropFtsAndTriggers)(db);
        (0, database_utility_1.rebuildFtsTable)(db);
        writeSessionSchemaVersion(targetVersion, db);
    })();
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}
function fetchUserConfigDump(db, userPubkeyhex) {
    const userConfigWrapperDumps = db
        .prepare(`SELECT * FROM ${sqlSharedTypes_1.CONFIG_DUMP_TABLE} WHERE variant = $variant AND publicKey = $publicKey;`)
        .all({ variant: 'UserConfig', publicKey: userPubkeyhex });
    if (!userConfigWrapperDumps || !userConfigWrapperDumps.length) {
        return null;
    }
    return userConfigWrapperDumps[0];
}
function writeUserConfigDump(db, userPubkeyhex, dump) {
    db.prepare(`INSERT OR REPLACE INTO ${sqlSharedTypes_1.CONFIG_DUMP_TABLE} (
            publicKey,
            variant,
            data
        ) values (
          $publicKey,
          $variant,
          $data
        );`).run({
        publicKey: userPubkeyhex,
        variant: 'UserConfig',
        data: dump,
    });
}
function updateToSessionSchemaVersion33(currentVersion, db) {
    const targetVersion = 33;
    if (currentVersion >= targetVersion) {
        return;
    }
    sessionjs_logger_1.console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
    db.transaction(() => {
        db.exec(`ALTER TABLE ${database_utility_1.CONVERSATIONS_TABLE} ADD COLUMN blocksSogsMsgReqsTimestamp INTEGER;`);
        const loggedInUser = getLoggedInUserConvoDuringMigration(db);
        if (!loggedInUser?.ourKeys) {
            writeSessionSchemaVersion(targetVersion, db);
            return;
        }
        const { privateEd25519, publicKeyHex } = loggedInUser.ourKeys;
        const userConfigWrapperDump = fetchUserConfigDump(db, publicKeyHex);
        if (!userConfigWrapperDump) {
            writeSessionSchemaVersion(targetVersion, db);
            return;
        }
        const userConfigData = userConfigWrapperDump.data;
        const userProfileWrapper = new libsession_util_nodejs_1.UserConfigWrapperNode(privateEd25519, userConfigData);
        let blindedReqEnabled = userProfileWrapper.getEnableBlindedMsgRequest();
        if ((0, lodash_1.isNil)(blindedReqEnabled)) {
            userProfileWrapper.setEnableBlindedMsgRequest(true);
            writeUserConfigDump(db, publicKeyHex, userProfileWrapper.dump());
        }
        blindedReqEnabled = userProfileWrapper.getEnableBlindedMsgRequest();
        sql_1.sqlNode.createOrUpdateItem({ id: settings_key_1.SettingsKey.hasBlindedMsgRequestsEnabled, value: blindedReqEnabled }, db);
        writeSessionSchemaVersion(targetVersion, db);
    })();
}
function printTableColumns(table, db) {
    sessionjs_logger_1.console.info(db.pragma(`table_info('${table}');`));
}
exports.printTableColumns = printTableColumns;
function writeSessionSchemaVersion(newVersion, db) {
    db.prepare(`INSERT INTO loki_schema(
        version
      ) values (
        $newVersion
      )`).run({ newVersion });
}
async function updateSessionSchema(db) {
    const result = db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name='loki_schema';`)
        .get();
    if (!result) {
        createSessionSchemaTable(db);
    }
    const lokiSchemaVersion = getSessionSchemaVersion(db);
    sessionjs_logger_1.console.log('updateSessionSchema:', `Current loki schema version: ${lokiSchemaVersion};`, `Most recent schema version: ${LOKI_SCHEMA_VERSIONS.length};`);
    for (let index = 0, max = LOKI_SCHEMA_VERSIONS.length; index < max; index += 1) {
        const runSchemaUpdate = LOKI_SCHEMA_VERSIONS[index];
        runSchemaUpdate(lokiSchemaVersion, db);
        if (index > lokiSchemaVersion && index - lokiSchemaVersion <= 3) {
            await (0, Promise_1.sleepFor)(200);
        }
    }
}
exports.updateSessionSchema = updateSessionSchema;
