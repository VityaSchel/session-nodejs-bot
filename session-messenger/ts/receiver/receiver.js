"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.queueAllCachedFromSource = exports.queueAllCached = exports.handleRequest = exports.downloadAttachment = void 0;
const uuid_1 = require("uuid");
const lodash_1 = __importDefault(require("lodash"));
const cache_1 = require("./cache");
const contentMessage_1 = require("./contentMessage");
const data_1 = require("../data/data");
const protobuf_1 = require("../protobuf");
const utils_1 = require("../session/utils");
const Performance_1 = require("../session/utils/Performance");
const TaskWithTimeout_1 = require("../session/utils/TaskWithTimeout");
const common_1 = require("./common");
const sessionjs_logger_1 = require("../sessionjs-logger");
var attachments_1 = require("./attachments");
Object.defineProperty(exports, "downloadAttachment", { enumerable: true, get: function () { return attachments_1.downloadAttachment; } });
const incomingMessagePromises = [];
async function handleSwarmEnvelope(envelope, messageHash) {
    if (envelope.content && envelope.content.length > 0) {
        return (0, contentMessage_1.handleSwarmContentMessage)(envelope, messageHash);
    }
    await (0, cache_1.removeFromCache)(envelope);
    throw new Error('Received message with no content');
}
class EnvelopeQueue {
    pending = Promise.resolve();
    add(task) {
        const promise = this.pending.then(task, task);
        this.pending = promise;
        this.pending.then(this.cleanup.bind(this, promise), this.cleanup.bind(this, promise));
    }
    cleanup(promise) {
        if (this.pending === promise) {
            this.pending = Promise.resolve();
        }
    }
}
const envelopeQueue = new EnvelopeQueue();
function queueSwarmEnvelope(envelope, messageHash) {
    const id = (0, common_1.getEnvelopeId)(envelope);
    const task = handleSwarmEnvelope.bind(null, envelope, messageHash);
    const taskWithTimeout = (0, TaskWithTimeout_1.createTaskWithTimeout)(task, `queueSwarmEnvelope ${id}`);
    try {
        envelopeQueue.add(taskWithTimeout);
    }
    catch (error) {
        sessionjs_logger_1.console.error('queueSwarmEnvelope error handling envelope', id, ':', error && error.stack ? error.stack : error);
    }
}
async function handleRequestDetail(plaintext, inConversation, lastPromise, messageHash) {
    const envelope = protobuf_1.SignalService.Envelope.decode(plaintext);
    if (inConversation) {
        const ourNumber = utils_1.UserUtils.getOurPubKeyStrFromCache();
        const senderIdentity = envelope.source;
        if (senderIdentity === ourNumber) {
            return;
        }
        envelope.source = inConversation;
        plaintext = protobuf_1.SignalService.Envelope.encode(envelope).finish();
        envelope.senderIdentity = senderIdentity;
    }
    envelope.id = (0, uuid_1.v4)();
    envelope.serverTimestamp = envelope.serverTimestamp ? envelope.serverTimestamp.toNumber() : null;
    envelope.messageHash = messageHash;
    try {
        (0, Performance_1.perfStart)(`addToCache-${envelope.id}`);
        await (0, cache_1.addToCache)(envelope, plaintext, messageHash);
        (0, Performance_1.perfEnd)(`addToCache-${envelope.id}`, 'addToCache');
        await lastPromise;
        queueSwarmEnvelope(envelope, messageHash);
    }
    catch (error) {
        sessionjs_logger_1.console.error('handleRequest error trying to add message to cache:', error && error.stack ? error.stack : error);
    }
}
function handleRequest(plaintext, inConversation, messageHash) {
    const lastPromise = lodash_1.default.last(incomingMessagePromises) || Promise.resolve();
    const promise = handleRequestDetail(plaintext, inConversation, lastPromise, messageHash).catch(e => {
        sessionjs_logger_1.console.error('Error handling incoming message:', e && e.stack ? e.stack : e);
    });
    incomingMessagePromises.push(promise);
}
exports.handleRequest = handleRequest;
async function queueAllCached() {
    const items = await (0, cache_1.getAllFromCache)();
    await items.reduce(async (promise, item) => {
        await promise;
        await queueCached(item);
    }, Promise.resolve());
}
exports.queueAllCached = queueAllCached;
async function queueAllCachedFromSource(source) {
    const items = await (0, cache_1.getAllFromCacheForSource)(source);
    await items.reduce(async (promise, item) => {
        await promise;
        await queueCached(item);
    }, Promise.resolve());
}
exports.queueAllCachedFromSource = queueAllCachedFromSource;
async function queueCached(item) {
    try {
        const envelopePlaintext = utils_1.StringUtils.encode(item.envelope, 'base64');
        const envelopeArray = new Uint8Array(envelopePlaintext);
        const envelope = protobuf_1.SignalService.Envelope.decode(envelopeArray);
        envelope.id = envelope.serverGuid || item.id;
        envelope.source = envelope.source || item.source;
        envelope.senderIdentity = envelope.senderIdentity || item.senderIdentity;
        const { decrypted } = item;
        if (decrypted) {
            const payloadPlaintext = utils_1.StringUtils.encode(decrypted, 'base64');
            queueDecryptedEnvelope(envelope, payloadPlaintext, envelope.messageHash);
        }
        else {
            sessionjs_logger_1.console.log('queueSwarmEnvelope');
            queueSwarmEnvelope(envelope, envelope.messageHash);
        }
    }
    catch (error) {
        sessionjs_logger_1.console.error('queueCached error handling item', item.id, 'removing it. Error:', error && error.stack ? error.stack : error);
        try {
            await data_1.Data.removeUnprocessed(item.id);
        }
        catch (deleteError) {
            sessionjs_logger_1.console.error('queueCached error deleting item', item.id, 'Error:', deleteError && deleteError.stack ? deleteError.stack : deleteError);
        }
    }
}
function queueDecryptedEnvelope(envelope, plaintext, messageHash) {
    const id = (0, common_1.getEnvelopeId)(envelope);
    sessionjs_logger_1.console.info('queueing decrypted envelope', id);
    const task = handleDecryptedEnvelope.bind(null, envelope, plaintext, messageHash);
    const taskWithTimeout = (0, TaskWithTimeout_1.createTaskWithTimeout)(task, `queueEncryptedEnvelope ${id}`);
    try {
        envelopeQueue.add(taskWithTimeout);
    }
    catch (error) {
        sessionjs_logger_1.console.error(`queueDecryptedEnvelope error handling envelope ${id}:`, error && error.stack ? error.stack : error);
    }
}
async function handleDecryptedEnvelope(envelope, plaintext, messageHash) {
    if (envelope.content) {
        const sentAtTimestamp = lodash_1.default.toNumber(envelope.timestamp);
        await (0, contentMessage_1.innerHandleSwarmContentMessage)(envelope, sentAtTimestamp, plaintext, messageHash);
    }
    else {
        await (0, cache_1.removeFromCache)(envelope);
    }
}
