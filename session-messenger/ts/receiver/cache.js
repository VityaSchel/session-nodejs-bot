"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateCacheWithDecryptedContent = exports.getAllFromCacheForSource = exports.getAllFromCache = exports.addToCache = exports.removeFromCache = void 0;
const lodash_1 = require("lodash");
const utils_1 = require("../session/utils");
const data_1 = require("../data/data");
const sessionjs_logger_1 = require("../sessionjs-logger");
async function removeFromCache(envelope) {
    return data_1.Data.removeUnprocessed(envelope.id);
}
exports.removeFromCache = removeFromCache;
async function addToCache(envelope, plaintext, messageHash) {
    const { id } = envelope;
    const encodedEnvelope = utils_1.StringUtils.decode(plaintext, 'base64');
    const data = {
        id,
        version: 2,
        envelope: encodedEnvelope,
        messageHash,
        timestamp: Date.now(),
        attempts: 1,
    };
    if (envelope.senderIdentity) {
        data.senderIdentity = envelope.senderIdentity;
    }
    await data_1.Data.saveUnprocessed(data);
}
exports.addToCache = addToCache;
async function fetchAllFromCache() {
    const count = await data_1.Data.getUnprocessedCount();
    if (count > 1500) {
        await data_1.Data.removeAllUnprocessed();
        sessionjs_logger_1.console.warn(`There were ${count} messages in cache. Deleted all instead of reprocessing`);
        return [];
    }
    return data_1.Data.getAllUnprocessed();
}
async function increaseAttemptsOrRemove(items) {
    return Promise.all((0, lodash_1.map)(items, async (item) => {
        const attempts = (0, lodash_1.toNumber)(item.attempts || 0) + 1;
        try {
            if (attempts >= 10) {
                sessionjs_logger_1.console.warn('increaseAttemptsOrRemove final attempt for envelope', item.id);
                await data_1.Data.removeUnprocessed(item.id);
            }
            else {
                await data_1.Data.updateUnprocessedAttempts(item.id, attempts);
            }
        }
        catch (error) {
            sessionjs_logger_1.console.error('increaseAttemptsOrRemove error updating item after load:', error && error.stack ? error.stack : error);
        }
        return item;
    }));
}
async function getAllFromCache() {
    sessionjs_logger_1.console.info('getAllFromCache');
    const items = await fetchAllFromCache();
    sessionjs_logger_1.console.info('getAllFromCache loaded', items.length, 'saved envelopes');
    return increaseAttemptsOrRemove(items);
}
exports.getAllFromCache = getAllFromCache;
async function getAllFromCacheForSource(source) {
    const items = await fetchAllFromCache();
    const itemsFromSource = items.filter(item => !!item.senderIdentity || item.senderIdentity === source);
    sessionjs_logger_1.console.info('getAllFromCacheForSource loaded', itemsFromSource.length, 'saved envelopes');
    return increaseAttemptsOrRemove(itemsFromSource);
}
exports.getAllFromCacheForSource = getAllFromCacheForSource;
async function updateCacheWithDecryptedContent(envelope, plaintext) {
    const { id, senderIdentity, source } = envelope;
    const item = await data_1.Data.getUnprocessedById(id);
    if (!item) {
        sessionjs_logger_1.console.error(`updateCacheWithDecryptedContent: Didn't find item ${id} in cache to update`);
        return;
    }
    item.source = source;
    if (envelope.senderIdentity) {
        item.senderIdentity = senderIdentity;
    }
    item.decrypted = utils_1.StringUtils.decode(plaintext, 'base64');
    await data_1.Data.updateUnprocessedWithData(item.id, item);
}
exports.updateCacheWithDecryptedContent = updateCacheWithDecryptedContent;
