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
exports.MessageSender = void 0;
const abort_controller_1 = require("abort-controller");
const bytebuffer_1 = __importDefault(require("bytebuffer"));
const lodash_1 = __importStar(require("lodash"));
const p_retry_1 = __importDefault(require("p-retry"));
const data_1 = require("../../data/data");
const protobuf_1 = require("../../protobuf");
const OpenGroupMessageV2_1 = require("../apis/open_group_api/opengroupV2/OpenGroupMessageV2");
const sogsV3SendMessage_1 = require("../apis/open_group_api/sogsv3/sogsV3SendMessage");
const getNetworkTime_1 = require("../apis/snode_api/getNetworkTime");
const namespaces_1 = require("../apis/snode_api/namespaces");
const snodePool_1 = require("../apis/snode_api/snodePool");
const snodeSignatures_1 = require("../apis/snode_api/snodeSignatures");
const storeMessage_1 = require("../apis/snode_api/storeMessage");
const conversations_1 = require("../conversations");
const crypto_1 = require("../crypto");
const BufferPadding_1 = require("../crypto/BufferPadding");
const ConfigurationMessage_1 = require("../messages/outgoing/controlMessage/ConfigurationMessage");
const ClosedGroupNewMessage_1 = require("../messages/outgoing/controlMessage/group/ClosedGroupNewMessage");
const SharedConfigMessage_1 = require("../messages/outgoing/controlMessage/SharedConfigMessage");
const UnsendMessage_1 = require("../messages/outgoing/controlMessage/UnsendMessage");
const onionPath_1 = require("../onions/onionPath");
const types_1 = require("../types");
const errors_1 = require("../utils/errors");
const String_1 = require("../utils/String");
const sessionjs_logger_1 = require("../../sessionjs-logger");
function overwriteOutgoingTimestampWithNetworkTimestamp(message) {
    const networkTimestamp = getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset();
    const { plainTextBuffer } = message;
    const contentDecoded = protobuf_1.SignalService.Content.decode(plainTextBuffer);
    const { dataMessage, dataExtractionNotification, typingMessage } = contentDecoded;
    if (dataMessage && dataMessage.timestamp && (0, lodash_1.toNumber)(dataMessage.timestamp) > 0) {
        if (dataMessage.syncTarget) {
            return {
                overRiddenTimestampBuffer: plainTextBuffer,
                networkTimestamp: lodash_1.default.toNumber(dataMessage.timestamp),
            };
        }
        dataMessage.timestamp = networkTimestamp;
    }
    if (dataExtractionNotification &&
        dataExtractionNotification.timestamp &&
        (0, lodash_1.toNumber)(dataExtractionNotification.timestamp) > 0) {
        dataExtractionNotification.timestamp = networkTimestamp;
    }
    if (typingMessage && typingMessage.timestamp && (0, lodash_1.toNumber)(typingMessage.timestamp) > 0) {
        typingMessage.timestamp = networkTimestamp;
    }
    const overRiddenTimestampBuffer = protobuf_1.SignalService.Content.encode(contentDecoded).finish();
    return { overRiddenTimestampBuffer, networkTimestamp };
}
function getMinRetryTimeout() {
    return 1000;
}
function isSyncMessage(message) {
    if (message instanceof ConfigurationMessage_1.ConfigurationMessage ||
        message instanceof ClosedGroupNewMessage_1.ClosedGroupNewMessage ||
        message instanceof UnsendMessage_1.UnsendMessage ||
        message instanceof SharedConfigMessage_1.SharedConfigMessage ||
        message.syncTarget?.length > 0) {
        return true;
    }
    return false;
}
async function send(message, attempts = 3, retryMinTimeout, isASyncMessage) {
    return (0, p_retry_1.default)(async () => {
        const recipient = types_1.PubKey.cast(message.device);
        const { ttl } = message;
        const [encryptedAndWrapped] = await encryptMessagesAndWrap([
            {
                destination: message.device,
                plainTextBuffer: message.plainTextBuffer,
                namespace: message.namespace,
                ttl,
                identifier: message.identifier,
                isSyncMessage: Boolean(isASyncMessage),
            },
        ]);
        const found = await data_1.Data.getMessageById(encryptedAndWrapped.identifier);
        if (found && !found.get('sentSync')) {
            found.set({ sent_at: encryptedAndWrapped.networkTimestamp });
            await found.commit();
        }
        const batchResult = await exports.MessageSender.sendMessagesDataToSnode([
            {
                pubkey: recipient.key,
                data64: encryptedAndWrapped.data64,
                ttl,
                timestamp: encryptedAndWrapped.networkTimestamp,
                namespace: encryptedAndWrapped.namespace,
            },
        ], recipient.key, null);
        const isDestinationClosedGroup = (0, conversations_1.getConversationController)()
            .get(recipient.key)
            ?.isClosedGroup();
        if (encryptedAndWrapped.identifier &&
            (encryptedAndWrapped.isSyncMessage || isDestinationClosedGroup) &&
            batchResult &&
            !(0, lodash_1.isEmpty)(batchResult) &&
            batchResult[0].code === 200 &&
            !(0, lodash_1.isEmpty)(batchResult[0].body.hash)) {
            const messageSendHash = batchResult[0].body.hash;
            const foundMessage = await data_1.Data.getMessageById(encryptedAndWrapped.identifier);
            if (foundMessage) {
                await foundMessage.updateMessageHash(messageSendHash);
                await foundMessage.commit();
                sessionjs_logger_1.console.info(`updated message ${foundMessage.get('id')} with hash: ${foundMessage.get('messageHash')}`);
            }
        }
        return {
            wrappedEnvelope: encryptedAndWrapped.data,
            effectiveTimestamp: encryptedAndWrapped.networkTimestamp,
        };
    }, {
        retries: Math.max(attempts - 1, 0),
        factor: 1,
        minTimeout: retryMinTimeout || exports.MessageSender.getMinRetryTimeout(),
    });
}
async function sendMessagesDataToSnode(params, destination, messagesHashesToDelete) {
    const rightDestination = params.filter(m => m.pubkey === destination);
    const swarm = await (0, snodePool_1.getSwarmFor)(destination);
    const withSigWhenRequired = await Promise.all(rightDestination.map(async (item) => {
        let signOpts;
        if (namespaces_1.SnodeNamespace.isUserConfigNamespace(item.namespace)) {
            signOpts = await snodeSignatures_1.SnodeSignature.getSnodeSignatureParams({
                method: 'store',
                namespace: item.namespace,
                pubkey: destination,
            });
        }
        const store = {
            data: item.data64,
            namespace: item.namespace,
            pubkey: item.pubkey,
            timestamp: item.timestamp,
            ttl: item.ttl,
            ...signOpts,
        };
        return store;
    }));
    const signedDeleteOldHashesRequest = messagesHashesToDelete && messagesHashesToDelete.size
        ? await snodeSignatures_1.SnodeSignature.getSnodeSignatureByHashesParams({
            method: 'delete',
            messages: [...messagesHashesToDelete],
            pubkey: destination,
        })
        : null;
    const snode = (0, lodash_1.sample)(swarm);
    if (!snode) {
        throw new errors_1.EmptySwarmError(destination, 'Ran out of swarm nodes to query');
    }
    try {
        const storeResults = await storeMessage_1.SnodeAPIStore.storeOnNode(snode, withSigWhenRequired, signedDeleteOldHashesRequest);
        if (!(0, lodash_1.isEmpty)(storeResults)) {
            sessionjs_logger_1.console.info(`sendMessagesToSnode - Successfully stored messages to ${(0, onionPath_1.ed25519Str)(destination)} via ${snode.ip}:${snode.port} on namespaces: ${rightDestination.map(m => m.namespace).join(',')}`);
        }
        return storeResults;
    }
    catch (e) {
        const snodeStr = snode ? `${snode.ip}:${snode.port}` : 'null';
        sessionjs_logger_1.console.warn(`sendMessagesToSnode - "${e.code}:${e.message}" to ${destination} via snode:${snodeStr}`);
        throw e;
    }
}
function encryptionBasedOnConversation(destination) {
    if ((0, conversations_1.getConversationController)()
        .get(destination.key)
        ?.isClosedGroup()) {
        return protobuf_1.SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE;
    }
    return protobuf_1.SignalService.Envelope.Type.SESSION_MESSAGE;
}
async function encryptMessageAndWrap(params) {
    const { destination, identifier, isSyncMessage: syncMessage, namespace, plainTextBuffer, ttl, } = params;
    const { overRiddenTimestampBuffer, networkTimestamp, } = overwriteOutgoingTimestampWithNetworkTimestamp({ plainTextBuffer });
    const recipient = types_1.PubKey.cast(destination);
    const { envelopeType, cipherText } = await crypto_1.MessageEncrypter.encrypt(recipient, overRiddenTimestampBuffer, encryptionBasedOnConversation(recipient));
    const envelope = await buildEnvelope(envelopeType, recipient.key, networkTimestamp, cipherText);
    const data = wrapEnvelope(envelope);
    const data64 = bytebuffer_1.default.wrap(data).toString('base64');
    const overridenNamespace = !(0, lodash_1.isNil)(namespace)
        ? namespace
        : (0, conversations_1.getConversationController)()
            .get(recipient.key)
            ?.isClosedGroup()
            ? namespaces_1.SnodeNamespaces.ClosedGroupMessage
            : namespaces_1.SnodeNamespaces.UserMessages;
    return {
        data64,
        networkTimestamp,
        data,
        namespace: overridenNamespace,
        ttl,
        identifier,
        isSyncMessage: syncMessage,
    };
}
async function encryptMessagesAndWrap(messages) {
    return Promise.all(messages.map(encryptMessageAndWrap));
}
async function sendMessagesToSnode(params, destination, messagesHashesToDelete) {
    try {
        const recipient = types_1.PubKey.cast(destination);
        const encryptedAndWrapped = await encryptMessagesAndWrap(params.map(m => ({
            destination: m.pubkey,
            plainTextBuffer: m.message.plainTextBuffer(),
            namespace: m.namespace,
            ttl: m.message.ttl(),
            identifier: m.message.identifier,
            isSyncMessage: exports.MessageSender.isSyncMessage(m.message),
        })));
        await Promise.all(encryptedAndWrapped.map(async (m, index) => {
            const found = await data_1.Data.getMessageById(m.identifier);
            if (found && !found.get('sentSync')) {
                found.set({ sent_at: encryptedAndWrapped[index].networkTimestamp });
                await found.commit();
            }
        }));
        const batchResults = await (0, p_retry_1.default)(async () => {
            return exports.MessageSender.sendMessagesDataToSnode(encryptedAndWrapped.map(wrapped => ({
                pubkey: recipient.key,
                data64: wrapped.data64,
                ttl: wrapped.ttl,
                timestamp: wrapped.networkTimestamp,
                namespace: wrapped.namespace,
            })), recipient.key, messagesHashesToDelete);
        }, {
            retries: 2,
            factor: 1,
            minTimeout: exports.MessageSender.getMinRetryTimeout(),
            maxTimeout: 1000,
        });
        if (!batchResults || (0, lodash_1.isEmpty)(batchResults)) {
            throw new Error('result is empty for sendMessagesToSnode');
        }
        const isDestinationClosedGroup = (0, conversations_1.getConversationController)()
            .get(recipient.key)
            ?.isClosedGroup();
        await Promise.all(encryptedAndWrapped.map(async (message, index) => {
            if (message.identifier &&
                (message.isSyncMessage || isDestinationClosedGroup) &&
                batchResults[index] &&
                !(0, lodash_1.isEmpty)(batchResults[index]) &&
                (0, lodash_1.isString)(batchResults[index].body.hash)) {
                const hashFoundInResponse = batchResults[index].body.hash;
                const foundMessage = await data_1.Data.getMessageById(message.identifier);
                if (foundMessage) {
                    await foundMessage.updateMessageHash(hashFoundInResponse);
                    await foundMessage.commit();
                    sessionjs_logger_1.console.info(`updated message ${foundMessage.get('id')} with hash: ${foundMessage.get('messageHash')}`);
                }
            }
        }));
        return batchResults;
    }
    catch (e) {
        sessionjs_logger_1.console.warn(`sendMessagesToSnode failed with ${e.message}`);
        return null;
    }
}
async function buildEnvelope(type, sskSource, timestamp, content) {
    let source;
    if (type === protobuf_1.SignalService.Envelope.Type.CLOSED_GROUP_MESSAGE) {
        source = sskSource;
    }
    return protobuf_1.SignalService.Envelope.create({
        type,
        source,
        timestamp,
        content,
    });
}
function wrapEnvelope(envelope) {
    const request = protobuf_1.SignalService.WebSocketRequestMessage.create({
        id: 0,
        body: protobuf_1.SignalService.Envelope.encode(envelope).finish(),
        verb: 'PUT',
        path: '/api/v1/message',
    });
    const websocket = protobuf_1.SignalService.WebSocketMessage.create({
        type: protobuf_1.SignalService.WebSocketMessage.Type.REQUEST,
        request,
    });
    return protobuf_1.SignalService.WebSocketMessage.encode(websocket).finish();
}
async function sendToOpenGroupV2(rawMessage, roomInfos, blinded, filesToLink) {
    const paddedBody = (0, BufferPadding_1.addMessagePadding)(rawMessage.plainTextBuffer());
    const v2Message = new OpenGroupMessageV2_1.OpenGroupMessageV2({
        sentTimestamp: getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset(),
        base64EncodedData: (0, String_1.fromUInt8ArrayToBase64)(paddedBody),
        filesToLink,
    });
    const msg = await (0, sogsV3SendMessage_1.sendSogsMessageOnionV4)(roomInfos.serverUrl, roomInfos.roomId, new abort_controller_1.AbortController().signal, v2Message, blinded);
    return msg;
}
async function sendToOpenGroupV2BlindedRequest(encryptedContent, roomInfos, recipientBlindedId) {
    const v2Message = new OpenGroupMessageV2_1.OpenGroupMessageV2({
        sentTimestamp: getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset(),
        base64EncodedData: (0, String_1.fromUInt8ArrayToBase64)(encryptedContent),
    });
    const msg = await (0, sogsV3SendMessage_1.sendMessageOnionV4BlindedRequest)(roomInfos.serverUrl, roomInfos.roomId, new abort_controller_1.AbortController().signal, v2Message, recipientBlindedId);
    return msg;
}
exports.MessageSender = {
    sendToOpenGroupV2BlindedRequest,
    sendMessagesDataToSnode,
    sendMessagesToSnode,
    getMinRetryTimeout,
    sendToOpenGroupV2,
    send,
    isSyncMessage,
};
