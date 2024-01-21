"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rebuildFtsTable = exports.dropFtsAndTriggers = exports.assertValidConversationAttributes = exports.formatRowOfConversation = exports.toSqliteBoolean = exports.arrayStrToJson = exports.jsonToObject = exports.objectToJSON = exports.HEX_KEY = exports.LAST_HASHES_TABLE = exports.CLOSED_GROUP_V2_KEY_PAIRS_TABLE = exports.ATTACHMENT_DOWNLOADS_TABLE = exports.ITEMS_TABLE = exports.GUARD_NODE_TABLE = exports.IDENTITY_KEYS_TABLE = exports.OPEN_GROUP_ROOMS_V2_TABLE = exports.NODES_FOR_PUBKEY_TABLE = exports.MESSAGES_FTS_TABLE = exports.MESSAGES_TABLE = exports.CONVERSATIONS_TABLE = void 0;
const lodash_1 = require("lodash");
const conversationAttributes_1 = require("../models/conversationAttributes");
const sessionjs_logger_1 = require("../sessionjs-logger");
exports.CONVERSATIONS_TABLE = 'conversations';
exports.MESSAGES_TABLE = 'messages';
exports.MESSAGES_FTS_TABLE = 'messages_fts';
exports.NODES_FOR_PUBKEY_TABLE = 'nodesForPubkey';
exports.OPEN_GROUP_ROOMS_V2_TABLE = 'openGroupRoomsV2';
exports.IDENTITY_KEYS_TABLE = 'identityKeys';
exports.GUARD_NODE_TABLE = 'guardNodes';
exports.ITEMS_TABLE = 'items';
exports.ATTACHMENT_DOWNLOADS_TABLE = 'attachment_downloads';
exports.CLOSED_GROUP_V2_KEY_PAIRS_TABLE = 'encryptionKeyPairsForClosedGroupV2';
exports.LAST_HASHES_TABLE = 'lastHashes';
exports.HEX_KEY = /[^0-9A-Fa-f]/;
function objectToJSON(data) {
    return JSON.stringify(data);
}
exports.objectToJSON = objectToJSON;
function jsonToObject(json) {
    return JSON.parse(json);
}
exports.jsonToObject = jsonToObject;
function jsonToArray(json) {
    try {
        return JSON.parse(json);
    }
    catch (e) {
        sessionjs_logger_1.console.error('jsontoarray failed:', e.message);
        return [];
    }
}
function arrayStrToJson(arr) {
    return JSON.stringify(arr);
}
exports.arrayStrToJson = arrayStrToJson;
function toSqliteBoolean(val) {
    return val ? 1 : 0;
}
exports.toSqliteBoolean = toSqliteBoolean;
const allowedKeysFormatRowOfConversation = [
    'groupAdmins',
    'members',
    'zombies',
    'isTrustedForAttachmentDownload',
    'isApproved',
    'didApproveMe',
    'mentionedUs',
    'isKickedFromGroup',
    'left',
    'lastMessage',
    'lastMessageStatus',
    'triggerNotificationsFor',
    'unreadCount',
    'lastJoinedTimestamp',
    'expireTimer',
    'active_at',
    'id',
    'type',
    'avatarPointer',
    'avatarImageId',
    'nickname',
    'profileKey',
    'avatarInProfile',
    'displayNameInProfile',
    'conversationIdOrigin',
    'markedAsUnread',
    'blocksSogsMsgReqsTimestamp',
    'priority',
];
function formatRowOfConversation(row, from, unreadCount, mentionedUs) {
    if (!row) {
        return null;
    }
    const foundInRowButNotInAllowed = (0, lodash_1.difference)(Object.keys(row), allowedKeysFormatRowOfConversation);
    if (foundInRowButNotInAllowed?.length) {
        sessionjs_logger_1.console.error(`formatRowOfConversation: "from:${from}" foundInRowButNotInAllowed: `, foundInRowButNotInAllowed);
        throw new Error(`formatRowOfConversation: an invalid key was given in the record: ${foundInRowButNotInAllowed[0]}`);
    }
    const convo = (0, lodash_1.omit)(row, 'json');
    const minLengthNoParsing = 5;
    convo.groupAdmins =
        row.groupAdmins?.length && row.groupAdmins.length > minLengthNoParsing
            ? jsonToArray(row.groupAdmins)
            : [];
    convo.members =
        row.members?.length && row.members.length > minLengthNoParsing ? jsonToArray(row.members) : [];
    convo.zombies =
        row.zombies?.length && row.zombies.length > minLengthNoParsing ? jsonToArray(row.zombies) : [];
    convo.isTrustedForAttachmentDownload = Boolean(convo.isTrustedForAttachmentDownload);
    convo.isApproved = Boolean(convo.isApproved);
    convo.didApproveMe = Boolean(convo.didApproveMe);
    convo.isKickedFromGroup = Boolean(convo.isKickedFromGroup);
    convo.left = Boolean(convo.left);
    convo.markedAsUnread = Boolean(convo.markedAsUnread);
    convo.priority = convo.priority || conversationAttributes_1.CONVERSATION_PRIORITIES.default;
    if (!convo.conversationIdOrigin) {
        convo.conversationIdOrigin = undefined;
    }
    if (!convo.lastMessage) {
        convo.lastMessage = null;
    }
    if (!convo.lastMessageStatus) {
        convo.lastMessageStatus = undefined;
    }
    if (!(0, lodash_1.isNumber)(convo.blocksSogsMsgReqsTimestamp)) {
        convo.blocksSogsMsgReqsTimestamp = 0;
    }
    if (!convo.triggerNotificationsFor) {
        convo.triggerNotificationsFor = 'all';
    }
    if (!convo.lastJoinedTimestamp) {
        convo.lastJoinedTimestamp = 0;
    }
    if (!convo.expireTimer) {
        convo.expireTimer = 0;
    }
    if (!convo.active_at) {
        convo.active_at = 0;
    }
    return {
        ...convo,
        mentionedUs,
        unreadCount,
    };
}
exports.formatRowOfConversation = formatRowOfConversation;
const allowedKeysOfConversationAttributes = [
    'groupAdmins',
    'members',
    'zombies',
    'isTrustedForAttachmentDownload',
    'isApproved',
    'didApproveMe',
    'isKickedFromGroup',
    'left',
    'lastMessage',
    'lastMessageStatus',
    'triggerNotificationsFor',
    'lastJoinedTimestamp',
    'expireTimer',
    'active_at',
    'id',
    'type',
    'avatarPointer',
    'avatarImageId',
    'nickname',
    'profileKey',
    'avatarInProfile',
    'displayNameInProfile',
    'conversationIdOrigin',
    'markedAsUnread',
    'blocksSogsMsgReqsTimestamp',
    'priority',
];
const allowedKeysButNotSavedToDb = ['mentionedUs', 'unreadCount'];
const allowedKeysTogether = [...allowedKeysOfConversationAttributes, ...allowedKeysButNotSavedToDb];
function assertValidConversationAttributes(data) {
    const foundInAttributesButNotInAllowed = (0, lodash_1.difference)(Object.keys(data), allowedKeysTogether);
    if (foundInAttributesButNotInAllowed?.length) {
        sessionjs_logger_1.console.error(`assertValidConversationAttributes: an invalid key was given in the record: ${foundInAttributesButNotInAllowed}`);
    }
    return (0, lodash_1.pick)(data, allowedKeysOfConversationAttributes);
}
exports.assertValidConversationAttributes = assertValidConversationAttributes;
function dropFtsAndTriggers(db) {
    sessionjs_logger_1.console.info('dropping fts5 table');
    db.exec(`
        DROP TRIGGER IF EXISTS messages_on_insert;
        DROP TRIGGER IF EXISTS messages_on_delete;
        DROP TRIGGER IF EXISTS messages_on_update;
        DROP TABLE IF EXISTS ${exports.MESSAGES_FTS_TABLE};
      `);
}
exports.dropFtsAndTriggers = dropFtsAndTriggers;
function rebuildFtsTable(db) {
    sessionjs_logger_1.console.info('rebuildFtsTable');
    db.exec(`
          -- Then we create our full-text search table and populate it
          CREATE VIRTUAL TABLE ${exports.MESSAGES_FTS_TABLE}
            USING fts5(body);
          INSERT INTO ${exports.MESSAGES_FTS_TABLE}(rowid, body)
            SELECT rowid, body FROM ${exports.MESSAGES_TABLE};
          -- Then we set up triggers to keep the full-text search table up to date
          CREATE TRIGGER messages_on_insert AFTER INSERT ON ${exports.MESSAGES_TABLE} BEGIN
            INSERT INTO ${exports.MESSAGES_FTS_TABLE} (
              rowid,
              body
            ) VALUES (
              new.rowid,
              new.body
            );
          END;
          CREATE TRIGGER messages_on_delete AFTER DELETE ON ${exports.MESSAGES_TABLE} BEGIN
            DELETE FROM ${exports.MESSAGES_FTS_TABLE} WHERE rowid = old.rowid;
          END;
          CREATE TRIGGER messages_on_update AFTER UPDATE ON ${exports.MESSAGES_TABLE} WHEN new.body <> old.body BEGIN
            DELETE FROM ${exports.MESSAGES_FTS_TABLE} WHERE rowid = old.rowid;
            INSERT INTO ${exports.MESSAGES_FTS_TABLE}(
              rowid,
              body
            ) VALUES (
              new.rowid,
              new.body
            );
          END;
          `);
    sessionjs_logger_1.console.info('rebuildFtsTable built');
}
exports.rebuildFtsTable = rebuildFtsTable;
