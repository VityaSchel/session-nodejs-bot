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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwarmPolling = exports.getSwarmPollingInstance = exports.extractWebSocketContent = void 0;
const lodash_1 = require("lodash");
const data_1 = require("../../../data/data");
const protobuf_1 = require("../../../protobuf");
const Receiver = __importStar(require("../../../receiver/receiver"));
const types_1 = require("../../types");
const SNodeAPI_1 = require("./SNodeAPI");
const snodePool = __importStar(require("./snodePool"));
const configMessage_1 = require("../../../receiver/configMessage");
const contentMessage_1 = require("../../../receiver/contentMessage");
const releaseFeature_1 = require("../../../util/releaseFeature");
const libsession_worker_interface_1 = require("../../../webworker/workers/browser/libsession_worker_interface");
const constants_1 = require("../../constants");
const conversations_1 = require("../../conversations");
const onionPath_1 = require("../../onions/onionPath");
const utils_1 = require("../../utils");
const Performance_1 = require("../../utils/Performance");
const libsession_utils_1 = require("../../utils/libsession/libsession_utils");
const namespaces_1 = require("./namespaces");
const retrieveRequest_1 = require("./retrieveRequest");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
function extractWebSocketContent(message, messageHash) {
    try {
        const dataPlaintext = new Uint8Array(utils_1.StringUtils.encode(message, 'base64'));
        const messageBuf = protobuf_1.SignalService.WebSocketMessage.decode(dataPlaintext);
        if (messageBuf.type === protobuf_1.SignalService.WebSocketMessage.Type.REQUEST &&
            messageBuf.request?.body?.length) {
            return {
                body: messageBuf.request.body,
                messageHash,
            };
        }
        return null;
    }
    catch (error) {
        sessionjs_logger_1.console.warn('extractWebSocketContent from message failed with:', error.message);
        return null;
    }
}
exports.extractWebSocketContent = extractWebSocketContent;
let instance;
const getSwarmPollingInstance = () => {
    if (!instance) {
        instance = new SwarmPolling();
    }
    return instance;
};
exports.getSwarmPollingInstance = getSwarmPollingInstance;
class SwarmPolling {
    groupPolling;
    lastHashes;
    hasStarted = false;
    constructor() {
        this.groupPolling = [];
        this.lastHashes = {};
    }
    async start(waitForFirstPoll = false) {
        if (this.hasStarted) {
            return;
        }
        this.hasStarted = true;
        this.loadGroupIds();
        if (waitForFirstPoll) {
            await this.pollForAllKeys();
        }
        else {
            setTimeout(() => {
                void this.pollForAllKeys();
            }, 4000);
        }
    }
    resetSwarmPolling() {
        this.groupPolling = [];
        this.hasStarted = false;
    }
    forcePolledTimestamp(pubkey, lastPoll) {
        this.groupPolling = this.groupPolling.map(group => {
            if (types_1.PubKey.isEqual(pubkey, group.pubkey)) {
                return {
                    ...group,
                    lastPolledTimestamp: lastPoll,
                };
            }
            return group;
        });
    }
    addGroupId(pubkey) {
        if (this.groupPolling.findIndex(m => m.pubkey.key === pubkey.key) === -1) {
            sessionjs_logger_1.console.info('Swarm addGroupId: adding pubkey to polling', pubkey.key);
            this.groupPolling.push({ pubkey, lastPolledTimestamp: 0 });
        }
    }
    removePubkey(pk) {
        const pubkey = types_1.PubKey.cast(pk);
        if (this.groupPolling.some(group => pubkey.key === group.pubkey.key)) {
            sessionjs_logger_1.console.info('Swarm removePubkey: removing pubkey from polling', pubkey.key);
            this.groupPolling = this.groupPolling.filter(group => !pubkey.isEqual(group.pubkey));
        }
    }
    getPollingTimeout(convoId) {
        const convo = (0, conversations_1.getConversationController)().get(convoId.key);
        if (!convo) {
            return constants_1.SWARM_POLLING_TIMEOUT.INACTIVE;
        }
        const activeAt = convo.get('active_at');
        if (!activeAt) {
            return constants_1.SWARM_POLLING_TIMEOUT.INACTIVE;
        }
        const currentTimestamp = Date.now();
        if (currentTimestamp - activeAt <= constants_1.DURATION.DAYS * 2) {
            return constants_1.SWARM_POLLING_TIMEOUT.ACTIVE;
        }
        if (currentTimestamp - activeAt <= constants_1.DURATION.DAYS * 7) {
            return constants_1.SWARM_POLLING_TIMEOUT.MEDIUM_ACTIVE;
        }
        return constants_1.SWARM_POLLING_TIMEOUT.INACTIVE;
    }
    async pollForAllKeys() {
        const ourPubkey = utils_1.UserUtils.getOurPubKeyFromCache();
        const userNamespaces = await this.getUserNamespacesPolled();
        const directPromise = Promise.all([this.pollOnceForKey(ourPubkey, false, userNamespaces)]).then(() => undefined);
        const now = Date.now();
        const groupPromises = this.groupPolling.map(async (group) => {
            const convoPollingTimeout = this.getPollingTimeout(group.pubkey);
            const diff = now - group.lastPolledTimestamp;
            const loggingId = (0, conversations_1.getConversationController)()
                .get(group.pubkey.key)
                ?.idForLogging() || group.pubkey.key;
            if (diff >= convoPollingTimeout) {
                sessionjs_logger_1.console.debug(`Polling for ${loggingId}; timeout: ${convoPollingTimeout}; diff: ${diff} `);
                return this.pollOnceForKey(group.pubkey, true, [namespaces_1.SnodeNamespaces.ClosedGroupMessage]);
            }
            sessionjs_logger_1.console.debug(`Not polling for ${loggingId}; timeout: ${convoPollingTimeout} ; diff: ${diff}`);
            return Promise.resolve();
        });
        try {
            await Promise.all((0, lodash_1.concat)([directPromise], groupPromises));
        }
        catch (e) {
            sessionjs_logger_1.console.warn('pollForAllKeys exception: ', e);
            throw e;
        }
        finally {
            setTimeout(this.pollForAllKeys.bind(this), constants_1.SWARM_POLLING_TIMEOUT.ACTIVE);
        }
    }
    async pollOnceForKey(pubkey, isGroup, namespaces) {
        const polledPubkey = pubkey.key;
        const swarmSnodes = await snodePool.getSwarmFor(polledPubkey);
        const alreadyPolled = swarmSnodes.filter((n) => this.lastHashes[n.pubkey_ed25519]);
        let toPollFrom = alreadyPolled.length ? alreadyPolled[0] : null;
        if (!toPollFrom) {
            const notPolled = (0, lodash_1.difference)(swarmSnodes, alreadyPolled);
            toPollFrom = (0, lodash_1.sample)(notPolled);
        }
        let resultsFromAllNamespaces;
        try {
            resultsFromAllNamespaces = await this.pollNodeForKey(toPollFrom, pubkey, namespaces, !isGroup);
        }
        catch (e) {
            sessionjs_logger_1.console.warn(`pollNodeForKey of ${pubkey} namespaces: ${namespaces} failed with: ${e.message}`);
            resultsFromAllNamespaces = null;
        }
        let allNamespacesWithoutUserConfigIfNeeded = [];
        const userConfigLibsession = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
        if (userConfigLibsession && resultsFromAllNamespaces) {
            const userConfigMessages = resultsFromAllNamespaces
                .filter(m => namespaces_1.SnodeNamespace.isUserConfigNamespace(m.namespace))
                .map(r => r.messages.messages);
            allNamespacesWithoutUserConfigIfNeeded = (0, lodash_1.flatten)((0, lodash_1.compact)(resultsFromAllNamespaces
                .filter(m => !namespaces_1.SnodeNamespace.isUserConfigNamespace(m.namespace))
                .map(r => r.messages.messages)));
            const userConfigMessagesMerged = (0, lodash_1.flatten)((0, lodash_1.compact)(userConfigMessages));
            if (!isGroup && userConfigMessagesMerged.length) {
                sessionjs_logger_1.console.info(`received userConfigMessages count: ${userConfigMessagesMerged.length} for key ${pubkey.key}`);
                try {
                    await this.handleSharedConfigMessages(userConfigMessagesMerged);
                }
                catch (e) {
                    sessionjs_logger_1.console.warn(`handleSharedConfigMessages of ${userConfigMessagesMerged.length} failed with ${e.message}`);
                }
            }
        }
        else {
            allNamespacesWithoutUserConfigIfNeeded = (0, lodash_1.flatten)((0, lodash_1.compact)(resultsFromAllNamespaces?.map(m => m.messages.messages)));
        }
        if (allNamespacesWithoutUserConfigIfNeeded.length) {
            sessionjs_logger_1.console.debug(`received allNamespacesWithoutUserConfigIfNeeded: ${allNamespacesWithoutUserConfigIfNeeded.length}`);
        }
        const messages = (0, lodash_1.uniqBy)(allNamespacesWithoutUserConfigIfNeeded, x => x.hash);
        if (isGroup) {
            sessionjs_logger_1.console.debug(`Polled for group(${(0, onionPath_1.ed25519Str)(pubkey.key)}):, got ${messages.length} messages back.`);
            let lastPolledTimestamp = Date.now();
            if (messages.length >= 95) {
                lastPolledTimestamp = Date.now() - constants_1.SWARM_POLLING_TIMEOUT.INACTIVE - 5 * 1000;
            }
            this.groupPolling = this.groupPolling.map(group => {
                if (types_1.PubKey.isEqual(pubkey, group.pubkey)) {
                    return {
                        ...group,
                        lastPolledTimestamp,
                    };
                }
                return group;
            });
        }
        (0, Performance_1.perfStart)(`handleSeenMessages-${polledPubkey}`);
        const newMessages = await this.handleSeenMessages(messages);
        (0, Performance_1.perfEnd)(`handleSeenMessages-${polledPubkey}`, 'handleSeenMessages');
        const isUserConfigReleaseLive = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
        if (isUserConfigReleaseLive &&
            isGroup &&
            polledPubkey.startsWith('05') &&
            !(await libsession_worker_interface_1.UserGroupsWrapperActions.getLegacyGroup(polledPubkey))) {
            (0, exports.getSwarmPollingInstance)().removePubkey(polledPubkey);
        }
        else {
            newMessages.forEach(m => {
                const content = extractWebSocketContent(m.data, m.hash);
                if (!content) {
                    return;
                }
                Receiver.handleRequest(content.body, isGroup ? polledPubkey : null, content.messageHash);
            });
        }
    }
    async handleSharedConfigMessages(userConfigMessagesMerged) {
        const extractedUserConfigMessage = (0, lodash_1.compact)(userConfigMessagesMerged.map((m) => {
            return extractWebSocketContent(m.data, m.hash);
        }));
        const allDecryptedConfigMessages = [];
        for (let index = 0; index < extractedUserConfigMessage.length; index++) {
            const userConfigMessage = extractedUserConfigMessage[index];
            try {
                const envelope = protobuf_1.SignalService.Envelope.decode(userConfigMessage.body);
                const decryptedEnvelope = await (0, contentMessage_1.decryptEnvelopeWithOurKey)(envelope);
                if (!decryptedEnvelope?.byteLength) {
                    continue;
                }
                const content = protobuf_1.SignalService.Content.decode(new Uint8Array(decryptedEnvelope));
                if (content.sharedConfigMessage) {
                    const asIncomingMsg = {
                        envelopeTimestamp: (0, lodash_1.toNumber)(envelope.timestamp),
                        message: content.sharedConfigMessage,
                        messageHash: userConfigMessage.messageHash,
                        authorOrGroupPubkey: envelope.source,
                        authorInGroup: envelope.senderIdentity,
                    };
                    allDecryptedConfigMessages.push(asIncomingMsg);
                }
                else {
                    throw new Error('received a message to a namespace reserved for user config but not containign a sharedConfigMessage');
                }
            }
            catch (e) {
                sessionjs_logger_1.console.warn(`failed to decrypt message with hash "${userConfigMessage.messageHash}": ${e.message}`);
            }
        }
        if (allDecryptedConfigMessages.length) {
            try {
                sessionjs_logger_1.console.info(`handleConfigMessagesViaLibSession of "${allDecryptedConfigMessages.length}" messages with libsession`);
                await configMessage_1.ConfigMessageHandler.handleConfigMessagesViaLibSession(allDecryptedConfigMessages);
            }
            catch (e) {
                const allMessageHases = allDecryptedConfigMessages.map(m => m.messageHash).join(',');
                sessionjs_logger_1.console.warn(`failed to handle messages hashes "${allMessageHases}" with libsession. Error: "${e.message}"`);
            }
        }
    }
    async pollNodeForKey(node, pubkey, namespaces, isUs) {
        const namespaceLength = namespaces.length;
        if (namespaceLength <= 0) {
            throw new Error(`invalid number of retrieve namespace provided: ${namespaceLength}`);
        }
        const snodeEdkey = node.pubkey_ed25519;
        const pkStr = pubkey.key;
        try {
            const prevHashes = await Promise.all(namespaces.map(namespace => this.getLastHash(snodeEdkey, pkStr, namespace)));
            const configHashesToBump = [];
            if (await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased()) {
                if (isUs) {
                    for (let index = 0; index < libsession_utils_1.LibSessionUtil.requiredUserVariants.length; index++) {
                        const variant = libsession_utils_1.LibSessionUtil.requiredUserVariants[index];
                        try {
                            const toBump = await libsession_worker_interface_1.GenericWrapperActions.currentHashes(variant);
                            if (toBump?.length) {
                                configHashesToBump.push(...toBump);
                            }
                        }
                        catch (e) {
                            sessionjs_logger_1.console.warn(`failed to get currentHashes for user variant ${variant}`);
                        }
                    }
                    sessionjs_logger_1.console.debug(`configHashesToBump: ${configHashesToBump}`);
                }
            }
            let results = await retrieveRequest_1.SnodeAPIRetrieve.retrieveNextMessages(node, prevHashes, pkStr, namespaces, utils_1.UserUtils.getOurPubKeyStrFromCache(), configHashesToBump);
            if (!results.length) {
                return [];
            }
            if (configHashesToBump.length) {
                try {
                    const lastResult = results[results.length - 1];
                    if (lastResult?.code !== 200) {
                        sessionjs_logger_1.console.warn(`the update expiry of our tracked config hashes didn't work: ${JSON.stringify(lastResult)}`);
                    }
                }
                catch (e) {
                }
                results = results.slice(0, results.length - 1);
            }
            const lastMessages = results.map(r => {
                return (0, lodash_1.last)(r.messages.messages);
            });
            await Promise.all(lastMessages.map(async (lastMessage, index) => {
                if (!lastMessage) {
                    return undefined;
                }
                return this.updateLastHash({
                    edkey: snodeEdkey,
                    pubkey,
                    namespace: namespaces[index],
                    hash: lastMessage.hash,
                    expiration: lastMessage.expiration,
                });
            }));
            return results;
        }
        catch (e) {
            if (e.message === SNodeAPI_1.ERROR_CODE_NO_CONNECT) {
                sessionjs_logger_1.console.log('[SBOT] No connect');
            }
            sessionjs_logger_1.console.info('pollNodeForKey failed with:', e.message);
            return null;
        }
    }
    loadGroupIds() {
        const convos = (0, conversations_1.getConversationController)().getConversations();
        const closedGroupsOnly = convos.filter((c) => c.isClosedGroup() && !c.isBlocked() && !c.get('isKickedFromGroup') && !c.get('left'));
        closedGroupsOnly.forEach((c) => {
            this.addGroupId(new types_1.PubKey(c.id));
        });
    }
    async handleSeenMessages(messages) {
        if (!messages.length) {
            return [];
        }
        const incomingHashes = messages.map((m) => m.hash);
        const dupHashes = await data_1.Data.getSeenMessagesByHashList(incomingHashes);
        const newMessages = messages.filter((m) => !dupHashes.includes(m.hash));
        if (newMessages.length) {
            const newHashes = newMessages.map((m) => ({
                expiresAt: m.expiration,
                hash: m.hash,
            }));
            await data_1.Data.saveSeenMessageHashes(newHashes);
        }
        return newMessages;
    }
    async getUserNamespacesPolled() {
        const isUserConfigRelease = await releaseFeature_1.ReleasedFeatures.checkIsUserConfigFeatureReleased();
        return isUserConfigRelease
            ? [
                namespaces_1.SnodeNamespaces.UserMessages,
                namespaces_1.SnodeNamespaces.UserProfile,
                namespaces_1.SnodeNamespaces.UserContacts,
                namespaces_1.SnodeNamespaces.UserGroups,
                namespaces_1.SnodeNamespaces.ConvoInfoVolatile,
            ]
            : [namespaces_1.SnodeNamespaces.UserMessages];
    }
    async updateLastHash({ edkey, expiration, hash, namespace, pubkey, }) {
        const pkStr = pubkey.key;
        const cached = await this.getLastHash(edkey, pubkey.key, namespace);
        if (!cached || cached !== hash) {
            await data_1.Data.updateLastHash({
                convoId: pkStr,
                snode: edkey,
                hash,
                expiresAt: expiration,
                namespace,
            });
        }
        if (!this.lastHashes[edkey]) {
            this.lastHashes[edkey] = {};
        }
        if (!this.lastHashes[edkey][pkStr]) {
            this.lastHashes[edkey][pkStr] = {};
        }
        this.lastHashes[edkey][pkStr][namespace] = hash;
    }
    async getLastHash(nodeEdKey, pubkey, namespace) {
        if (!this.lastHashes[nodeEdKey]?.[pubkey]?.[namespace]) {
            const lastHash = await data_1.Data.getLastHashBySnode(pubkey, nodeEdKey, namespace);
            if (!this.lastHashes[nodeEdKey]) {
                this.lastHashes[nodeEdKey] = {};
            }
            if (!this.lastHashes[nodeEdKey][pubkey]) {
                this.lastHashes[nodeEdKey][pubkey] = {};
            }
            this.lastHashes[nodeEdKey][pubkey][namespace] = lastHash || '';
            return this.lastHashes[nodeEdKey][pubkey][namespace];
        }
        return this.lastHashes[nodeEdKey][pubkey][namespace];
    }
}
exports.SwarmPolling = SwarmPolling;
