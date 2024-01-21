"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessageOnionV4BlindedRequest = exports.sendSogsMessageOnionV4 = exports.addBinaryContentTypeToHeaders = exports.addJsonContentTypeToHeaders = void 0;
const MIME_1 = require("../../../../types/MIME");
const onionSend_1 = require("../../../onions/onionSend");
const utils_1 = require("../../../utils");
const OpenGroupMessageV2_1 = require("../opengroupV2/OpenGroupMessageV2");
const OpenGroupPollingUtils_1 = require("../opengroupV2/OpenGroupPollingUtils");
const sogsV3BatchPoll_1 = require("./sogsV3BatchPoll");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
function addJsonContentTypeToHeaders(headers) {
    return { ...headers, 'Content-Type': MIME_1.APPLICATION_JSON };
}
exports.addJsonContentTypeToHeaders = addJsonContentTypeToHeaders;
function addBinaryContentTypeToHeaders(headers) {
    return { ...headers, 'Content-Type': MIME_1.APPLICATION_OCTET_STREAM };
}
exports.addBinaryContentTypeToHeaders = addBinaryContentTypeToHeaders;
const sendSogsMessageOnionV4 = async (serverUrl, room, abortSignal, message, blinded) => {
    const allValidRoomInfos = OpenGroupPollingUtils_1.OpenGroupPollingUtils.getAllValidRoomInfos(serverUrl, new Set([room]));
    if (!allValidRoomInfos?.length) {
        sessionjs_logger_1.console.info('getSendMessageRequest: no valid roominfos got.');
        throw new Error(`Could not find sogs pubkey of url:${serverUrl}`);
    }
    const endpoint = `/room/${room}/message`;
    const method = 'POST';
    const serverPubkey = allValidRoomInfos[0].serverPublicKey;
    const ourKeyPair = await utils_1.UserUtils.getIdentityKeyPair();
    const signedMessage = blinded
        ? await message.signWithBlinding(serverPubkey)
        : await message.sign(ourKeyPair);
    const json = signedMessage.toJson();
    const stringifiedBody = JSON.stringify(json);
    const result = await onionSend_1.OnionSending.sendJsonViaOnionV4ToSogs({
        serverUrl,
        endpoint,
        serverPubkey,
        method,
        abortSignal,
        blinded,
        stringifiedBody,
        headers: null,
        throwErrors: true,
    });
    if (!(0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(result)) {
        sessionjs_logger_1.console.warn('sendSogsMessageWithOnionV4 Got unknown status code; res:', result);
        throw new Error(`sendSogsMessageOnionV4: invalid status code: ${(0, sogsV3BatchPoll_1.parseBatchGlobalStatusCode)(result)}`);
    }
    if (!result) {
        throw new Error('Could not postMessage, res is invalid');
    }
    const rawMessage = result.body;
    if (!rawMessage) {
        throw new Error('postMessage parsing failed');
    }
    const toParse = {
        data: rawMessage.data,
        server_id: rawMessage.id,
        public_key: rawMessage.session_id,
        timestamp: Math.floor(rawMessage.posted * 1000),
        signature: rawMessage.signature,
    };
    const parsed = OpenGroupMessageV2_1.OpenGroupMessageV2.fromJson(toParse);
    return parsed;
};
exports.sendSogsMessageOnionV4 = sendSogsMessageOnionV4;
const sendMessageOnionV4BlindedRequest = async (serverUrl, room, abortSignal, message, recipientBlindedId) => {
    const allValidRoomInfos = OpenGroupPollingUtils_1.OpenGroupPollingUtils.getAllValidRoomInfos(serverUrl, new Set([room]));
    if (!allValidRoomInfos?.length) {
        sessionjs_logger_1.console.info('getSendMessageRequest: no valid roominfos got.');
        throw new Error(`Could not find sogs pubkey of url:${serverUrl}`);
    }
    const endpoint = `/inbox/${recipientBlindedId}`;
    const method = 'POST';
    const serverPubkey = allValidRoomInfos[0].serverPublicKey;
    const signedMessage = await message.signWithBlinding(serverPubkey);
    const json = signedMessage.toBlindedMessageRequestJson();
    const stringifiedBody = JSON.stringify(json);
    const result = await onionSend_1.OnionSending.sendJsonViaOnionV4ToSogs({
        serverUrl,
        endpoint,
        serverPubkey,
        method,
        abortSignal,
        blinded: true,
        stringifiedBody,
        headers: null,
        throwErrors: true,
    });
    if (!(0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(result)) {
        sessionjs_logger_1.console.warn('sendMessageOnionV4BlindedRequest Got unknown status code; res:', result);
        throw new Error(`sendMessageOnionV4BlindedRequest: invalid status code: ${(0, sogsV3BatchPoll_1.parseBatchGlobalStatusCode)(result)}`);
    }
    if (!result) {
        throw new Error('Could not postMessage, res is invalid');
    }
    const rawMessage = result.body;
    if (!rawMessage) {
        throw new Error('postMessage parsing failed');
    }
    const serverId = rawMessage.id;
    const serverTimestamp = rawMessage.posted_at;
    if (!serverTimestamp || serverId === undefined) {
        sessionjs_logger_1.console.warn('Could not blinded message request, server returned invalid data:', rawMessage);
        throw new Error('Could not blinded message request, server returned invalid data');
    }
    return { serverId, serverTimestamp: Math.floor(serverTimestamp * 1000) };
};
exports.sendMessageOnionV4BlindedRequest = sendMessageOnionV4BlindedRequest;
