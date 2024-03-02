/* eslint-disable no-unused-expressions */
import * as BetterSqlite3 from '@signalapp/better-sqlite3';
import {
  ContactsConfigWrapperNode,
  ConvoInfoVolatileWrapperNode,
  UserConfigWrapperNode,
  UserGroupsWrapperNode,
} from 'libsession_util_nodejs';
import { compact, isArray, isEmpty, isFinite, isNil, isNumber, isString, map, pick } from 'lodash';
import {
  CONVERSATION_PRIORITIES,
  ConversationAttributes,
} from '../../models/conversationAttributes';
import { HexKeyPair } from '../../receiver/keypairs';
import { fromHexToArray } from '../../session/utils/String';
import {
  CONFIG_DUMP_TABLE,
  ConfigDumpRow,
  getCommunityInfoFromDBValues,
  getContactInfoFromDBValues,
  getLegacyGroupInfoFromDBValues,
} from '../../types/sqlSharedTypes';
import {
  CLOSED_GROUP_V2_KEY_PAIRS_TABLE,
  CONVERSATIONS_TABLE,
  GUARD_NODE_TABLE,
  LAST_HASHES_TABLE,
  MESSAGES_TABLE,
  NODES_FOR_PUBKEY_TABLE,
  OPEN_GROUP_ROOMS_V2_TABLE,
  dropFtsAndTriggers,
  objectToJSON,
  rebuildFtsTable,
  toSqliteBoolean,
} from '../database_utility';

import { getIdentityKeys, sqlNode } from '../sql';
import { sleepFor } from '../../session/utils/Promise';
import { SettingsKey } from '../../data/settings-key';
import { console } from '../../sessionjs-logger';

const hasDebugEnvVariable = Boolean(process.env.SESSION_DEBUG);

// eslint:disable: quotemark one-variable-per-declaration no-unused-expression

function getSessionSchemaVersion(db: BetterSqlite3.Database) {
  const result = db
    .prepare(
      `
      SELECT MAX(version) as version FROM loki_schema;
      `
    )
    .get();
  if (!result || !result.version) {
    return 0;
  }
  return result.version;
}

