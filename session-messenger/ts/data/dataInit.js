"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initData = exports.callChannel = exports.shutdown = exports.jobs = void 0;
const sessionjs_logger_1 = require("../sessionjs-logger");
const channels_1 = require("./channels");
const configDump_1 = require("./configDump/configDump");
const channelsToMakeForOpengroupV2 = [
    'getAllV2OpenGroupRooms',
    'getV2OpenGroupRoom',
    'saveV2OpenGroupRoom',
    'removeV2OpenGroupRoom',
];
const channelsToMakeForConfigDumps = [...Object.keys(configDump_1.ConfigDumpData)];
const channelsToMake = new Set([
    'shutdown',
    'close',
    'removeDB',
    'getPasswordHash',
    'getGuardNodes',
    'updateGuardNodes',
    'createOrUpdateItem',
    'getItemById',
    'getAllItems',
    'removeItemById',
    'getSwarmNodesForPubkey',
    'updateSwarmNodesForPubkey',
    'saveConversation',
    'fetchConvoMemoryDetails',
    'getConversationById',
    'removeConversation',
    'getAllConversations',
    'getPubkeysInPublicConversation',
    'searchConversations',
    'searchMessages',
    'searchMessagesInConversation',
    'saveMessage',
    'cleanSeenMessages',
    'cleanLastHashes',
    'updateLastHash',
    'saveSeenMessageHashes',
    'saveMessages',
    'removeMessage',
    'removeMessagesByIds',
    'getUnreadByConversation',
    'markAllAsReadByConversationNoExpiration',
    'getUnreadCountByConversation',
    'getMessageCountByType',
    'removeAllMessagesInConversation',
    'getMessageCount',
    'filterAlreadyFetchedOpengroupMessage',
    'getMessagesBySenderAndSentAt',
    'getMessageIdsFromServerIds',
    'getMessageById',
    'getMessagesBySentAt',
    'getMessageByServerId',
    'getExpiredMessages',
    'getOutgoingWithoutExpiresAt',
    'getNextExpiringMessage',
    'getMessagesByConversation',
    'getLastMessagesByConversation',
    'getOldestMessageInConversation',
    'getFirstUnreadMessageIdInConversation',
    'getFirstUnreadMessageWithMention',
    'hasConversationOutgoingMessage',
    'getSeenMessagesByHashList',
    'getLastHashBySnode',
    'getUnprocessedCount',
    'getAllUnprocessed',
    'getUnprocessedById',
    'saveUnprocessed',
    'updateUnprocessedAttempts',
    'updateUnprocessedWithData',
    'removeUnprocessed',
    'removeAllUnprocessed',
    'getNextAttachmentDownloadJobs',
    'saveAttachmentDownloadJob',
    'resetAttachmentDownloadPending',
    'setAttachmentDownloadJobPending',
    'removeAttachmentDownloadJob',
    'removeAllAttachmentDownloadJobs',
    'removeAll',
    'removeAllConversations',
    'removeOtherData',
    'cleanupOrphanedAttachments',
    'getMessagesWithVisualMediaAttachments',
    'getMessagesWithFileAttachments',
    'getAllEncryptionKeyPairsForGroup',
    'getLatestClosedGroupEncryptionKeyPair',
    'addClosedGroupEncryptionKeyPair',
    'removeAllClosedGroupEncryptionKeyPairs',
    ...channelsToMakeForOpengroupV2,
    ...channelsToMakeForConfigDumps,
]);
const SQL_CHANNEL_KEY = 'sql-channel';
let _shutdownPromise = null;
const DATABASE_UPDATE_TIMEOUT = 2 * 60 * 1000;
exports.jobs = Object.create(null);
const _DEBUG = false;
let _jobCounter = 0;
let _shuttingDown = false;
let _shutdownCallback = null;
async function shutdown() {
    if (_shutdownPromise) {
        return _shutdownPromise;
    }
    _shuttingDown = true;
    const jobKeys = Object.keys(exports.jobs);
    sessionjs_logger_1.console.info(`data.shutdown: starting process. ${jobKeys.length} jobs outstanding`);
    if (jobKeys.length === 0) {
        sessionjs_logger_1.console.info('data.shutdown: No outstanding jobs');
        return null;
    }
    _shutdownPromise = new Promise((resolve, reject) => {
        _shutdownCallback = (error) => {
            sessionjs_logger_1.console.info('data.shutdown: process complete');
            if (error) {
                return reject(error);
            }
            return resolve(undefined);
        };
    });
    return _shutdownPromise;
}
exports.shutdown = shutdown;
function getJob(id) {
    return exports.jobs[id];
}
function makeChannel(fnName) {
    channels_1.channels[fnName] = async (...args) => {
        const jobId = makeJob(fnName);
        return new Promise((resolve, reject) => {
            resolve(global.SBOT.SqlChannelKey(null, null, fnName, ...args));
            updateJob(jobId, {
                resolve: () => { },
                reject,
                args: _DEBUG ? args : null,
            });
            exports.jobs[jobId].timer = setTimeout(() => reject(new Error(`SQL channel job ${jobId} (${fnName}) timed out`)), DATABASE_UPDATE_TIMEOUT);
        });
    };
}
async function callChannel(name) {
    return new Promise((resolve, reject) => {
        sessionjs_logger_1.console.log(`${name}-done`, name);
        resolve(undefined);
        setTimeout(() => reject(new Error(`callChannel call to ${name} timed out`)), DATABASE_UPDATE_TIMEOUT);
    });
}
exports.callChannel = callChannel;
function initData() {
    channelsToMake.forEach(makeChannel);
}
exports.initData = initData;
function updateJob(id, data) {
    const { resolve, reject } = data;
    const { fnName, start } = exports.jobs[id];
    exports.jobs[id] = {
        ...exports.jobs[id],
        ...data,
        resolve: (value) => {
            removeJob(id);
            if (_DEBUG) {
                const end = Date.now();
                const delta = end - start;
                if (delta > 10) {
                    sessionjs_logger_1.console.debug(`SQL channel job ${id} (${fnName}) succeeded in ${end - start}ms`);
                }
            }
            return resolve(value);
        },
        reject: (error) => {
            removeJob(id);
            const end = Date.now();
            sessionjs_logger_1.console.warn(`SQL channel job ${id} (${fnName}) failed in ${end - start}ms`);
            return reject(error);
        },
    };
}
function removeJob(id) {
    if (_DEBUG) {
        exports.jobs[id].complete = true;
        return;
    }
    if (exports.jobs[id].timer) {
        global.clearTimeout(exports.jobs[id].timer);
        exports.jobs[id].timer = null;
    }
    delete exports.jobs[id];
    if (_shutdownCallback) {
        const keys = Object.keys(exports.jobs);
        sessionjs_logger_1.console.info(`removeJob: _shutdownCallback and we still have ${keys.length} jobs to run`);
        if (keys.length === 0) {
            _shutdownCallback();
        }
    }
}
function makeJob(fnName) {
    if (_shuttingDown && fnName !== 'close') {
        throw new Error(`Rejecting SQL channel job (${fnName}); application is shutting down`);
    }
    _jobCounter += 1;
    const id = _jobCounter;
    if (_DEBUG) {
        sessionjs_logger_1.console.debug(`SQL channel job ${id} (${fnName}) started`);
    }
    exports.jobs[id] = {
        fnName,
        start: Date.now(),
    };
    return id;
}
