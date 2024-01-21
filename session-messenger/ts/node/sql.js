"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sqlNode = exports.close = exports.getIdentityKeys = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const rimraf_1 = __importDefault(require("rimraf"));
const sessionjs_logger_1 = require("../sessionjs-logger");
const libsodium_wrappers_sumo_1 = require("libsodium-wrappers-sumo");
const lodash_1 = require("lodash");
const privacy_1 = require("../util/privacy");
const database_utility_1 = require("./database_utility");
const sqlSharedTypes_1 = require("../types/sqlSharedTypes");
const settings_key_1 = require("../data/settings-key");
const signalMigrations_1 = require("./migration/signalMigrations");
const config_dump_1 = require("./sql_calls/config_dump");
const sqlInstance_1 = require("./sqlInstance");
const MAX_PUBKEYS_MEMBERS = 300;
function getSQLIntegrityCheck(db) {
    const checkResult = db.pragma('quick_check', { simple: true });
    if (checkResult !== 'ok') {
        return checkResult;
    }
    return undefined;
}
function openAndSetUpSQLCipher(filePath, { key }) {
    return (0, signalMigrations_1.openAndMigrateDatabase)(filePath, key);
}
function setSQLPassword(password) {
    if (!(0, sqlInstance_1.assertGlobalInstance)()) {
        throw new Error('setSQLPassword: db is not initialized');
    }
    const deriveKey = database_utility_1.HEX_KEY.test(password);
    const value = deriveKey ? `'${password}'` : `"x'${password}'"`;
    (0, sqlInstance_1.assertGlobalInstance)().pragma(`rekey = ${value}`);
}
function vacuumDatabase(db) {
    if (!db) {
        throw new Error('vacuum: db is not initialized');
    }
    const start = Date.now();
    sessionjs_logger_1.console.info('Vacuuming DB. This might take a while.');
    db.exec('VACUUM;');
    sessionjs_logger_1.console.info(`Vacuuming DB Finished in ${Date.now() - start}ms.`);
}
let databaseFilePath;
function _initializePaths(configDir) {
    const dbDir = path_1.default.join(configDir, 'sql');
    fs_1.default.mkdirSync(dbDir, { recursive: true });
    sessionjs_logger_1.console.info('Made sure db folder exists at:', dbDir);
    databaseFilePath = path_1.default.join(dbDir, 'db.sqlite');
}
function showFailedToStart() {
    sessionjs_logger_1.console.error('Session failed to start', 'Please start from terminal and open a github issue');
}
async function initializeSql({ configDir, key, messages, passwordAttempt, }) {
    sessionjs_logger_1.console.info('initializeSql sqlnode');
    if ((0, sqlInstance_1.isInstanceInitialized)()) {
        throw new Error('Cannot initialize more than once!');
    }
    if (!(0, lodash_1.isString)(configDir)) {
        throw new Error('initialize: configDir is required!');
    }
    if (!(0, lodash_1.isString)(key)) {
        throw new Error('initialize: key is required!');
    }
    if (!(0, lodash_1.isObject)(messages)) {
        throw new Error('initialize: message is required!');
    }
    _initializePaths(configDir);
    let db;
    try {
        if (!databaseFilePath) {
            throw new Error('databaseFilePath is not set');
        }
        db = openAndSetUpSQLCipher(databaseFilePath, { key });
        if (!db) {
            throw new Error('db is not set');
        }
        await (0, signalMigrations_1.updateSchema)(db);
        const cipherIntegrityResult = (0, signalMigrations_1.getSQLCipherIntegrityCheck)(db);
        if (cipherIntegrityResult) {
            sessionjs_logger_1.console.log('Database cipher integrity check failed:', cipherIntegrityResult);
            throw new Error(`Cipher integrity check failed: ${cipherIntegrityResult}`);
        }
        const integrityResult = getSQLIntegrityCheck(db);
        if (integrityResult) {
            sessionjs_logger_1.console.log('Database integrity check failed:', integrityResult);
            throw new Error(`Integrity check failed: ${integrityResult}`);
        }
        (0, sqlInstance_1.initDbInstanceWith)(db);
        sessionjs_logger_1.console.info('total message count before cleaning: ', getMessageCount());
        sessionjs_logger_1.console.info('total conversation count before cleaning: ', getConversationCount());
        cleanUpOldOpengroupsOnStart();
        cleanUpUnusedNodeForKeyEntriesOnStart();
        printDbStats();
        sessionjs_logger_1.console.info('total message count after cleaning: ', getMessageCount());
        sessionjs_logger_1.console.info('total conversation count after cleaning: ', getConversationCount());
        vacuumDatabase(db);
    }
    catch (error) {
        sessionjs_logger_1.console.error('error', error);
        if (passwordAttempt) {
            throw error;
        }
        sessionjs_logger_1.console.log('Database startup error:', error.stack);
        sessionjs_logger_1.console.error(`Database startup error:\n\n${(0, privacy_1.redactAll)(error.stack)}`);
        (0, sqlInstance_1.closeDbInstance)();
        showFailedToStart();
        process.exit(1);
        return false;
    }
    return true;
}
function removeDB(configDir = null) {
    if ((0, sqlInstance_1.isInstanceInitialized)()) {
        throw new Error('removeDB: Cannot erase database when it is open!');
    }
    if (!databaseFilePath && configDir) {
        _initializePaths(configDir);
    }
    if (databaseFilePath) {
        rimraf_1.default.sync(databaseFilePath);
        rimraf_1.default.sync(`${databaseFilePath}-shm`);
        rimraf_1.default.sync(`${databaseFilePath}-wal`);
    }
}
const PASS_HASH_ID = 'passHash';
function getPasswordHash() {
    const item = getItemById(PASS_HASH_ID);
    return item && item.value;
}
function savePasswordHash(hash) {
    if ((0, lodash_1.isEmpty)(hash)) {
        removePasswordHash();
        return;
    }
    const data = { id: PASS_HASH_ID, value: hash };
    createOrUpdateItem(data);
}
function removePasswordHash() {
    removeItemById(PASS_HASH_ID);
}
function getIdentityKeyById(id, instance) {
    return getById(database_utility_1.IDENTITY_KEYS_TABLE, id, instance);
}
function getGuardNodes() {
    const nodes = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT ed25519PubKey FROM ${database_utility_1.GUARD_NODE_TABLE};`)
        .all();
    if (!nodes) {
        return null;
    }
    return nodes;
}
function updateGuardNodes(nodes) {
    (0, sqlInstance_1.assertGlobalInstance)().transaction(() => {
        (0, sqlInstance_1.assertGlobalInstance)().exec(`DELETE FROM ${database_utility_1.GUARD_NODE_TABLE}`);
        nodes.map(edkey => (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`INSERT INTO ${database_utility_1.GUARD_NODE_TABLE} (
        ed25519PubKey
      ) values ($ed25519PubKey)`)
            .run({
            ed25519PubKey: edkey,
        }));
    })();
}
function createOrUpdateItem(data, instance) {
    createOrUpdate(database_utility_1.ITEMS_TABLE, data, instance);
}
function getItemById(id, instance) {
    return getById(database_utility_1.ITEMS_TABLE, id, instance);
}
function getAllItems() {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT json FROM ${database_utility_1.ITEMS_TABLE} ORDER BY id ASC;`)
        .all();
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
function removeItemById(id) {
    removeById(database_utility_1.ITEMS_TABLE, id);
}
function createOrUpdate(table, data, instance) {
    const { id } = data;
    if (!id) {
        throw new Error('createOrUpdate: Provided data did not have a truthy id');
    }
    (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance)
        .prepare(`INSERT OR REPLACE INTO ${table} (
      id,
      json
    ) values (
      $id,
      $json
    )`)
        .run({
        id,
        json: (0, database_utility_1.objectToJSON)(data),
    });
}
function getById(table, id, instance) {
    const row = (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance)
        .prepare(`SELECT * FROM ${table} WHERE id = $id;`)
        .get({
        id,
    });
    if (!row) {
        return null;
    }
    return (0, database_utility_1.jsonToObject)(row.json);
}
function removeById(table, id) {
    if (!Array.isArray(id)) {
        (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`DELETE FROM ${table} WHERE id = $id;`)
            .run({ id });
        return;
    }
    if (!id.length) {
        throw new Error('removeById: No ids to delete!');
    }
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`DELETE FROM ${table} WHERE id IN ( ${id.map(() => '?').join(', ')} );`)
        .run({ id });
}
function getSwarmNodesForPubkey(pubkey) {
    const row = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT * FROM ${database_utility_1.NODES_FOR_PUBKEY_TABLE} WHERE pubkey = $pubkey;`)
        .get({
        pubkey,
    });
    if (!row) {
        return [];
    }
    return (0, database_utility_1.jsonToObject)(row.json);
}
function updateSwarmNodesForPubkey(pubkey, snodeEdKeys) {
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`INSERT OR REPLACE INTO ${database_utility_1.NODES_FOR_PUBKEY_TABLE} (
        pubkey,
        json
        ) values (
          $pubkey,
          $json
          );`)
        .run({
        pubkey,
        json: (0, database_utility_1.objectToJSON)(snodeEdKeys),
    });
}
function getConversationCount() {
    const row = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT count(*) from ${database_utility_1.CONVERSATIONS_TABLE};`)
        .get();
    if (!row) {
        throw new Error(`getConversationCount: Unable to get count of ${database_utility_1.CONVERSATIONS_TABLE}`);
    }
    return row['count(*)'];
}
function saveConversation(data) {
    const formatted = (0, database_utility_1.assertValidConversationAttributes)(data);
    const { id, active_at, type, members, nickname, profileKey, zombies, left, expireTimer, lastMessageStatus, lastMessage, lastJoinedTimestamp, groupAdmins, isKickedFromGroup, avatarPointer, avatarImageId, triggerNotificationsFor, isTrustedForAttachmentDownload, isApproved, didApproveMe, avatarInProfile, displayNameInProfile, conversationIdOrigin, priority, markedAsUnread, blocksSogsMsgReqsTimestamp, } = formatted;
    const omited = (0, lodash_1.omit)(formatted);
    const keys = Object.keys(omited);
    const columnsCommaSeparated = keys.join(', ');
    const valuesArgs = keys.map(k => `$${k}`).join(', ');
    const maxLength = 300;
    const shortenedLastMessage = (0, lodash_1.isString)(lastMessage) && lastMessage.length > maxLength
        ? lastMessage.substring(0, maxLength)
        : lastMessage;
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`INSERT OR REPLACE INTO ${database_utility_1.CONVERSATIONS_TABLE} (
	${columnsCommaSeparated}
	) values (
	   ${valuesArgs}
      )`)
        .run({
        id,
        active_at,
        type,
        members: members && members.length ? (0, database_utility_1.arrayStrToJson)(members) : '[]',
        nickname,
        profileKey,
        zombies: zombies && zombies.length ? (0, database_utility_1.arrayStrToJson)(zombies) : '[]',
        left: (0, database_utility_1.toSqliteBoolean)(left),
        expireTimer,
        lastMessageStatus,
        lastMessage: shortenedLastMessage,
        lastJoinedTimestamp,
        groupAdmins: groupAdmins && groupAdmins.length ? (0, database_utility_1.arrayStrToJson)(groupAdmins) : '[]',
        isKickedFromGroup: (0, database_utility_1.toSqliteBoolean)(isKickedFromGroup),
        avatarPointer,
        avatarImageId,
        triggerNotificationsFor,
        isTrustedForAttachmentDownload: (0, database_utility_1.toSqliteBoolean)(isTrustedForAttachmentDownload),
        priority,
        isApproved: (0, database_utility_1.toSqliteBoolean)(isApproved),
        didApproveMe: (0, database_utility_1.toSqliteBoolean)(didApproveMe),
        avatarInProfile,
        displayNameInProfile,
        conversationIdOrigin,
        markedAsUnread: (0, database_utility_1.toSqliteBoolean)(markedAsUnread),
        blocksSogsMsgReqsTimestamp,
    });
    return fetchConvoMemoryDetails(id);
}
function fetchConvoMemoryDetails(convoId) {
    const hasMentionedUsUnread = !!getFirstUnreadMessageWithMention(convoId);
    const unreadCount = getUnreadCountByConversation(convoId);
    const lastReadTimestampMessageSentTimestamp = getLastMessageReadInConversation(convoId);
    return {
        mentionedUs: hasMentionedUsUnread,
        unreadCount,
        lastReadTimestampMessage: lastReadTimestampMessageSentTimestamp,
    };
}
function removeConversation(id) {
    if (!Array.isArray(id)) {
        (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`DELETE FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE id = $id;`)
            .run({
            id,
        });
        return;
    }
    if (!id.length) {
        throw new Error('removeConversation: No ids to delete!');
    }
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`DELETE FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE id IN ( ${id.map(() => '?').join(', ')} );`)
        .run(id);
}
function getIdentityKeys(db) {
    const row = db.prepare(`SELECT * FROM ${database_utility_1.ITEMS_TABLE} WHERE id = $id;`).get({
        id: 'identityKey',
    });
    if (!row) {
        return null;
    }
    try {
        const parsedIdentityKey = (0, database_utility_1.jsonToObject)(row.json);
        if (!parsedIdentityKey?.value?.pubKey ||
            !parsedIdentityKey?.value?.ed25519KeyPair?.privateKey) {
            return null;
        }
        const publicKeyBase64 = parsedIdentityKey?.value?.pubKey;
        const publicKeyHex = (0, libsodium_wrappers_sumo_1.to_hex)((0, libsodium_wrappers_sumo_1.from_base64)(publicKeyBase64, libsodium_wrappers_sumo_1.base64_variants.ORIGINAL));
        const ed25519PrivateKeyUintArray = parsedIdentityKey?.value?.ed25519KeyPair?.privateKey;
        const privateEd25519 = new Uint8Array(Object.values(ed25519PrivateKeyUintArray));
        if (!privateEd25519 || (0, lodash_1.isEmpty)(privateEd25519)) {
            return null;
        }
        return {
            publicKeyHex,
            privateEd25519,
        };
    }
    catch (e) {
        return null;
    }
}
exports.getIdentityKeys = getIdentityKeys;
function getUsBlindedInThatServerIfNeeded(convoId, instance) {
    const usNaked = getIdentityKeys((0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance))?.publicKeyHex;
    if (!usNaked) {
        return undefined;
    }
    const room = getV2OpenGroupRoom(convoId, instance);
    if (!room || !(0, sqlSharedTypes_1.roomHasBlindEnabled)(room) || !room.serverPublicKey) {
        return usNaked;
    }
    const blinded = getItemById(settings_key_1.KNOWN_BLINDED_KEYS_ITEM, instance);
    try {
        const allBlinded = JSON.parse(blinded?.value);
        const found = allBlinded.find((m) => m.serverPublicKey === room.serverPublicKey && m.realSessionId === usNaked);
        const blindedId = found?.blindedId;
        return (0, lodash_1.isString)(blindedId) ? blindedId : usNaked;
    }
    catch (e) {
        sessionjs_logger_1.console.error('getUsBlindedInThatServerIfNeeded failed with ', e.message);
    }
    return usNaked;
}
function getConversationById(id, instance) {
    const row = (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance)
        .prepare(`SELECT * FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE id = $id;`)
        .get({
        id,
    });
    const unreadCount = getUnreadCountByConversation(id, instance) || 0;
    const mentionedUsStillUnread = !!getFirstUnreadMessageWithMention(id, instance);
    return (0, database_utility_1.formatRowOfConversation)(row, 'getConversationById', unreadCount, mentionedUsStillUnread);
}
function getAllConversations() {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT * FROM ${database_utility_1.CONVERSATIONS_TABLE} ORDER BY id ASC;`)
        .all();
    const formatted = (0, lodash_1.compact)((rows || []).map(m => {
        const unreadCount = getUnreadCountByConversation(m.id) || 0;
        const mentionedUsStillUnread = !!getFirstUnreadMessageWithMention(m.id);
        return (0, database_utility_1.formatRowOfConversation)(m, 'getAllConversations', unreadCount, mentionedUsStillUnread);
    }));
    const invalidOnLoad = formatted.filter(m => {
        return (0, lodash_1.isString)(m.id) && m.id.startsWith('05') && m.id.includes(' ');
    });
    if (!(0, lodash_1.isEmpty)(invalidOnLoad)) {
        const idsInvalid = invalidOnLoad.map(m => m.id);
        sessionjs_logger_1.console.info('getAllConversations removing those conversations with invalid ids before load', idsInvalid);
        removeConversation(idsInvalid);
    }
    return (0, lodash_1.differenceBy)(formatted, invalidOnLoad, c => c.id);
}
function getPubkeysInPublicConversation(conversationId) {
    const conversation = getV2OpenGroupRoom(conversationId);
    if (!conversation) {
        return [];
    }
    const hasBlindOn = Boolean(conversation.capabilities &&
        (0, lodash_1.isArray)(conversation.capabilities) &&
        conversation.capabilities?.includes('blind'));
    const whereClause = hasBlindOn ? "AND source LIKE '15%'" : '';
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT DISTINCT source FROM ${database_utility_1.MESSAGES_TABLE} WHERE
    conversationId = $conversationId ${whereClause}
   ORDER BY received_at DESC LIMIT ${MAX_PUBKEYS_MEMBERS};`)
        .all({
        conversationId,
    });
    return (0, lodash_1.map)(rows, row => row.source);
}
function searchConversations(query) {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT * FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE
      (
        displayNameInProfile LIKE $displayNameInProfile OR
        nickname LIKE $nickname
      ) AND active_at > 0
     ORDER BY active_at DESC
     LIMIT $limit`)
        .all({
        displayNameInProfile: `%${query}%`,
        nickname: `%${query}%`,
        limit: 50,
    });
    return (rows || []).map(m => {
        const unreadCount = getUnreadCountByConversation(m.id);
        const mentionedUsStillUnread = !!getFirstUnreadMessageWithMention(m.id);
        const formatted = (0, database_utility_1.formatRowOfConversation)(m, 'searchConversations', unreadCount, mentionedUsStillUnread);
        return formatted;
    });
}
const orderByMessageCoalesceClause = `ORDER BY COALESCE(${database_utility_1.MESSAGES_TABLE}.serverTimestamp, ${database_utility_1.MESSAGES_TABLE}.sent_at, ${database_utility_1.MESSAGES_TABLE}.received_at) DESC`;
function searchMessages(query, limit) {
    if (!limit) {
        throw new Error('searchMessages limit must be set');
    }
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT
      ${database_utility_1.MESSAGES_TABLE}.json,
      snippet(${database_utility_1.MESSAGES_FTS_TABLE}, -1, '<<left>>', '<<right>>', '...', 5) as snippet
    FROM ${database_utility_1.MESSAGES_FTS_TABLE}
    INNER JOIN ${database_utility_1.MESSAGES_TABLE} on ${database_utility_1.MESSAGES_FTS_TABLE}.rowid = ${database_utility_1.MESSAGES_TABLE}.rowid
    WHERE
     ${database_utility_1.MESSAGES_FTS_TABLE}.body match $query
    ${orderByMessageCoalesceClause}
    LIMIT $limit;`)
        .all({
        query,
        limit,
    });
    return (0, lodash_1.map)(rows, row => ({
        ...(0, database_utility_1.jsonToObject)(row.json),
        snippet: row.snippet,
    }));
}
function searchMessagesInConversation(query, conversationId, limit) {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT
      ${database_utility_1.MESSAGES_TABLE}.json,
      snippet(${database_utility_1.MESSAGES_FTS_TABLE}, -1, '<<left>>', '<<right>>', '...', 15) as snippet
    FROM ${database_utility_1.MESSAGES_FTS_TABLE}
    INNER JOIN ${database_utility_1.MESSAGES_TABLE} on ${database_utility_1.MESSAGES_FTS_TABLE}.id = ${database_utility_1.MESSAGES_TABLE}.id
    WHERE
    ${database_utility_1.MESSAGES_FTS_TABLE} match $query AND
      ${database_utility_1.MESSAGES_TABLE}.conversationId = $conversationId
    ${orderByMessageCoalesceClause}
      LIMIT $limit;`)
        .all({
        query,
        conversationId,
        limit: limit || 100,
    });
    return (0, lodash_1.map)(rows, row => ({
        ...(0, database_utility_1.jsonToObject)(row.json),
        snippet: row.snippet,
    }));
}
function getMessageCount() {
    const row = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT count(*) from ${database_utility_1.MESSAGES_TABLE};`)
        .get();
    if (!row) {
        throw new Error(`getMessageCount: Unable to get count of ${database_utility_1.MESSAGES_TABLE}`);
    }
    return row['count(*)'];
}
function saveMessage(data) {
    const { body, conversationId, expires_at, hasAttachments, hasFileAttachments, hasVisualMediaAttachments, id, serverId, serverTimestamp, received_at, sent, sent_at, source, type, unread, expireTimer, expirationStartTimestamp, } = data;
    if (!id) {
        throw new Error('id is required');
    }
    if (!conversationId) {
        throw new Error('conversationId is required');
    }
    const payload = {
        id,
        json: (0, database_utility_1.objectToJSON)(data),
        serverId,
        serverTimestamp,
        body,
        conversationId,
        expirationStartTimestamp,
        expires_at,
        expireTimer,
        hasAttachments,
        hasFileAttachments,
        hasVisualMediaAttachments,
        received_at,
        sent,
        sent_at,
        source,
        type: type || '',
        unread,
    };
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`INSERT OR REPLACE INTO ${database_utility_1.MESSAGES_TABLE} (
    id,
    json,
    serverId,
    serverTimestamp,
    body,
    conversationId,
    expirationStartTimestamp,
    expires_at,
    expireTimer,
    hasAttachments,
    hasFileAttachments,
    hasVisualMediaAttachments,
    received_at,
    sent,
    sent_at,
    source,
    type,
    unread
  ) values (
    $id,
    $json,
    $serverId,
    $serverTimestamp,
    $body,
    $conversationId,
    $expirationStartTimestamp,
    $expires_at,
    $expireTimer,
    $hasAttachments,
    $hasFileAttachments,
    $hasVisualMediaAttachments,
    $received_at,
    $sent,
    $sent_at,
    $source,
    $type,
    $unread
  );`)
        .run(payload);
    return id;
}
function saveSeenMessageHashes(arrayOfHashes) {
    (0, sqlInstance_1.assertGlobalInstance)().transaction(() => {
        (0, lodash_1.map)(arrayOfHashes, saveSeenMessageHash);
    })();
}
function updateLastHash(data) {
    const { convoId, snode, hash, expiresAt, namespace } = data;
    if (!(0, lodash_1.isNumber)(namespace)) {
        throw new Error('updateLastHash: namespace must be set to a number');
    }
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`INSERT OR REPLACE INTO ${database_utility_1.LAST_HASHES_TABLE} (
      id,
      snode,
      hash,
      expiresAt,
      namespace
    ) values (
      $id,
      $snode,
      $hash,
      $expiresAt,
      $namespace
    )`)
        .run({
        id: convoId,
        snode,
        hash,
        expiresAt,
        namespace,
    });
}
function saveSeenMessageHash(data) {
    const { expiresAt, hash } = data;
    try {
        (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`INSERT INTO seenMessages (
      expiresAt,
      hash
      ) values (
        $expiresAt,
        $hash
        );`)
            .run({
            expiresAt,
            hash,
        });
    }
    catch (e) {
        sessionjs_logger_1.console.error('saveSeenMessageHash failed:', e.message);
    }
}
function cleanLastHashes() {
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`DELETE FROM ${database_utility_1.LAST_HASHES_TABLE} WHERE expiresAt <= $now;`)
        .run({
        now: Date.now(),
    });
}
function cleanSeenMessages() {
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare('DELETE FROM seenMessages WHERE expiresAt <= $now;')
        .run({
        now: Date.now(),
    });
}
function saveMessages(arrayOfMessages) {
    sessionjs_logger_1.console.info('saveMessages of length: ', arrayOfMessages.length);
    (0, sqlInstance_1.assertGlobalInstance)().transaction(() => {
        (0, lodash_1.map)(arrayOfMessages, saveMessage);
    })();
}
function removeMessage(id, instance) {
    if (!(0, lodash_1.isString)(id)) {
        throw new Error('removeMessage: only takes single message to delete!');
        return;
    }
    (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance)
        .prepare(`DELETE FROM ${database_utility_1.MESSAGES_TABLE} WHERE id = $id;`)
        .run({ id });
}
function removeMessagesByIds(ids, instance) {
    if (!Array.isArray(ids)) {
        throw new Error('removeMessagesByIds only allowed an array of strings');
    }
    if (!ids.length) {
        throw new Error('removeMessagesByIds: No ids to delete!');
    }
    const start = Date.now();
    (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance)
        .prepare(`DELETE FROM ${database_utility_1.MESSAGES_TABLE} WHERE id IN ( ${ids.map(() => '?').join(', ')} );`)
        .run(ids);
    sessionjs_logger_1.console.log(`removeMessagesByIds of length ${ids.length} took ${Date.now() - start}ms`);
}
function removeAllMessagesInConversation(conversationId, instance) {
    if (!conversationId) {
        return;
    }
    const inst = (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance);
    inst
        .prepare(`DELETE FROM ${database_utility_1.MESSAGES_TABLE} WHERE conversationId = $conversationId`)
        .run({ conversationId });
}
function getMessageIdsFromServerIds(serverIds, conversationId) {
    if (!Array.isArray(serverIds)) {
        return [];
    }
    const validServerIds = serverIds.map(Number).filter(n => !Number.isNaN(n));
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT id FROM ${database_utility_1.MESSAGES_TABLE} WHERE
    serverId IN (${validServerIds.join(',')}) AND
    conversationId = $conversationId;`)
        .all({
        conversationId,
    });
    return rows.map(row => row.id);
}
function getMessageById(id) {
    const row = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT * FROM ${database_utility_1.MESSAGES_TABLE} WHERE id = $id;`)
        .get({
        id,
    });
    if (!row) {
        return null;
    }
    return (0, database_utility_1.jsonToObject)(row.json);
}
function getMessageByServerId(conversationId, serverId) {
    const row = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT * FROM ${database_utility_1.MESSAGES_TABLE} WHERE conversationId = $conversationId AND serverId = $serverId;`)
        .get({
        conversationId,
        serverId,
    });
    if (!row) {
        return null;
    }
    return (0, database_utility_1.jsonToObject)(row.json);
}
function getMessagesCountBySender({ source }) {
    if (!source) {
        throw new Error('source must be set');
    }
    const count = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT count(*) FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      source = $source;`)
        .get({
        source,
    });
    if (!count) {
        return 0;
    }
    return count['count(*)'] || 0;
}
function getMessagesBySenderAndSentAt(propsList) {
    const db = (0, sqlInstance_1.assertGlobalInstance)();
    const rows = [];
    for (const msgProps of propsList) {
        const { source, timestamp } = msgProps;
        const _rows = db
            .prepare(`SELECT json FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      source = $source AND
      sent_at = $timestamp;`)
            .all({
            source,
            timestamp,
        });
        rows.push(..._rows);
    }
    return (0, lodash_1.uniq)((0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json)));
}
function filterAlreadyFetchedOpengroupMessage(msgDetails) {
    const filteredNonBlinded = msgDetails.filter(msg => {
        const rows = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`SELECT source, serverTimestamp  FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      source = $sender AND
      serverTimestamp = $serverTimestamp;`)
            .all({
            sender: msg.sender,
            serverTimestamp: msg.serverTimestamp,
        });
        if (rows.length) {
            sessionjs_logger_1.console.info(`filtering out already received sogs message from ${msg.sender} at ${msg.serverTimestamp} `);
            return false;
        }
        return true;
    });
    return filteredNonBlinded;
}
function getUnreadByConversation(conversationId, sentBeforeTimestamp) {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT * FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      unread = $unread AND
      conversationId = $conversationId AND
      COALESCE(serverTimestamp, sent_at) <= $sentBeforeTimestamp
     ${orderByClauseASC};`)
        .all({
        unread: (0, database_utility_1.toSqliteBoolean)(true),
        conversationId,
        sentBeforeTimestamp,
    });
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
function markAllAsReadByConversationNoExpiration(conversationId, returnMessagesUpdated) {
    let toReturn = [];
    if (returnMessagesUpdated) {
        const messagesUnreadBefore = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`SELECT json FROM ${database_utility_1.MESSAGES_TABLE} WHERE
  unread = $unread AND
  conversationId = $conversationId;`)
            .all({
            unread: (0, database_utility_1.toSqliteBoolean)(true),
            conversationId,
        });
        toReturn = (0, lodash_1.compact)(messagesUnreadBefore.map(row => (0, database_utility_1.jsonToObject)(row.json).sent_at));
    }
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`UPDATE ${database_utility_1.MESSAGES_TABLE} SET
      unread = 0, json = json_set(json, '$.unread', 0)
      WHERE unread = $unread AND
      conversationId = $conversationId;`)
        .run({
        unread: (0, database_utility_1.toSqliteBoolean)(true),
        conversationId,
    });
    return toReturn;
}
function getUnreadCountByConversation(conversationId, instance) {
    const row = (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance)
        .prepare(`SELECT count(*) FROM ${database_utility_1.MESSAGES_TABLE} WHERE
    unread = $unread AND
    conversationId = $conversationId;`)
        .get({
        unread: (0, database_utility_1.toSqliteBoolean)(true),
        conversationId,
    });
    if (!row) {
        throw new Error(`Unable to get unread count of ${conversationId}`);
    }
    return row['count(*)'];
}
function getMessageCountByType(conversationId, type = '%') {
    const row = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT count(*) from ${database_utility_1.MESSAGES_TABLE}
      WHERE conversationId = $conversationId
      AND type = $type;`)
        .get({
        conversationId,
        type,
    });
    if (!row) {
        throw new Error(`getIncomingMessagesCountByConversation: Unable to get incoming messages count of ${conversationId}`);
    }
    return row['count(*)'];
}
const orderByClause = 'ORDER BY COALESCE(serverTimestamp, sent_at, received_at) DESC';
const orderByClauseASC = 'ORDER BY COALESCE(serverTimestamp, sent_at, received_at) ASC';
function getMessagesByConversation(conversationId, { messageId = null, returnQuotes = false } = {}) {
    const absLimit = 30;
    const firstUnread = getFirstUnreadMessageIdInConversation(conversationId);
    const numberOfMessagesInConvo = getMessagesCountByConversation(conversationId);
    const floorLoadAllMessagesInConvo = 70;
    let messages = [];
    let quotes = [];
    if (messageId || firstUnread) {
        const messageFound = getMessageById(messageId || firstUnread);
        if (messageFound && messageFound.conversationId === conversationId) {
            const start = Date.now();
            const msgTimestamp = messageFound.serverTimestamp || messageFound.sent_at || messageFound.received_at;
            const commonArgs = {
                conversationId,
                msgTimestamp,
                limit: numberOfMessagesInConvo < floorLoadAllMessagesInConvo
                    ? floorLoadAllMessagesInConvo
                    : absLimit,
            };
            const messagesBefore = (0, sqlInstance_1.assertGlobalInstance)()
                .prepare(`SELECT id, conversationId, json
            FROM ${database_utility_1.MESSAGES_TABLE} WHERE conversationId = $conversationId AND COALESCE(serverTimestamp, sent_at, received_at) <= $msgTimestamp
            ${orderByClause}
            LIMIT $limit`)
                .all(commonArgs);
            const messagesAfter = (0, sqlInstance_1.assertGlobalInstance)()
                .prepare(`SELECT id, conversationId, json
            FROM ${database_utility_1.MESSAGES_TABLE} WHERE conversationId = $conversationId AND COALESCE(serverTimestamp, sent_at, received_at) > $msgTimestamp
            ${orderByClauseASC}
            LIMIT $limit`)
                .all(commonArgs);
            sessionjs_logger_1.console.info(`getMessagesByConversation around took ${Date.now() - start}ms `);
            messages = (0, lodash_1.map)([...messagesBefore, ...messagesAfter], row => (0, database_utility_1.jsonToObject)(row.json)).sort((a, b) => {
                return ((b.serverTimestamp || b.sent_at || b.received_at) -
                    (a.serverTimestamp || a.sent_at || a.received_at));
            });
        }
        sessionjs_logger_1.console.info(`getMessagesByConversation: Could not find messageId ${messageId} in db with conversationId: ${conversationId}. Just fetching the convo as usual.`);
    }
    else {
        const limit = numberOfMessagesInConvo < floorLoadAllMessagesInConvo
            ? floorLoadAllMessagesInConvo
            : absLimit * 2;
        const rows = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`
    SELECT json FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      conversationId = $conversationId
      ${orderByClause}
    LIMIT $limit;
    `)
            .all({
            conversationId,
            limit,
        });
        messages = (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
    }
    if (returnQuotes) {
        quotes = (0, lodash_1.uniq)(messages.filter(message => message.quote).map(message => message.quote));
    }
    return { messages, quotes };
}
function getLastMessagesByConversation(conversationId, limit) {
    if (!(0, lodash_1.isNumber)(limit)) {
        throw new Error('limit must be a number');
    }
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`
    SELECT json FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      conversationId = $conversationId
      ${orderByClause}
    LIMIT $limit;
    `)
        .all({
        conversationId,
        limit,
    });
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
function getOldestMessageInConversation(conversationId) {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`
    SELECT json FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      conversationId = $conversationId
      ${orderByClauseASC}
    LIMIT $limit;
    `)
        .all({
        conversationId,
        limit: 1,
    });
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
function hasConversationOutgoingMessage(conversationId) {
    const row = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`
    SELECT count(*)  FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      conversationId = $conversationId AND
      type IS 'outgoing'
    `)
        .get({
        conversationId,
    });
    if (!row) {
        throw new Error('hasConversationOutgoingMessage: Unable to get coun');
    }
    return Boolean(row['count(*)']);
}
function getFirstUnreadMessageIdInConversation(conversationId) {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`
    SELECT id FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      conversationId = $conversationId AND
      unread = $unread
      ORDER BY serverTimestamp ASC, serverId ASC, sent_at ASC, received_at ASC
    LIMIT 1;
    `)
        .all({
        conversationId,
        unread: (0, database_utility_1.toSqliteBoolean)(true),
    });
    if (rows.length === 0) {
        return undefined;
    }
    return rows[0].id;
}
function getLastMessageReadInConversation(conversationId) {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`
      SELECT MAX(MAX(COALESCE(serverTimestamp, 0)), MAX(COALESCE(sent_at, 0)) ) AS max_sent_at
      FROM ${database_utility_1.MESSAGES_TABLE} WHERE
        conversationId = $conversationId AND
        unread = $unread;
    `)
        .get({
        conversationId,
        unread: (0, database_utility_1.toSqliteBoolean)(false),
    });
    return rows?.max_sent_at || null;
}
function getFirstUnreadMessageWithMention(conversationId, instance) {
    const ourPkInThatConversation = getUsBlindedInThatServerIfNeeded(conversationId, instance);
    if (!ourPkInThatConversation || !ourPkInThatConversation.length) {
        throw new Error('getFirstUnreadMessageWithMention needs our pubkey but nothing was given');
    }
    const likeMatch = `%@${ourPkInThatConversation}%`;
    const rows = (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance)
        .prepare(`
    SELECT id FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      conversationId = $conversationId AND
      unread = $unread AND
      body LIKE $likeMatch
      ORDER BY serverTimestamp ASC, serverId ASC, sent_at ASC, received_at ASC
    LIMIT 1;
    `)
        .all({
        conversationId,
        unread: (0, database_utility_1.toSqliteBoolean)(true),
        likeMatch,
    });
    if (rows.length === 0) {
        return undefined;
    }
    return rows[0].id;
}
function getMessagesBySentAt(sentAt) {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT json FROM ${database_utility_1.MESSAGES_TABLE}
     WHERE sent_at = $sent_at
     ORDER BY received_at DESC;`)
        .all({
        sent_at: sentAt,
    });
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
function getLastHashBySnode(convoId, snode, namespace) {
    if (!(0, lodash_1.isNumber)(namespace)) {
        throw new Error('getLastHashBySnode: namespace must be set to a number');
    }
    const row = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT * FROM ${database_utility_1.LAST_HASHES_TABLE} WHERE snode = $snode AND id = $id AND namespace = $namespace;`)
        .get({
        snode,
        id: convoId,
        namespace,
    });
    if (!row) {
        return null;
    }
    return row.hash;
}
function getSeenMessagesByHashList(hashes) {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT * FROM seenMessages WHERE hash IN ( ${hashes.map(() => '?').join(', ')} );`)
        .all(hashes);
    return (0, lodash_1.map)(rows, row => row.hash);
}
function getExpiredMessages() {
    const now = Date.now();
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT json FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      expires_at IS NOT NULL AND
      expires_at <= $expires_at
     ORDER BY expires_at ASC;`)
        .all({
        expires_at: now,
    });
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
function getOutgoingWithoutExpiresAt() {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`
    SELECT json FROM ${database_utility_1.MESSAGES_TABLE}
    WHERE
      expireTimer > 0 AND
      expires_at IS NULL AND
      type IS 'outgoing'
    ORDER BY expires_at ASC;
  `)
        .all();
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
function getNextExpiringMessage() {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`
    SELECT json FROM ${database_utility_1.MESSAGES_TABLE}
    WHERE expires_at > 0
    ORDER BY expires_at ASC
    LIMIT 1;
  `)
        .all();
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
const unprocessed = {
    saveUnprocessed: (data) => {
        const { id, timestamp, version, attempts, envelope, senderIdentity, messageHash } = data;
        if (!id) {
            throw new Error(`saveUnprocessed: id was falsey: ${id}`);
        }
        (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`INSERT OR REPLACE INTO unprocessed (
        id,
        timestamp,
        version,
        attempts,
        envelope,
        senderIdentity,
        serverHash
      ) values (
        $id,
        $timestamp,
        $version,
        $attempts,
        $envelope,
        $senderIdentity,
        $messageHash
      );`)
            .run({
            id,
            timestamp,
            version,
            attempts,
            envelope,
            senderIdentity,
            messageHash,
        });
    },
    updateUnprocessedAttempts: (id, attempts) => {
        (0, sqlInstance_1.assertGlobalInstance)()
            .prepare('UPDATE unprocessed SET attempts = $attempts WHERE id = $id;')
            .run({
            id,
            attempts,
        });
    },
    updateUnprocessedWithData: (id, data) => {
        const { source, decrypted, senderIdentity } = data;
        (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`UPDATE unprocessed SET
        source = $source,
        decrypted = $decrypted,
        senderIdentity = $senderIdentity
      WHERE id = $id;`)
            .run({
            id,
            source,
            decrypted,
            senderIdentity,
        });
    },
    getUnprocessedById: (id) => {
        const row = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare('SELECT * FROM unprocessed WHERE id = $id;')
            .get({
            id,
        });
        return row;
    },
    getUnprocessedCount: () => {
        const row = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare('SELECT count(*) from unprocessed;')
            .get();
        if (!row) {
            throw new Error('getMessageCount: Unable to get count of unprocessed');
        }
        return row['count(*)'];
    },
    getAllUnprocessed: () => {
        const rows = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare('SELECT * FROM unprocessed ORDER BY timestamp ASC;')
            .all();
        return rows;
    },
    removeUnprocessed: (id) => {
        if (Array.isArray(id)) {
            sessionjs_logger_1.console.error('removeUnprocessed only supports single ids at a time');
            throw new Error('removeUnprocessed only supports single ids at a time');
        }
        (0, sqlInstance_1.assertGlobalInstance)()
            .prepare('DELETE FROM unprocessed WHERE id = $id;')
            .run({ id });
    },
    removeAllUnprocessed: () => {
        (0, sqlInstance_1.assertGlobalInstance)()
            .prepare('DELETE FROM unprocessed;')
            .run();
    },
};
function getNextAttachmentDownloadJobs(limit) {
    const timestamp = Date.now();
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT json FROM ${database_utility_1.ATTACHMENT_DOWNLOADS_TABLE}
    WHERE pending = 0 AND timestamp < $timestamp
    ORDER BY timestamp DESC
    LIMIT $limit;`)
        .all({
        limit,
        timestamp,
    });
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
function saveAttachmentDownloadJob(job) {
    const { id, pending, timestamp } = job;
    if (!id) {
        throw new Error('saveAttachmentDownloadJob: Provided job did not have a truthy id');
    }
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`INSERT OR REPLACE INTO ${database_utility_1.ATTACHMENT_DOWNLOADS_TABLE} (
      id,
      pending,
      timestamp,
      json
    ) values (
      $id,
      $pending,
      $timestamp,
      $json
    )`)
        .run({
        id,
        pending,
        timestamp,
        json: (0, database_utility_1.objectToJSON)(job),
    });
}
function setAttachmentDownloadJobPending(id, pending) {
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`UPDATE ${database_utility_1.ATTACHMENT_DOWNLOADS_TABLE} SET pending = $pending WHERE id = $id;`)
        .run({
        id,
        pending,
    });
}
function resetAttachmentDownloadPending() {
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`UPDATE ${database_utility_1.ATTACHMENT_DOWNLOADS_TABLE} SET pending = 0 WHERE pending != 0;`)
        .run();
}
function removeAttachmentDownloadJob(id) {
    removeById(database_utility_1.ATTACHMENT_DOWNLOADS_TABLE, id);
}
function removeAllAttachmentDownloadJobs() {
    (0, sqlInstance_1.assertGlobalInstance)().exec(`DELETE FROM ${database_utility_1.ATTACHMENT_DOWNLOADS_TABLE};`);
}
function removeAll() {
    (0, sqlInstance_1.assertGlobalInstance)().exec(`
    DELETE FROM ${database_utility_1.IDENTITY_KEYS_TABLE};
    DELETE FROM ${database_utility_1.ITEMS_TABLE};
    DELETE FROM unprocessed;
    DELETE FROM ${database_utility_1.LAST_HASHES_TABLE};
    DELETE FROM ${database_utility_1.NODES_FOR_PUBKEY_TABLE};
    DELETE FROM ${database_utility_1.CLOSED_GROUP_V2_KEY_PAIRS_TABLE};
    DELETE FROM seenMessages;
    DELETE FROM ${database_utility_1.CONVERSATIONS_TABLE};
    DELETE FROM ${database_utility_1.MESSAGES_TABLE};
    DELETE FROM ${database_utility_1.ATTACHMENT_DOWNLOADS_TABLE};
    DELETE FROM ${database_utility_1.MESSAGES_FTS_TABLE};
    DELETE FROM ${sqlSharedTypes_1.CONFIG_DUMP_TABLE};
`);
}
function removeAllConversations() {
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`DELETE FROM ${database_utility_1.CONVERSATIONS_TABLE};`)
        .run();
}
function getMessagesWithVisualMediaAttachments(conversationId, limit) {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT json FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      conversationId = $conversationId AND
      hasVisualMediaAttachments = 1
     ORDER BY received_at DESC
     LIMIT $limit;`)
        .all({
        conversationId,
        limit,
    });
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
function getMessagesWithFileAttachments(conversationId, limit) {
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT json FROM ${database_utility_1.MESSAGES_TABLE} WHERE
      conversationId = $conversationId AND
      hasFileAttachments = 1
     ORDER BY received_at DESC
     LIMIT $limit;`)
        .all({
        conversationId,
        limit,
    });
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
function getExternalFilesForMessage(message) {
    const { attachments, quote, preview } = message;
    const files = [];
    (0, lodash_1.forEach)(attachments, attachment => {
        const { path: file, thumbnail, screenshot } = attachment;
        if (file) {
            files.push(file);
        }
        if (thumbnail && thumbnail.path) {
            files.push(thumbnail.path);
        }
        if (screenshot && screenshot.path) {
            files.push(screenshot.path);
        }
    });
    if (quote && quote.attachments && quote.attachments.length) {
        (0, lodash_1.forEach)(quote.attachments, attachment => {
            const { thumbnail } = attachment;
            if (thumbnail && thumbnail.path) {
                files.push(thumbnail.path);
            }
        });
    }
    if (preview && preview.length) {
        (0, lodash_1.forEach)(preview, item => {
            const { image } = item;
            if (image && image.path) {
                files.push(image.path);
            }
        });
    }
    return files;
}
function getExternalFilesForConversation(conversationAvatar) {
    const files = [];
    if ((0, lodash_1.isString)(conversationAvatar)) {
        files.push(conversationAvatar);
    }
    if ((0, lodash_1.isObject)(conversationAvatar)) {
        const avatarObj = conversationAvatar;
        if ((0, lodash_1.isString)(avatarObj.path)) {
            files.push(avatarObj.path);
        }
    }
    return files;
}
function removeKnownAttachments(allAttachments) {
    const lookup = (0, lodash_1.fromPairs)((0, lodash_1.map)(allAttachments, file => [file, true]));
    const chunkSize = 50;
    const total = getMessageCount();
    sessionjs_logger_1.console.log(`removeKnownAttachments: About to iterate through ${total} messages`);
    let count = 0;
    let complete = false;
    let id = '';
    while (!complete) {
        const rows = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`SELECT json FROM ${database_utility_1.MESSAGES_TABLE}
       WHERE id > $id
       ORDER BY id ASC
       LIMIT $chunkSize;`)
            .all({
            id,
            chunkSize,
        });
        const messages = (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
        (0, lodash_1.forEach)(messages, message => {
            const externalFiles = getExternalFilesForMessage(message);
            (0, lodash_1.forEach)(externalFiles, file => {
                delete lookup[file];
            });
        });
        const lastMessage = (0, lodash_1.last)(messages);
        if (lastMessage) {
            ({ id } = lastMessage);
        }
        complete = messages.length < chunkSize;
        count += messages.length;
    }
    sessionjs_logger_1.console.log(`removeKnownAttachments: Done processing ${count} ${database_utility_1.MESSAGES_TABLE}`);
    complete = false;
    count = 0;
    id = 0;
    const conversationTotal = getConversationCount();
    sessionjs_logger_1.console.log(`removeKnownAttachments: About to iterate through ${conversationTotal} ${database_utility_1.CONVERSATIONS_TABLE}`);
    while (!complete) {
        const conversations = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`SELECT * FROM ${database_utility_1.CONVERSATIONS_TABLE}
       WHERE id > $id
       ORDER BY id ASC
       LIMIT $chunkSize;`)
            .all({
            id,
            chunkSize,
        });
        (0, lodash_1.forEach)(conversations, conversation => {
            const avatar = conversation?.avatarInProfile;
            const externalFiles = getExternalFilesForConversation(avatar);
            (0, lodash_1.forEach)(externalFiles, file => {
                delete lookup[file];
            });
        });
        const lastMessage = (0, lodash_1.last)(conversations);
        if (lastMessage) {
            ({ id } = lastMessage);
        }
        complete = conversations.length < chunkSize;
        count += conversations.length;
    }
    sessionjs_logger_1.console.log(`removeKnownAttachments: Done processing ${count} ${database_utility_1.CONVERSATIONS_TABLE}`);
    return Object.keys(lookup);
}
function getMessagesCountByConversation(conversationId, instance) {
    const row = (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance)
        .prepare(`SELECT count(*) from ${database_utility_1.MESSAGES_TABLE} WHERE conversationId = $conversationId;`)
        .get({ conversationId });
    return row ? row['count(*)'] : 0;
}
function getAllEncryptionKeyPairsForGroup(groupPublicKey, db) {
    const rows = getAllEncryptionKeyPairsForGroupRaw(groupPublicKey, db);
    return (0, lodash_1.map)(rows, row => (0, database_utility_1.jsonToObject)(row.json));
}
function getAllEncryptionKeyPairsForGroupRaw(groupPublicKey, db) {
    const pubkeyAsString = groupPublicKey.key
        ? groupPublicKey.key
        : groupPublicKey;
    const rows = (0, sqlInstance_1.assertGlobalInstanceOrInstance)(db)
        .prepare(`SELECT * FROM ${database_utility_1.CLOSED_GROUP_V2_KEY_PAIRS_TABLE} WHERE groupPublicKey = $groupPublicKey ORDER BY timestamp ASC;`)
        .all({
        groupPublicKey: pubkeyAsString,
    });
    return rows;
}
function getLatestClosedGroupEncryptionKeyPair(groupPublicKey, db) {
    const rows = getAllEncryptionKeyPairsForGroup(groupPublicKey, db);
    if (!rows || rows.length === 0) {
        return undefined;
    }
    return rows[rows.length - 1];
}
function addClosedGroupEncryptionKeyPair(groupPublicKey, keypair, instance) {
    const timestamp = Date.now();
    (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance)
        .prepare(`INSERT OR REPLACE INTO ${database_utility_1.CLOSED_GROUP_V2_KEY_PAIRS_TABLE} (
      groupPublicKey,
      timestamp,
        json
        ) values (
          $groupPublicKey,
          $timestamp,
          $json
          );`)
        .run({
        groupPublicKey,
        timestamp,
        json: (0, database_utility_1.objectToJSON)(keypair),
    });
}
function removeAllClosedGroupEncryptionKeyPairs(groupPublicKey) {
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`DELETE FROM ${database_utility_1.CLOSED_GROUP_V2_KEY_PAIRS_TABLE} WHERE groupPublicKey = $groupPublicKey`)
        .run({
        groupPublicKey,
    });
}
function getAllV2OpenGroupRooms(instance) {
    const rows = (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance)
        .prepare(`SELECT json FROM ${database_utility_1.OPEN_GROUP_ROOMS_V2_TABLE};`)
        .all();
    if (!rows) {
        return [];
    }
    return rows.map(r => (0, database_utility_1.jsonToObject)(r.json));
}
function getV2OpenGroupRoom(conversationId, db) {
    const row = (0, sqlInstance_1.assertGlobalInstanceOrInstance)(db)
        .prepare(`SELECT json FROM ${database_utility_1.OPEN_GROUP_ROOMS_V2_TABLE} WHERE conversationId = $conversationId;`)
        .get({
        conversationId,
    });
    if (!row) {
        return null;
    }
    return (0, database_utility_1.jsonToObject)(row.json);
}
function saveV2OpenGroupRoom(opengroupsv2Room, instance) {
    const { serverUrl, roomId, conversationId } = opengroupsv2Room;
    (0, sqlInstance_1.assertGlobalInstanceOrInstance)(instance)
        .prepare(`INSERT OR REPLACE INTO ${database_utility_1.OPEN_GROUP_ROOMS_V2_TABLE} (
      serverUrl,
      roomId,
      conversationId,
      json
    ) values (
      $serverUrl,
      $roomId,
      $conversationId,
      $json
    )`)
        .run({
        serverUrl,
        roomId,
        conversationId,
        json: (0, database_utility_1.objectToJSON)(opengroupsv2Room),
    });
}
function removeV2OpenGroupRoom(conversationId) {
    (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`DELETE FROM ${database_utility_1.OPEN_GROUP_ROOMS_V2_TABLE} WHERE conversationId = $conversationId`)
        .run({
        conversationId,
    });
}
function getEntriesCountInTable(tbl) {
    try {
        const row = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`SELECT count(*) from ${tbl};`)
            .get();
        return row['count(*)'];
    }
    catch (e) {
        sessionjs_logger_1.console.error(e);
        return 0;
    }
}
function printDbStats() {
    [
        'attachment_downloads',
        'conversations',
        'encryptionKeyPairsForClosedGroupV2',
        'guardNodes',
        'identityKeys',
        'items',
        'lastHashes',
        'loki_schema',
        'messages',
        'messages_fts',
        'messages_fts_config',
        'messages_fts_content',
        'messages_fts_data',
        'messages_fts_docsize',
        'messages_fts_idx',
        'nodesForPubkey',
        'openGroupRoomsV2',
        'seenMessages',
        'sqlite_sequence',
        'sqlite_stat1',
        'sqlite_stat4',
        'unprocessed',
    ].forEach(i => {
        sessionjs_logger_1.console.log(`${i} count`, getEntriesCountInTable(i));
    });
}
function cleanUpUnusedNodeForKeyEntriesOnStart() {
    const allIdsToKeep = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT id FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE id NOT LIKE 'http%'
    `)
        .all()
        .map(m => m.id) || [];
    const allEntriesInSnodeForPubkey = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT pubkey FROM ${database_utility_1.NODES_FOR_PUBKEY_TABLE};`)
        .all()
        .map(m => m.pubkey) || [];
    const swarmUnused = (0, lodash_1.difference)(allEntriesInSnodeForPubkey, allIdsToKeep);
    if (swarmUnused.length) {
        const start = Date.now();
        const chunks = (0, lodash_1.chunk)(swarmUnused, 500);
        chunks.forEach(ch => {
            (0, sqlInstance_1.assertGlobalInstance)()
                .prepare(`DELETE FROM ${database_utility_1.NODES_FOR_PUBKEY_TABLE} WHERE pubkey IN (${ch.map(() => '?').join(',')});`)
                .run(ch);
        });
        sessionjs_logger_1.console.log(`Removing of ${swarmUnused.length} unused swarms took ${Date.now() - start}ms`);
    }
}
function cleanUpMessagesJson() {
    sessionjs_logger_1.console.info('cleanUpMessagesJson ');
    const start = Date.now();
    (0, sqlInstance_1.assertGlobalInstance)().transaction(() => {
        (0, sqlInstance_1.assertGlobalInstance)().exec(`
      UPDATE ${database_utility_1.MESSAGES_TABLE} SET
      json = json_remove(json, '$.schemaVersion', '$.recipients', '$.decrypted_at', '$.sourceDevice')
    `);
    })();
    sessionjs_logger_1.console.info(`cleanUpMessagesJson took ${Date.now() - start}ms`);
}
function cleanUpOldOpengroupsOnStart() {
    const ourNumber = getItemById('number_id');
    if (!ourNumber || !ourNumber.value) {
        sessionjs_logger_1.console.info('cleanUpOldOpengroups: ourNumber is not set');
        return;
    }
    let pruneSetting = getItemById(settings_key_1.SettingsKey.settingsOpengroupPruning)?.value;
    if (pruneSetting === undefined) {
        sessionjs_logger_1.console.info('Prune settings is undefined (and not explicitly false), forcing it to true.');
        createOrUpdateItem({ id: settings_key_1.SettingsKey.settingsOpengroupPruning, value: true });
        pruneSetting = true;
    }
    if (!pruneSetting) {
        sessionjs_logger_1.console.info('Prune setting not enabled, skipping cleanUpOldOpengroups');
        return;
    }
    const rows = (0, sqlInstance_1.assertGlobalInstance)()
        .prepare(`SELECT id FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE
      type = 'group' AND
      id LIKE 'http%'
     ORDER BY id ASC;`)
        .all();
    const v2ConvosIds = (0, lodash_1.map)(rows, row => row.id);
    if (!v2ConvosIds || !v2ConvosIds.length) {
        sessionjs_logger_1.console.info('cleanUpOldOpengroups: v2Convos is empty');
        return;
    }
    sessionjs_logger_1.console.info(`Count of v2 opengroup convos to clean: ${v2ConvosIds.length}`);
    const maxMessagePerOpengroupConvo = 2000;
    const db = (0, sqlInstance_1.assertGlobalInstance)();
    db.transaction(() => {
        v2ConvosIds.forEach(convoId => {
            const messagesInConvoBefore = getMessagesCountByConversation(convoId);
            if (messagesInConvoBefore >= maxMessagePerOpengroupConvo) {
                const minute = 1000 * 60;
                const sixMonths = minute * 60 * 24 * 30 * 6;
                const limitTimestamp = Date.now() - sixMonths;
                const countToRemove = (0, sqlInstance_1.assertGlobalInstance)()
                    .prepare(`SELECT count(*) from ${database_utility_1.MESSAGES_TABLE} WHERE serverTimestamp <= $serverTimestamp AND conversationId = $conversationId;`)
                    .get({ conversationId: convoId, serverTimestamp: limitTimestamp })['count(*)'];
                const start = Date.now();
                (0, sqlInstance_1.assertGlobalInstance)()
                    .prepare(`
        DELETE FROM ${database_utility_1.MESSAGES_TABLE} WHERE serverTimestamp <= $serverTimestamp AND conversationId = $conversationId`)
                    .run({ conversationId: convoId, serverTimestamp: limitTimestamp });
                const messagesInConvoAfter = getMessagesCountByConversation(convoId);
                sessionjs_logger_1.console.info(`Cleaning ${countToRemove} messages older than 6 months in public convo: ${convoId} took ${Date.now() -
                    start}ms. Old message count: ${messagesInConvoBefore}, new message count: ${messagesInConvoAfter}`);
            }
            else {
                sessionjs_logger_1.console.info(`Not cleaning messages older than 6 months in public convo: ${convoId}. message count: ${messagesInConvoBefore}`);
            }
        });
        const allInactiveConvos = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`
    SELECT id FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE type = 'private' AND (active_at IS NULL OR active_at = 0)`)
            .all();
        const ourPubkey = ourNumber.value.split('.')[0];
        const allInactiveAndWithoutMessagesConvo = allInactiveConvos
            .map(c => c.id)
            .filter(convoId => {
            return !!(convoId !== ourPubkey && getMessagesCountBySender({ source: convoId }) === 0);
        });
        if (allInactiveAndWithoutMessagesConvo.length) {
            sessionjs_logger_1.console.info(`Removing ${allInactiveAndWithoutMessagesConvo.length} completely inactive convos`);
            const start = Date.now();
            const chunks = (0, lodash_1.chunk)(allInactiveAndWithoutMessagesConvo, 500);
            chunks.forEach(ch => {
                db.prepare(`DELETE FROM ${database_utility_1.CONVERSATIONS_TABLE} WHERE id IN (${ch.map(() => '?').join(',')});`).run(ch);
            });
            sessionjs_logger_1.console.info(`Removing of ${allInactiveAndWithoutMessagesConvo.length} completely inactive convos done in ${Date.now() - start}ms`);
        }
        cleanUpMessagesJson();
    })();
}
function close() {
    (0, sqlInstance_1.closeDbInstance)();
}
exports.close = close;
exports.sqlNode = {
    initializeSql,
    close,
    removeDB,
    setSQLPassword,
    getPasswordHash,
    savePasswordHash,
    removePasswordHash,
    getIdentityKeyById,
    createOrUpdateItem,
    getItemById,
    getAllItems,
    removeItemById,
    getSwarmNodesForPubkey,
    updateSwarmNodesForPubkey,
    getGuardNodes,
    updateGuardNodes,
    getConversationCount,
    saveConversation,
    fetchConvoMemoryDetails,
    getConversationById,
    removeConversation,
    getAllConversations,
    getPubkeysInPublicConversation,
    removeAllConversations,
    searchConversations,
    searchMessages,
    searchMessagesInConversation,
    getMessageCount,
    saveMessage,
    cleanSeenMessages,
    cleanLastHashes,
    saveSeenMessageHashes,
    saveSeenMessageHash,
    updateLastHash,
    saveMessages,
    removeMessage,
    removeMessagesByIds,
    removeAllMessagesInConversation,
    getUnreadByConversation,
    markAllAsReadByConversationNoExpiration,
    getUnreadCountByConversation,
    getMessageCountByType,
    filterAlreadyFetchedOpengroupMessage,
    getMessagesBySenderAndSentAt,
    getMessageIdsFromServerIds,
    getMessageById,
    getMessagesBySentAt,
    getMessageByServerId,
    getSeenMessagesByHashList,
    getLastHashBySnode,
    getExpiredMessages,
    getOutgoingWithoutExpiresAt,
    getNextExpiringMessage,
    getMessagesByConversation,
    getLastMessagesByConversation,
    getOldestMessageInConversation,
    getFirstUnreadMessageIdInConversation,
    getFirstUnreadMessageWithMention,
    hasConversationOutgoingMessage,
    ...unprocessed,
    getNextAttachmentDownloadJobs,
    saveAttachmentDownloadJob,
    setAttachmentDownloadJobPending,
    resetAttachmentDownloadPending,
    removeAttachmentDownloadJob,
    removeAllAttachmentDownloadJobs,
    removeKnownAttachments,
    removeAll,
    getMessagesWithVisualMediaAttachments,
    getMessagesWithFileAttachments,
    getMessagesCountByConversation,
    getAllEncryptionKeyPairsForGroup,
    getLatestClosedGroupEncryptionKeyPair,
    addClosedGroupEncryptionKeyPair,
    removeAllClosedGroupEncryptionKeyPairs,
    getV2OpenGroupRoom,
    saveV2OpenGroupRoom,
    getAllV2OpenGroupRooms,
    removeV2OpenGroupRoom,
    ...config_dump_1.configDumpData,
};