function createSessionSchemaTable(db: BetterSqlite3.Database) {
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

function updateToSessionSchemaVersion1(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 1;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
  db.transaction(() => {
    db.exec(`
      ALTER TABLE ${MESSAGES_TABLE}
      ADD COLUMN serverId INTEGER;

      CREATE TABLE servers(
        serverUrl STRING PRIMARY KEY ASC,
        token TEXT
      );
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion2(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 2;

  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

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
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion3(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 3;

  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      CREATE TABLE ${GUARD_NODE_TABLE}(
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        ed25519PubKey VARCHAR(64)
      );
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion4(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 4;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      DROP TABLE ${LAST_HASHES_TABLE};
      CREATE TABLE ${LAST_HASHES_TABLE}(
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
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion5(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 5;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      CREATE TABLE ${NODES_FOR_PUBKEY_TABLE} (
        pubkey TEXT PRIMARY KEY,
        json TEXT
      );

      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion6(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 6;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      -- Remove RSS Feed conversations
      DELETE FROM ${CONVERSATIONS_TABLE} WHERE
      type = 'group' AND
      id LIKE 'rss://%';

      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion7(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 7;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      -- Remove multi device data

      DELETE FROM pairingAuthorisations;
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion8(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 8;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`

      ALTER TABLE ${MESSAGES_TABLE}
      ADD COLUMN serverTimestamp INTEGER;
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion9(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 9;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
  db.transaction(() => {
    const rows = db
      .prepare(
        `SELECT * FROM ${CONVERSATIONS_TABLE} WHERE
        type = 'group' AND
        id LIKE '__textsecure_group__!%';
      `
      )
      .all();

    const conversationIdRows = db
      .prepare(`SELECT id FROM ${CONVERSATIONS_TABLE} ORDER BY id ASC;`)
      .all();

    const allOldConversationIds = map(conversationIdRows, row => row.id);
    rows.forEach(o => {
      const oldId = o.id;
      const newId = oldId.replace('__textsecure_group__!', '');
      console.log(`migrating conversation, ${oldId} to ${newId}`);

      if (allOldConversationIds.includes(newId)) {
        console.log(
          'Found a duplicate conversation after prefix removing. We need to take care of it'
        );
        // We have another conversation with the same future name.
        // We decided to keep only the conversation with the higher number of messages
        const countMessagesOld = sqlNode.getMessagesCountByConversation(oldId, db);
        const countMessagesNew = sqlNode.getMessagesCountByConversation(newId, db);

        console.log(`countMessagesOld: ${countMessagesOld}, countMessagesNew: ${countMessagesNew}`);

        const deleteId = countMessagesOld > countMessagesNew ? newId : oldId;
        db.prepare(`DELETE FROM ${CONVERSATIONS_TABLE} WHERE id = $deleteId;`).run({ deleteId });
      }

      const morphedObject = {
        ...o,
        id: newId,
      };

      db.prepare(
        `UPDATE ${CONVERSATIONS_TABLE} SET
          id = $newId,
          json = $json
          WHERE id = $oldId;`
      ).run({
        newId,
        json: objectToJSON(morphedObject),
        oldId,
      });
    });

    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion10(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 10;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      CREATE TABLE ${CLOSED_GROUP_V2_KEY_PAIRS_TABLE} (
        id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
        groupPublicKey TEXT,
        timestamp NUMBER,
        json TEXT
      );

      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion11(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 11;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  function remove05PrefixFromStringIfNeeded(str: string) {
    if (str.length === 66 && str.startsWith('05')) {
      return str.substr(2);
    }
    return str;
  }

  db.transaction(() => {
    // the migration is called only once, so all current groups not being open groups are v1 closed group.
    const allClosedGroupV1Ids = db
      .prepare(
        `SELECT id FROM ${CONVERSATIONS_TABLE} WHERE
        type = 'group' AND
        id NOT LIKE 'publicChat:%';`
      )
      .all()
      .map(m => m.id) as Array<string>;

    allClosedGroupV1Ids.forEach(groupV1Id => {
      try {
        console.log('Migrating closed group v1 to v2: pubkey', groupV1Id);
        const groupV1IdentityKey = sqlNode.getIdentityKeyById(groupV1Id, db);
        if (!groupV1IdentityKey) {
          return;
        }
        const encryptionPubKeyWithoutPrefix = remove05PrefixFromStringIfNeeded(
          groupV1IdentityKey.id
        );

        // Note:
        // this is what we get from getIdentityKeyById:
        //   {
        //     id: string;
        //     secretKey?: string;
        //   }

        // and this is what we want saved in db:
        //   {
        //    publicHex: string; // without prefix
        //    privateHex: string;
        //   }
        const keyPair = {
          publicHex: encryptionPubKeyWithoutPrefix,
          privateHex: groupV1IdentityKey.secretKey,
        };
        sqlNode.addClosedGroupEncryptionKeyPair(groupV1Id, keyPair, db);
      } catch (e) {
        console.error(e);
      }
    });
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion12(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 12;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
      CREATE TABLE ${OPEN_GROUP_ROOMS_V2_TABLE} (
        serverUrl TEXT NOT NULL,
        roomId TEXT NOT NULL,
        conversationId TEXT,
        json TEXT,
        PRIMARY KEY (serverUrl, roomId)
      );

      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion13(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 13;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  // Clear any already deleted db entries.
  // secure_delete = ON will make sure next deleted entries are overwritten with 0 right away
  db.transaction(() => {
    db.pragma('secure_delete = ON');
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion14(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 14;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

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
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion15(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 15;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
        DROP TABLE pairingAuthorisations;
        DROP TRIGGER IF EXISTS messages_on_delete;
        DROP TRIGGER IF EXISTS messages_on_update;
      `);

    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion16(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 16;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
        ALTER TABLE ${MESSAGES_TABLE} ADD COLUMN serverHash TEXT;
        ALTER TABLE ${MESSAGES_TABLE} ADD COLUMN isDeleted BOOLEAN;

        CREATE INDEX messages_serverHash ON ${MESSAGES_TABLE} (
          serverHash
        ) WHERE serverHash IS NOT NULL;

        CREATE INDEX messages_isDeleted ON ${MESSAGES_TABLE} (
          isDeleted
        ) WHERE isDeleted IS NOT NULL;

        ALTER TABLE unprocessed ADD serverHash TEXT;
        CREATE INDEX messages_messageHash ON unprocessed (
          serverHash
        ) WHERE serverHash IS NOT NULL;
      `);

    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion17(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 17;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
        UPDATE ${CONVERSATIONS_TABLE} SET
        json = json_set(json, '$.isApproved', 1)
      `);
    // remove the moderators field. As it was only used for opengroups a long time ago and whatever is there is probably unused
    db.exec(`
        UPDATE ${CONVERSATIONS_TABLE} SET
        json = json_remove(json, '$.moderators', '$.dataMessage', '$.accessKey', '$.profileSharing', '$.sessionRestoreSeen')
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion18(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 18;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  // Dropping all pre-existing schema relating to message searching.
  // Recreating the full text search and related triggers

  db.transaction(() => {
    dropFtsAndTriggers(db);
    rebuildFtsTable(db);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion19(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 19;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
        DROP INDEX messages_schemaVersion;
        ALTER TABLE ${MESSAGES_TABLE} DROP COLUMN schemaVersion;
      `);
    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion20(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 20;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    // First we want to drop the column friendRequestStatus if it is there, otherwise the transaction fails
    const rows = db.pragma(`table_info(${CONVERSATIONS_TABLE});`);
    if (rows.some((m: any) => m.name === 'friendRequestStatus')) {
      console.info('found column friendRequestStatus. Dropping it');
      db.exec(`ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN friendRequestStatus;`);
    }
    // disable those updates as sqlNode.saveConversation will break if called without the right type of arguments.
    // and when called during a migration we won't have the expected arguments. Plus, this migration is almost a year old already

    // looking for all private conversations, with a nickname set
    // const rowsToUpdate = db
    //   .prepare(
    //     `SELECT * FROM ${CONVERSATIONS_TABLE} WHERE type = 'private' AND (name IS NULL or name = '') AND json_extract(json, '$.nickname') <> '';`
    //   )
    //   .all();

    // (rowsToUpdate || []).forEach(r => {
    //   const obj = jsonToObject(r.json);

    //   // obj.profile.displayName is the display as this user set it.
    //   if (obj?.nickname?.length && obj?.profile?.displayName?.length) {
    //     // this one has a nickname set, but name is unset, set it to the displayName in the lokiProfile if it's exisitng
    //     obj.name = obj.profile.displayName;
    //     sqlNode.saveConversation(obj as ConversationAttributes, db);
    //   }
    // });
    writeSessionSchemaVersion(targetVersion, db);
  });
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion21(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 21;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
          UPDATE ${CONVERSATIONS_TABLE} SET
          json = json_set(json, '$.didApproveMe', 1, '$.isApproved', 1)
          WHERE type = 'private';
        `);

    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion22(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 22;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`DROP INDEX messages_duplicate_check;`);

    db.exec(`
      ALTER TABLE ${MESSAGES_TABLE} DROP sourceDevice;
      `);
    db.exec(`
      ALTER TABLE unprocessed DROP sourceDevice;
      `);
    db.exec(`
      CREATE INDEX messages_duplicate_check ON ${MESSAGES_TABLE} (
        source,
        sent_at
      );
      `);

    dropFtsAndTriggers(db);
    // we also want to remove the read_by it could have 20 times the same value set in the array
    // we do this once, and updated the code to not allow multiple entries in read_by as we do not care about multiple entries
    // (read_by is only used in private chats)
    db.exec(`
          UPDATE ${MESSAGES_TABLE} SET
          json = json_remove(json, '$.schemaVersion', '$.recipients', '$.decrypted_at', '$.sourceDevice', '$.read_by')
        `);
    rebuildFtsTable(db);
    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion23(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 23;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(
      `
        ALTER TABLE ${LAST_HASHES_TABLE} RENAME TO ${LAST_HASHES_TABLE}_old;
        CREATE TABLE ${LAST_HASHES_TABLE}(
          id TEXT,
          snode TEXT,
          hash TEXT,
          expiresAt INTEGER,
          namespace INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (id, snode, namespace)
        );`
    );

    db.exec(
      `INSERT INTO ${LAST_HASHES_TABLE}(id, snode, hash, expiresAt) SELECT id, snode, hash, expiresAt FROM ${LAST_HASHES_TABLE}_old;`
    );
    db.exec(`DROP TABLE ${LAST_HASHES_TABLE}_old;`);

    writeSessionSchemaVersion(targetVersion, db);
  })();
  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion24(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 24;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    // it's unlikely there is still a publicChat v1 convo in the db, but run this in a migration to be 100% sure (previously, run on app start instead)
    db.prepare(
      `DELETE FROM ${CONVERSATIONS_TABLE} WHERE
        type = 'group' AND
        id LIKE 'publicChat:1@%';`
    ).run();

    db.exec(`
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN zombies TEXT DEFAULT "[]";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN left INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN expireTimer INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN mentionedUs INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN unreadCount INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN lastMessageStatus TEXT;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN lastMessage TEXT;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN lastJoinedTimestamp INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN groupAdmins TEXT DEFAULT "[]";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN isKickedFromGroup INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN subscriberCount INTEGER;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN is_medium_group INTEGER;

         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN avatarPointer TEXT; -- this is the url of the avatar for that conversation
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN avatarHash TEXT; -- only used for opengroup avatar.
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN nickname TEXT;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN profileKey TEXT;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN triggerNotificationsFor TEXT DEFAULT "all";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN isTrustedForAttachmentDownload INTEGER DEFAULT "FALSE";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN isPinned INTEGER DEFAULT "FALSE";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN isApproved INTEGER DEFAULT "FALSE";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN didApproveMe INTEGER DEFAULT "FALSE";
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN avatarInProfile TEXT;
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN avatarPathInAvatar TEXT; -- this is very temporary, removed right below
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN displayNameInProfile TEXT;

         UPDATE ${CONVERSATIONS_TABLE} SET
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

          UPDATE ${CONVERSATIONS_TABLE} SET json = json_remove(json,
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

          ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN json;
          UPDATE ${CONVERSATIONS_TABLE} SET displayNameInProfile = name WHERE
          type = 'group' AND
          id NOT LIKE 'publicChat:%';

          ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN profileName;
          ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN name;

          -- we want to rely on avatarInProfile only, but it can be set either in avatarInProfile or in avatarPathInAvatar.
          -- make sure to override avatarInProfile with the value from avatarPathInAvatar if avatarInProfile is unset
          UPDATE ${CONVERSATIONS_TABLE} SET avatarInProfile = avatarPathInAvatar WHERE avatarInProfile IS NULL;
          ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN avatarPathInAvatar;

          CREATE INDEX conversation_nickname ON ${CONVERSATIONS_TABLE} (
            nickname
          );
          CREATE INDEX conversation_displayNameInProfile ON ${CONVERSATIONS_TABLE} (
            displayNameInProfile
          );

         `);

    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion25(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 25;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    // mark all conversation as read/write/upload capability to be true on migration.
    // the next batch poll will update them if needed
    db.exec(`
          ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN readCapability INTEGER DEFAULT 1;
          ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN writeCapability INTEGER DEFAULT 1;
          ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN uploadCapability INTEGER DEFAULT 1;
          ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN conversationIdOrigin TEXT;
          ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN avatarHash;
          ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN avatarImageId INTEGER;

          CREATE INDEX messages_convo_serverID ON ${MESSAGES_TABLE} (
            serverId,
            conversationId
          );
         `);

    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion26(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 26;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`
         ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN groupModerators TEXT DEFAULT "[]"; -- those are for sogs only (for closed groups we only need the groupAdmins)
         `);

    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion27(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 27;
  if (currentVersion >= targetVersion) {
    return;
  }
  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
  const domainNameToUse = 'open.getsession.org';
  const urlToUse = `https://${domainNameToUse}`;

  const ipToRemove = '116.203.70.33';

  // defining these functions here as this is very specific to this migration and used in a few places
  function getNewConvoId(oldConvoId?: string) {
    if (!oldConvoId) {
      return null;
    }
    return oldConvoId
      ?.replace(`https://${ipToRemove}`, urlToUse)

      ?.replace(`http://${ipToRemove}`, urlToUse)
      ?.replace(ipToRemove, urlToUse);
  }

  function getAllOpenGroupV2Conversations(instance: BetterSqlite3.Database) {
    // first _ matches all opengroupv1 (they are completely removed in a migration now),
    // second _ force a second char to be there, so it can only be opengroupv2 convos

    const rows = instance
      .prepare(
        `SELECT * FROM ${CONVERSATIONS_TABLE} WHERE
        type = 'group' AND
        id LIKE 'publicChat:__%@%'
       ORDER BY id ASC;`
      )
      .all();

    return rows || [];
  }

  function getRoomIdFromConversationAttributes(attributes?: ConversationAttributes | null) {
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
    // First we want to drop the column friendRequestStatus if it is there, otherwise the transaction fails
    const rows = db.pragma(`table_info(${CONVERSATIONS_TABLE});`);
    if (rows.some((m: any) => m.name === 'friendRequestStatus')) {
      console.info('found column friendRequestStatus. Dropping it');
      db.exec(`ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN friendRequestStatus;`);
    }

    // We want to replace all the occurrences of the sogs server ip url (116.203.70.33 || http://116.203.70.33 || https://116.203.70.33) by its hostname: https://open.getsession.org
    // This includes change the conversationTable, the openGroupRooms tables and every single message associated with them.
    // Because the conversationId is used to link messages to conversation includes the ip/url in it...

    /**
     * First, remove duplicates for the v2 opengroup table, and replace the one without duplicates with their dns name syntax
     */

    // rooms to rename are: crypto, lokinet, oxen, session, session-updates
    const allSessionV2RoomsIp = sqlNode
      .getAllV2OpenGroupRooms(db)
      .filter(m => m.serverUrl.includes(ipToRemove));
    const allSessionV2RoomsDns = sqlNode
      .getAllV2OpenGroupRooms(db)
      .filter(m => m.serverUrl.includes(domainNameToUse));

    const duplicatesRoomsIpAndDns = allSessionV2RoomsIp.filter(ip =>
      allSessionV2RoomsDns.some(dns => dns.roomId === ip.roomId)
    );

    const withIpButNotDuplicateRoom = allSessionV2RoomsIp.filter(ip => {
      return !duplicatesRoomsIpAndDns.some(dns => dns.roomId === ip.roomId);
    });

    console.info(
      'allSessionV2RoomsIp',
      allSessionV2RoomsIp.map(m => pick(m, ['serverUrl', 'roomId']))
    );
    console.info(
      'allSessionV2RoomsDns',
      allSessionV2RoomsDns.map(m => pick(m, ['serverUrl', 'roomId']))
    );
    console.info(
      'duplicatesRoomsIpAndDns',
      duplicatesRoomsIpAndDns.map(m => pick(m, ['serverUrl', 'roomId']))
    );
    console.info(
      'withIpButNotDuplicateRoom',
      withIpButNotDuplicateRoom.map(m => pick(m, ['serverUrl', 'roomId']))
    );
    console.info(
      '========> before room update:',
      sqlNode
        .getAllV2OpenGroupRooms(db)
        .filter(m => m.serverUrl.includes(domainNameToUse) || m.serverUrl.includes(ipToRemove))
        .map(m => pick(m, ['conversationId', 'serverUrl', 'roomId']))
    );

    // for those with duplicates, delete the one with the IP as we want to rely on the one with the DNS only now
    // remove the ip ones completely which are duplicated.
    // Note: this also removes the ones not duplicated, but we are recreating them just below with `saveV2OpenGroupRoom`
    db.exec(`DELETE FROM ${OPEN_GROUP_ROOMS_V2_TABLE} WHERE serverUrl LIKE '%${ipToRemove}%';`);

    // for those without duplicates, override the value with the Domain Name
    withIpButNotDuplicateRoom.forEach(r => {
      const newConvoId = getNewConvoId(r.conversationId);
      if (!newConvoId) {
        return;
      }
      console.info(
        `withIpButNotDuplicateRoom: renaming room old:${r.conversationId} with saveV2OpenGroupRoom() new- conversationId:${newConvoId}: serverUrl:${urlToUse}`
      );
      sqlNode.saveV2OpenGroupRoom(
        {
          ...r,
          serverUrl: urlToUse,
          conversationId: newConvoId,
        },
        db
      );
    });

    console.info(
      '<======== after room update:',
      sqlNode
        .getAllV2OpenGroupRooms(db)
        .filter(m => m.serverUrl.includes(domainNameToUse) || m.serverUrl.includes(ipToRemove))
        .map(m => pick(m, ['conversationId', 'serverUrl', 'roomId']))
    );

    /**
     * Then, update the conversations table by doing the same thing
     */
    const allSessionV2ConvosIp = compact(
      getAllOpenGroupV2Conversations(db).filter(m => m?.id.includes(ipToRemove))
    );
    const allSessionV2ConvosDns = compact(
      getAllOpenGroupV2Conversations(db).filter(m => m?.id.includes(domainNameToUse))
    );

    const withIpButNotDuplicateConvo = allSessionV2ConvosIp.filter(ip => {
      const roomId = getRoomIdFromConversationAttributes(ip);
      if (!roomId) {
        return false;
      }

      return !allSessionV2ConvosDns.some(dns => {
        return getRoomIdFromConversationAttributes(dns) === roomId;
      });
    });

    // for those with duplicates, delete the one with the IP as we want to rely on the one with the DNS only now
    // remove the ip ones completely which are duplicated.
    // Note: this also removes the ones not duplicated, but we are recreating them just below with `saveConversation`
    db.exec(`DELETE FROM ${CONVERSATIONS_TABLE} WHERE id LIKE '%${ipToRemove}%';`);

    // for those without duplicates, override the value with the DNS
    const convoIdsToMigrateFromIpToDns: Map<string, string> = new Map();
    withIpButNotDuplicateConvo.forEach(r => {
      if (!r) {
        return;
      }
      const newConvoId = getNewConvoId(r.id);
      if (!newConvoId) {
        return;
      }
      console.info(
        `withIpButNotDuplicateConvo: renaming convo old:${r.id} with saveConversation() new- conversationId:${newConvoId}`
      );
      convoIdsToMigrateFromIpToDns.set(r.id, newConvoId);
      // commenting this as saveConversation should not be called during migration.
      // I actually suspect that this code was not working at all.
      // sqlNode.saveConversation(
      //   {
      //     ...r,
      //     id: newConvoId,
      //   },
      //   db
      // );
    });

    /**
     * Lastly, we need to take care of messages.
     * For duplicated rooms, we drop all the messages from the IP one. (Otherwise we
     * would need to compare each message id to not break the PRIMARY_KEY on the messageID and those are just sogs messages).
     * For non duplicated rooms which got renamed to their dns ID, we override the stored conversationId in the message with the new conversationID
     */
    dropFtsAndTriggers(db);

    // let's start with the non duplicateD ones, as doing so will make the duplicated one process easier
    console.info('convoIdsToMigrateFromIpToDns', [...convoIdsToMigrateFromIpToDns.entries()]);
    [...convoIdsToMigrateFromIpToDns.keys()].forEach(oldConvoId => {
      const newConvoId = convoIdsToMigrateFromIpToDns.get(oldConvoId);
      if (!newConvoId) {
        return;
      }
      console.info(`About to migrate messages of ${oldConvoId} to ${newConvoId}`);

      db.prepare(
        `UPDATE ${MESSAGES_TABLE} SET
          conversationId = $newConvoId,
          json = json_set(json,'$.conversationId', $newConvoId)
          WHERE conversationId = $oldConvoId;`
      ).run({ oldConvoId, newConvoId });
    });
    // now, the duplicated ones. We just need to move every message with a convoId matching that ip, because we already took care of the one to migrate to the dns before
    console.log(
      'Count of messages to be migrated: ',
      db
        .prepare(
          `SELECT COUNT(*) FROM ${MESSAGES_TABLE} WHERE conversationId LIKE '%${ipToRemove}%';`
        )
        .get()
    );

    const messageWithIdsToUpdate = db
      .prepare(
        `SELECT DISTINCT conversationId FROM ${MESSAGES_TABLE} WHERE conversationID LIKE '%${ipToRemove}%'`
      )
      .all();
    console.info('messageWithConversationIdsToUpdate', messageWithIdsToUpdate);
    messageWithIdsToUpdate.forEach(oldConvo => {
      const newConvoId = getNewConvoId(oldConvo.conversationId);
      if (!newConvoId) {
        return;
      }
      console.info('oldConvo.conversationId', oldConvo.conversationId, newConvoId);
      db.prepare(
        `UPDATE ${MESSAGES_TABLE} SET
          conversationId = $newConvoId,
          json = json_set(json,'$.conversationId', $newConvoId)
          WHERE conversationId = $oldConvoId;`
      ).run({ oldConvoId: oldConvo.conversationId, newConvoId });
    });

    rebuildFtsTable(db);

    console.info(
      'removing lastMessageDeletedServerID & lastMessageFetchedServerID from rooms table'
    );
    db.exec(
      `UPDATE ${OPEN_GROUP_ROOMS_V2_TABLE} SET
        json = json_remove(json, '$.lastMessageDeletedServerID', '$.lastMessageFetchedServerID', '$.token' );`
    );
    console.info(
      'removing lastMessageDeletedServerID & lastMessageFetchedServerID from rooms table. done'
    );

    writeSessionSchemaVersion(targetVersion, db);
    console.log('... done');
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion28(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 28;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    // Keeping this empty migration because some people updated to this already, even if it is not needed anymore
    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function updateToSessionSchemaVersion29(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 29;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    dropFtsAndTriggers(db);
    db.exec(`CREATE INDEX messages_unread_by_conversation ON ${MESSAGES_TABLE} (
      unread,
      conversationId
    );`);
    rebuildFtsTable(db);
    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function insertContactIntoContactWrapper(
  contact: any,
  blockedNumbers: Array<string>,
  contactsConfigWrapper: ContactsConfigWrapperNode | null, // set this to null to only insert into the convo volatile wrapper (i.e. for ourConvo case)
  volatileConfigWrapper: ConvoInfoVolatileWrapperNode,
  db: BetterSqlite3.Database
) {
  if (contactsConfigWrapper !== null) {
    const dbApproved = !!contact.isApproved || false;
    const dbApprovedMe = !!contact.didApproveMe || false;
    const dbBlocked = blockedNumbers.includes(contact.id);
    const priority = contact.priority || CONVERSATION_PRIORITIES.default;
    // const expirationTimerSeconds = contact.expireTimer || 0;

    const wrapperContact = getContactInfoFromDBValues({
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

      // expirationTimerSeconds,
    });

    try {
      hasDebugEnvVariable && console.info('Inserting contact into wrapper: ', wrapperContact);
      contactsConfigWrapper.set(wrapperContact);
    } catch (e) {
      console.error(
        `contactsConfigWrapper.set during migration failed with ${e.message} for id: ${contact.id}`
      );
      // the wrapper did not like something. Try again with just the boolean fields as it's most likely the issue is with one of the strings (which could be recovered)
      try {
        hasDebugEnvVariable && console.info('Inserting edited contact into wrapper: ', contact.id);
        contactsConfigWrapper.set(
          getContactInfoFromDBValues({
            id: contact.id,
            dbApproved,
            dbApprovedMe,
            dbBlocked,
            dbName: undefined,
            dbNickname: undefined,
            dbProfileKey: undefined,
            dbProfileUrl: undefined,
            priority: CONVERSATION_PRIORITIES.default,
            dbCreatedAtSeconds: Math.floor(Date.now() / 1000),
            // expirationTimerSeconds: 0,
          })
        );
      } catch (err2) {
        // there is nothing else we can do here
        console.error(
          `contactsConfigWrapper.set during migration failed with ${err2.message} for id: ${contact.id}. Skipping contact entirely`
        );
      }
    }
  }

  try {
    const rows = db
      .prepare(
        `
      SELECT MAX(COALESCE(sent_at, 0)) AS max_sent_at
      FROM ${MESSAGES_TABLE} WHERE
        conversationId = $conversationId AND
        unread = $unread;
    `
      )
      .get({
        conversationId: contact.id,
        unread: toSqliteBoolean(false), // we want to find the message read with the higher sentAt timestamp
      });

    const maxRead = rows?.max_sent_at;
    const lastRead = isNumber(maxRead) && isFinite(maxRead) ? maxRead : 0;
    hasDebugEnvVariable &&
      console.info(`Inserting contact into volatile wrapper maxread: ${contact.id} :${lastRead}`);
    volatileConfigWrapper.set1o1(contact.id, lastRead, false);
  } catch (e) {
    console.error(
      `volatileConfigWrapper.set1o1 during migration failed with ${e.message} for id: ${contact.id}. skipping`
    );
  }
}

function insertCommunityIntoWrapper(
  community: { id: string; priority: number },
  userGroupConfigWrapper: UserGroupsWrapperNode,
  volatileConfigWrapper: ConvoInfoVolatileWrapperNode,
  db: BetterSqlite3.Database
) {
  const priority = community.priority;
  const convoId = community.id; // the id of a conversation has the prefix, the serverUrl and the roomToken already present, but not the pubkey

  const roomDetails = sqlNode.getV2OpenGroupRoom(convoId, db);
  // hasDebugEnvVariable && console.info('insertCommunityIntoWrapper: ', community);

  if (
    !roomDetails ||
    isEmpty(roomDetails) ||
    isEmpty(roomDetails.serverUrl) ||
    isEmpty(roomDetails.roomId) ||
    isEmpty(roomDetails.serverPublicKey)
  ) {
    console.info(
      'insertCommunityIntoWrapper did not find corresponding room details',
      convoId,
      roomDetails
    );
    return;
  }
  hasDebugEnvVariable ??
    console.info(
      `building fullUrl from serverUrl:"${roomDetails.serverUrl}" roomId:"${roomDetails.roomId}" pubkey:"${roomDetails.serverPublicKey}"`
    );

  const fullUrl = userGroupConfigWrapper.buildFullUrlFromDetails(
    roomDetails.serverUrl,
    roomDetails.roomId,
    roomDetails.serverPublicKey
  );
  const wrapperComm = getCommunityInfoFromDBValues({
    fullUrl,
    priority,
  });

  try {
    hasDebugEnvVariable && console.info('Inserting community into group wrapper: ', wrapperComm);
    userGroupConfigWrapper.setCommunityByFullUrl(wrapperComm.fullUrl, wrapperComm.priority);
    const rows = db
      .prepare(
        `
      SELECT MAX(COALESCE(serverTimestamp, 0)) AS max_sent_at
      FROM ${MESSAGES_TABLE} WHERE
        conversationId = $conversationId AND
        unread = $unread;
    `
      )
      .get({
        conversationId: convoId,
        unread: toSqliteBoolean(false), // we want to find the message read with the higher serverTimestamp timestamp
      });

    const maxRead = rows?.max_sent_at;
    const lastRead = isNumber(maxRead) && isFinite(maxRead) ? maxRead : 0;
    hasDebugEnvVariable &&
      console.info(
        `Inserting community into volatile wrapper: ${wrapperComm.fullUrl} :${lastRead}`
      );
    volatileConfigWrapper.setCommunityByFullUrl(wrapperComm.fullUrl, lastRead, false);
  } catch (e) {
    console.error(
      `userGroupConfigWrapper.set during migration failed with ${e.message} for fullUrl: "${wrapperComm.fullUrl}". Skipping community entirely`
    );
  }
}

function insertLegacyGroupIntoWrapper(
  legacyGroup: Pick<
    ConversationAttributes,
    'id' | 'priority' | 'displayNameInProfile' | 'lastJoinedTimestamp' // | 'expireTimer'
  > & { members: string; groupAdmins: string }, // members and groupAdmins are still stringified here
  userGroupConfigWrapper: UserGroupsWrapperNode,
  volatileInfoConfigWrapper: ConvoInfoVolatileWrapperNode,
  db: BetterSqlite3.Database
) {
  const {
    priority,
    id,
    // expireTimer,
    groupAdmins,
    members,
    displayNameInProfile,
    lastJoinedTimestamp,
  } = legacyGroup;

  const latestEncryptionKeyPairHex = sqlNode.getLatestClosedGroupEncryptionKeyPair(
    legacyGroup.id,
    db
  ) as HexKeyPair | undefined;

  const wrapperLegacyGroup = getLegacyGroupInfoFromDBValues({
    id,
    priority,
    // expireTimer,
    groupAdmins,
    members,
    displayNameInProfile,
    encPubkeyHex: latestEncryptionKeyPairHex?.publicHex || '',
    encSeckeyHex: latestEncryptionKeyPairHex?.privateHex || '',
    lastJoinedTimestamp,
  });

  try {
    hasDebugEnvVariable &&
      console.info('Inserting legacy group into wrapper: ', wrapperLegacyGroup);
    userGroupConfigWrapper.setLegacyGroup(wrapperLegacyGroup);

    const rows = db
      .prepare(
        `
      SELECT MAX(COALESCE(sent_at, 0)) AS max_sent_at
      FROM ${MESSAGES_TABLE} WHERE
        conversationId = $conversationId AND
        unread = $unread;
    `
      )
      .get({
        conversationId: id,
        unread: toSqliteBoolean(false), // we want to find the message read with the higher sentAt timestamp
      });

    const maxRead = rows?.max_sent_at;
    const lastRead = isNumber(maxRead) && isFinite(maxRead) ? maxRead : 0;
    hasDebugEnvVariable &&
      console.info(`Inserting legacy group into volatile wrapper maxread: ${id} :${lastRead}`);
    volatileInfoConfigWrapper.setLegacyGroup(id, lastRead, false);
  } catch (e) {
    console.error(
      `userGroupConfigWrapper.set during migration failed with ${e.message} for legacyGroup.id: "${legacyGroup.id}". Skipping that legacy group entirely`
    );
  }
}

function getBlockedNumbersDuringMigration(db: BetterSqlite3.Database) {
  try {
    const blockedItem = sqlNode.getItemById('blocked', db);
    if (!blockedItem) {
      return [];
    }
    const foundBlocked = blockedItem?.value;
    hasDebugEnvVariable && console.info('foundBlockedNumbers during migration', foundBlocked);
    if (isArray(foundBlocked)) {
      return foundBlocked;
    }
    return [];
  } catch (e) {
    console.info('failed to read blocked numbers. Considering no blocked numbers', e.stack);
    return [];
  }
}

function updateToSessionSchemaVersion30(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 30;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
  /**
   * Make all the changes required to the database structure to handle the user configs, in the next migration.
   * I made two migrations because it was easier to separate
   *  - the part needed a user to be logged in (creating the user dumps needs a private ed25519 key)
   *  - from the part not requiring a change of user, but which absolutely needed to be happening nevertheless (database structure changes)
   *
   */
  db.transaction(() => {
    // drop unused readCapability & uploadCapability columns. Also move `writeCapability` to memory only value.
    db.exec(`
      ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN readCapability; -- stored in a redux slice now
      ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN writeCapability; -- stored in a redux slice now
      ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN uploadCapability; -- stored in a redux slice now
      ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN subscriberCount; -- stored in a redux slice now
      ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN groupModerators; -- stored in a redux slice now

      ALTER TABLE ${CONVERSATIONS_TABLE} RENAME COLUMN isPinned TO priority; -- isPinned was 0 for false and 1 for true, which matches our way of handling the priority
      ALTER TABLE ${CONVERSATIONS_TABLE} DROP COLUMN is_medium_group; -- a medium group starts with 05 and has a type of group. We cache everything renderer side so there is no need for that field
      `);

    // Didn't find any reference to this serverTimestamp in the unprocessed table needed, so let's clean it up
    db.exec(`
      ALTER TABLE unprocessed DROP COLUMN serverTimestamp;
      `);

    // for manually flagging conversations as unread"
    db.exec(`ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN markedAsUnread BOOLEAN;`);

    // after the rename of isPinned to priority, we also need to hide any private conversation that is not active at all.
    // as they might be contacts, we did delete from the app already.

    // The release of message requests from other platforms (17 april 2022) created a bunch of active, but not "real contacts" conversation.
    // This `UPDATE` command makes sure to make any private conversation which have was inactive since the 1st may 2022 as inactive
    db.prepare(
      `UPDATE ${CONVERSATIONS_TABLE} SET
            active_at = 0
            WHERE type = 'private' AND active_at > 0 AND active_at < ${1000 * 1651363200};` // 1st may 2022 GMT
    ).run({});

    db.prepare(
      `UPDATE ${CONVERSATIONS_TABLE} SET
        priority = ${CONVERSATION_PRIORITIES.hidden}
        WHERE type = 'private' AND (active_at IS NULL OR active_at = 0 );`
    ).run({});

    // create the table which is going to handle the wrappers, without any content in this migration.
    db.exec(`CREATE TABLE ${CONFIG_DUMP_TABLE}(
          variant TEXT NOT NULL,
          publicKey TEXT NOT NULL,
          data BLOB,
          PRIMARY KEY (publicKey, variant)
          );
          `);

    /**
     * Remove the `publicChat` prefix from the communities, instead keep the full url+room in it, with the corresponding http or https prefix.
     * This is easier to handle with the libsession wrappers
     */
    const allOpengroupsConvo = db
      .prepare(
        `SELECT id FROM ${CONVERSATIONS_TABLE} WHERE
      type = 'group' AND
      id LIKE 'publicChat:%'
     ORDER BY id ASC;`
      )
      .all();

    const allValidOpengroupsDetails = allOpengroupsConvo
      .filter(m => isString(m.id) && m.id.indexOf('@') > 0)
      .map(row => {
        const roomNameStart = (row.id.indexOf(':') as number) + 1;
        const roomNameEnd = row.id.indexOf('@');
        const roomName = row.id.substring(roomNameStart, roomNameEnd);
        const baseUrl = row.id.substring((roomNameEnd as number) + 1);

        return { roomName, baseUrl, oldConvoId: row.id };
      });

    allValidOpengroupsDetails.forEach(convoDetails => {
      const newId = `${convoDetails.baseUrl}/${convoDetails.roomName}`;
      db.prepare(
        `UPDATE ${CONVERSATIONS_TABLE} SET
          id = $newId
          WHERE id = $oldId;`
      ).run({
        newId,
        oldId: convoDetails.oldConvoId,
      });
      // do the same for messages

      db.prepare(
        `UPDATE ${MESSAGES_TABLE} SET
          conversationId = $newId,
          json = json_set(json,'$.conversationId', $newId)
          WHERE conversationId = $oldConvoId;`
      ).run({ oldConvoId: convoDetails.oldConvoId, newId });

      db.prepare(
        `UPDATE ${OPEN_GROUP_ROOMS_V2_TABLE} SET
          conversationId = $newId,
          json = json_set(json, '$.conversationId', $newId)
          WHERE conversationId = $oldConvoId;`
      ).run({ newId, oldConvoId: convoDetails.oldConvoId });
    });

    // priority was isPinned before. Make sure that it was set to something, rather than allowing null values.
    db.prepare(
      `UPDATE ${CONVERSATIONS_TABLE} SET
        priority = ${CONVERSATION_PRIORITIES.default}
        WHERE priority IS NULL;`
    ).run({});

    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

/**
 * Returns the logged in user conversation attributes and the keys.
 * If the keys exists but a conversation for that pubkey does not exist yet, the keys are still returned
 */
function getLoggedInUserConvoDuringMigration(db: BetterSqlite3.Database) {
  const ourKeys = getIdentityKeys(db);

  if (!ourKeys || !ourKeys.publicKeyHex || !ourKeys.privateEd25519) {
    return null;
  }

  const ourConversation = db.prepare(`SELECT * FROM ${CONVERSATIONS_TABLE} WHERE id = $id;`).get({
    id: ourKeys.publicKeyHex,
  }) as Record<string, any> | null;

  return { ourKeys, ourConversation: ourConversation || null };
}

function updateToSessionSchemaVersion31(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 31;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
  db.transaction(() => {
    // In the migration 30, we made all the changes which didn't require the user to be logged in yet.
    // in this one, we check if a user is logged in, and if yes we build and save the config dumps for the current state of the database.
    try {
      const loggedInUser = getLoggedInUserConvoDuringMigration(db);

      if (!loggedInUser || !loggedInUser.ourKeys) {
        throw new Error('privateEd25519 was empty. Considering no users are logged in');
      }
      const blockedNumbers = getBlockedNumbersDuringMigration(db);
      const { privateEd25519, publicKeyHex } = loggedInUser.ourKeys;
      const userProfileWrapper = new UserConfigWrapperNode(privateEd25519, null);
      const contactsConfigWrapper = new ContactsConfigWrapperNode(privateEd25519, null);
      const userGroupsConfigWrapper = new UserGroupsWrapperNode(privateEd25519, null);
      const volatileInfoConfigWrapper = new ConvoInfoVolatileWrapperNode(privateEd25519, null);

      /**
       * Setup up the User profile wrapper with what is stored in our own conversation
       */

      const { ourConversation } = loggedInUser;

      if (!ourConversation) {
        throw new Error('Failed to find our logged in conversation while migrating');
      }

      // Insert the user profile into the userWrapper
      const ourDbName = ourConversation.displayNameInProfile || '';
      const ourDbProfileUrl = ourConversation.avatarPointer || '';
      const ourDbProfileKey = fromHexToArray(ourConversation.profileKey || '');
      const ourConvoPriority = ourConversation.priority;
      // const ourConvoExpire = ourConversation.expireTimer || 0;
      if (ourDbProfileUrl && !isEmpty(ourDbProfileKey)) {
        userProfileWrapper.setUserInfo(
          ourDbName,
          ourConvoPriority,
          {
            url: ourDbProfileUrl,
            key: ourDbProfileKey,
          }
          // ourConvoExpire,
        );
      }

      insertContactIntoContactWrapper(
        ourConversation,
        blockedNumbers,
        null,
        volatileInfoConfigWrapper,
        db
      );

      // dump the user wrapper content and save it to the DB
      const userDump = userProfileWrapper.dump();

      db.prepare(
        `INSERT OR REPLACE INTO ${CONFIG_DUMP_TABLE} (
              publicKey,
              variant,
              data
          ) values (
            $publicKey,
            $variant,
            $data
          );`
      ).run({
        publicKey: publicKeyHex,
        variant: 'UserConfig',
        data: userDump,
      });

      /**
       * Setup up the Contacts Wrapper with all the contact details which needs to be stored in it.
       */

      // this filter is based on the `isContactToStoreInWrapper` function. Note, blocked contacts won't be added to the wrapper at first, but will on the first start
      const contactsToWriteInWrapper = db
        .prepare(
          `SELECT * FROM ${CONVERSATIONS_TABLE} WHERE type = 'private' AND active_at > 0 AND priority <> ${CONVERSATION_PRIORITIES.hidden} AND (didApproveMe OR isApproved) AND id <> '$us' AND id NOT LIKE '15%' AND id NOT LIKE '25%' ;`
        )
        .all({
          us: publicKeyHex,
        });

      if (isArray(contactsToWriteInWrapper) && contactsToWriteInWrapper.length) {
        console.info(
          `===================== Starting contact inserting into wrapper ${contactsToWriteInWrapper?.length} =======================`
        );

        contactsToWriteInWrapper.forEach(contact => {
          insertContactIntoContactWrapper(
            contact,
            blockedNumbers,
            contactsConfigWrapper,
            volatileInfoConfigWrapper,
            db
          );
        });

        console.info('===================== Done with contact inserting =======================');
      }
      const contactsDump = contactsConfigWrapper.dump();

      db.prepare(
        `INSERT OR REPLACE INTO ${CONFIG_DUMP_TABLE} (
              publicKey,
              variant,
              data
          ) values (
            $publicKey,
            $variant,
            $data
          );`
      ).run({
        publicKey: publicKeyHex,
        variant: 'ContactsConfig',
        data: contactsDump,
      });

      /**
       * Setup up the UserGroups Wrapper with all the comunities details which needs to be stored in it.
       */

      // this filter is based on the `isCommunityToStoreInWrapper` function.
      const communitiesToWriteInWrapper = db
        .prepare(
          `SELECT * FROM ${CONVERSATIONS_TABLE} WHERE type = 'group' AND active_at > 0 AND id LIKE 'http%' ;`
        )
        .all({});

      if (isArray(communitiesToWriteInWrapper) && communitiesToWriteInWrapper.length) {
        console.info(
          `===================== Starting communities inserting into wrapper ${communitiesToWriteInWrapper?.length} =======================`
        );

        communitiesToWriteInWrapper.forEach(community => {
          try {
            insertCommunityIntoWrapper(
              community,
              userGroupsConfigWrapper,
              volatileInfoConfigWrapper,
              db
            );
          } catch (e) {
            console.info(`failed to insert community with ${e.message}`, community);
          }
        });

        console.info(
          '===================== Done with communinities inserting ======================='
        );
      }

      // this filter is based on the `isLegacyGroupToStoreInWrapper` function.
      const legacyGroupsToWriteInWrapper = db
        .prepare(
          `SELECT * FROM ${CONVERSATIONS_TABLE} WHERE type = 'group' AND active_at > 0 AND id LIKE '05%' AND NOT isKickedFromGroup AND NOT left ;`
        )
        .all({});

      if (isArray(legacyGroupsToWriteInWrapper) && legacyGroupsToWriteInWrapper.length) {
        console.info(
          `===================== Starting legacy group inserting into wrapper length: ${legacyGroupsToWriteInWrapper?.length} =======================`
        );

        legacyGroupsToWriteInWrapper.forEach(legacyGroup => {
          try {
            hasDebugEnvVariable &&
              console.info('Writing legacy group: ', JSON.stringify(legacyGroup));

            insertLegacyGroupIntoWrapper(
              legacyGroup,
              userGroupsConfigWrapper,
              volatileInfoConfigWrapper,
              db
            );
          } catch (e) {
            console.info(`failed to insert legacy group with ${e.message}`, legacyGroup);
          }
        });

        console.info(
          '===================== Done with legacy group inserting ======================='
        );
      }

      const userGroupsDump = userGroupsConfigWrapper.dump();

      db.prepare(
        `INSERT OR REPLACE INTO ${CONFIG_DUMP_TABLE} (
              publicKey,
              variant,
              data
          ) values (
            $publicKey,
            $variant,
            $data
          );`
      ).run({
        publicKey: publicKeyHex,
        variant: 'UserGroupsConfig',
        data: userGroupsDump,
      });

      const convoVolatileDump = volatileInfoConfigWrapper.dump();

      db.prepare(
        `INSERT OR REPLACE INTO ${CONFIG_DUMP_TABLE} (
              publicKey,
              variant,
              data
          ) values (
            $publicKey,
            $variant,
            $data
          );`
      ).run({
        publicKey: publicKeyHex,
        variant: 'ConvoInfoVolatileConfig',
        data: convoVolatileDump,
      });

      // we've just created the initial dumps. A ConfSyncJob is run when the app starts after 20 seconds
    } catch (e) {
      console.log(
        `failed to create initial wrapper. Might just not have a logged in user yet? `,
        e.message,
        e.stack,
        e
      );
      // if we get an exception here, most likely no users are logged in yet. We can just continue the transaction and the wrappers will be created when a user creates a new account.
    }

    // still, we update the schema version
    writeSessionSchemaVersion(targetVersion, db);
  })();
}

function updateToSessionSchemaVersion32(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 32;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);

  db.transaction(() => {
    db.exec(`CREATE INDEX messages_conversationId ON ${MESSAGES_TABLE} (
      conversationId
    );`);
    dropFtsAndTriggers(db);
    rebuildFtsTable(db);
    writeSessionSchemaVersion(targetVersion, db);
  })();

  console.log(`updateToSessionSchemaVersion${targetVersion}: success!`);
}

function fetchUserConfigDump(
  db: BetterSqlite3.Database,
  userPubkeyhex: string
): ConfigDumpRow | null {
  const userConfigWrapperDumps = db
    .prepare(
      `SELECT * FROM ${CONFIG_DUMP_TABLE} WHERE variant = $variant AND publicKey = $publicKey;`
    )
    .all({ variant: 'UserConfig', publicKey: userPubkeyhex }) as Array<ConfigDumpRow>;

  if (!userConfigWrapperDumps || !userConfigWrapperDumps.length) {
    return null;
  }
  // we can only have one dump with the "UserConfig" variant and our pubkey
  return userConfigWrapperDumps[0];
}

function writeUserConfigDump(db: BetterSqlite3.Database, userPubkeyhex: string, dump: Uint8Array) {
  db.prepare(
    `INSERT OR REPLACE INTO ${CONFIG_DUMP_TABLE} (
            publicKey,
            variant,
            data
        ) values (
          $publicKey,
          $variant,
          $data
        );`
  ).run({
    publicKey: userPubkeyhex,
    variant: 'UserConfig',
    data: dump,
  });
}

function updateToSessionSchemaVersion33(currentVersion: number, db: BetterSqlite3.Database) {
  const targetVersion = 33;
  if (currentVersion >= targetVersion) {
    return;
  }

  console.log(`updateToSessionSchemaVersion${targetVersion}: starting...`);
  db.transaction(() => {
    db.exec(`ALTER TABLE ${CONVERSATIONS_TABLE} ADD COLUMN blocksSogsMsgReqsTimestamp INTEGER;`);

    const loggedInUser = getLoggedInUserConvoDuringMigration(db);

    if (!loggedInUser?.ourKeys) {
      // no user loggedin was empty. Considering no users are logged in
      writeSessionSchemaVersion(targetVersion, db);
      return;
    }
    // a user is logged in, we want to enable the 'inbox' polling for sogs, only if the current userwrapper for that field is undefined
    const { privateEd25519, publicKeyHex } = loggedInUser.ourKeys;

    // Get existing config wrapper dump and update it
    const userConfigWrapperDump = fetchUserConfigDump(db, publicKeyHex);

    if (!userConfigWrapperDump) {
      writeSessionSchemaVersion(targetVersion, db);
      return;
    }
    const userConfigData = userConfigWrapperDump.data;
    const userProfileWrapper = new UserConfigWrapperNode(privateEd25519, userConfigData);

    let blindedReqEnabled = userProfileWrapper.getEnableBlindedMsgRequest();

    // if the value stored in the wrapper is undefined, we want to have blinded request enabled
    if (isNil(blindedReqEnabled)) {
      // this change will be part of the next ConfSyncJob (one is always made on app startup)
      userProfileWrapper.setEnableBlindedMsgRequest(true);
      writeUserConfigDump(db, publicKeyHex, userProfileWrapper.dump());
    }
    blindedReqEnabled = userProfileWrapper.getEnableBlindedMsgRequest();

    // update the item stored in the DB with that value too
    sqlNode.createOrUpdateItem(
      { id: SettingsKey.hasBlindedMsgRequestsEnabled, value: blindedReqEnabled },
      db
    );

    writeSessionSchemaVersion(targetVersion, db);
  })();
}

export function printTableColumns(table: string, db: BetterSqlite3.Database) {
  console.info(db.pragma(`table_info('${table}');`));
}

function writeSessionSchemaVersion(newVersion: number, db: BetterSqlite3.Database) {
  db.prepare(
    `INSERT INTO loki_schema(
        version
      ) values (
        $newVersion
      )`
  ).run({ newVersion });
}

export async function updateSessionSchema(db: BetterSqlite3.Database) {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name='loki_schema';`)
    .get();

  if (!result) {
    createSessionSchemaTable(db);
  }
  const lokiSchemaVersion = getSessionSchemaVersion(db);
  console.log(
    'updateSessionSchema:',
    `Current loki schema version: ${lokiSchemaVersion};`,
    `Most recent schema version: ${LOKI_SCHEMA_VERSIONS.length};`
  );
  for (let index = 0, max = LOKI_SCHEMA_VERSIONS.length; index < max; index += 1) {
    const runSchemaUpdate = LOKI_SCHEMA_VERSIONS[index];
    runSchemaUpdate(lokiSchemaVersion, db);
    if (index > lokiSchemaVersion && index - lokiSchemaVersion <= 3) {
      /** When running migrations, we block the node process.
       * This causes the app to be in a Not responding state when we have a lot of data.
       * To avoid this, we add a `sleep` between the run of the last 3 migrations.
       * This "only for the last 3 migrations" serves 2 purposes:
       * - we don't wait for `200ms * total number of migrations` when starting from schemaVersion 0
       * - we do have some time between the last 3 migrations, at most.
       *
       * This means that this sleepFor will only sleep for at most 600ms, even if we need to run 30 migrations.
       */
      // eslint-disable-next-line no-await-in-loop
      await sleepFor(200); // give some time for the UI to not freeze between 2 migrations
    }
  }
}
