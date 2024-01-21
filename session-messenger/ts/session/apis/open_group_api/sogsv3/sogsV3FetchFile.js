"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sogsV3FetchFileByFileID = exports.sogsV3FetchPreviewBase64 = exports.sogsV3FetchPreviewAndSaveIt = exports.fetchBinaryFromSogsWithOnionV4 = void 0;
const abort_controller_1 = __importDefault(require("abort-controller"));
const lodash_1 = require("lodash");
const opengroups_1 = require("../../../../data/opengroups");
const types_1 = require("../../../../types");
const MessageAttachment_1 = require("../../../../types/MessageAttachment");
const sqlSharedTypes_1 = require("../../../../types/sqlSharedTypes");
const util_worker_interface_1 = require("../../../../webworker/workers/browser/util_worker_interface");
const conversations_1 = require("../../../conversations");
const onionSend_1 = require("../../../onions/onionSend");
const Promise_1 = require("../../../utils/Promise");
const OpenGroupPollingUtils_1 = require("../opengroupV2/OpenGroupPollingUtils");
const OpenGroupUtils_1 = require("../utils/OpenGroupUtils");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
async function fetchBinaryFromSogsWithOnionV4(sendOptions) {
    const { serverUrl, serverPubkey, blinded, abortSignal, headers: includedHeaders, roomId, fileId, throwError, } = sendOptions;
    const stringifiedBody = null;
    const method = 'GET';
    const endpoint = `/room/${roomId}/file/${fileId}`;
    if (!endpoint.startsWith('/')) {
        throw new Error('endpoint needs a leading /');
    }
    const builtUrl = new URL(`${serverUrl}${endpoint}`);
    let headersWithSogsHeadersIfNeeded = await OpenGroupPollingUtils_1.OpenGroupPollingUtils.getOurOpenGroupHeaders(serverPubkey, endpoint, method, blinded, stringifiedBody);
    if ((0, lodash_1.isUndefined)(headersWithSogsHeadersIfNeeded)) {
        return null;
    }
    headersWithSogsHeadersIfNeeded = { ...includedHeaders, ...headersWithSogsHeadersIfNeeded };
    const res = await onionSend_1.OnionSending.sendViaOnionV4ToNonSnodeWithRetries(serverPubkey, builtUrl, {
        method,
        headers: headersWithSogsHeadersIfNeeded,
        body: stringifiedBody,
        useV4: true,
    }, throwError, abortSignal);
    if (!res?.bodyBinary) {
        sessionjs_logger_1.console.info('fetchBinaryFromSogsWithOnionV4 no binary content with code', res?.status_code);
        return null;
    }
    return res.bodyBinary;
}
exports.fetchBinaryFromSogsWithOnionV4 = fetchBinaryFromSogsWithOnionV4;
async function sogsV3FetchPreviewAndSaveIt(roomInfos) {
    const { roomId, serverUrl, imageID } = roomInfos;
    if (!imageID || Number.isNaN(Number(imageID))) {
        sessionjs_logger_1.console.warn(`imageId of room ${roomId} is not valid ${imageID}`);
        return;
    }
    const imageIdNumber = (0, lodash_1.toNumber)(imageID);
    const convoId = (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(roomInfos.serverUrl, roomInfos.roomId);
    let convo = (0, conversations_1.getConversationController)().get(convoId);
    if (!convo) {
        return;
    }
    let existingImageId = convo.get('avatarImageId');
    if (existingImageId === imageIdNumber) {
        return;
    }
    const room = opengroups_1.OpenGroupData.getV2OpenGroupRoom(convoId);
    const blinded = (0, sqlSharedTypes_1.roomHasBlindEnabled)(room);
    const oneAtAtimeResult = await (0, Promise_1.allowOnlyOneAtATime)(`sogsV3FetchPreview-${serverUrl}-${roomId}`, () => sogsV3FetchPreview(roomInfos, blinded));
    if (!oneAtAtimeResult || !oneAtAtimeResult?.byteLength) {
        sessionjs_logger_1.console.warn('sogsV3FetchPreviewAndSaveIt failed for room: ', roomId);
        return;
    }
    convo = (0, conversations_1.getConversationController)().get(convoId);
    if (!convo) {
        return;
    }
    existingImageId = convo.get('avatarImageId');
    if (existingImageId !== imageIdNumber && (0, lodash_1.isFinite)(imageIdNumber)) {
        const upgradedAttachment = await (0, MessageAttachment_1.processNewAttachment)({
            isRaw: true,
            data: oneAtAtimeResult.buffer,
            contentType: types_1.MIME.IMAGE_UNKNOWN,
        });
        await convo.setSessionProfile({
            avatarPath: upgradedAttachment.path,
            avatarImageId: imageIdNumber,
        });
    }
}
exports.sogsV3FetchPreviewAndSaveIt = sogsV3FetchPreviewAndSaveIt;
async function sogsV3FetchPreviewBase64(roomInfos) {
    const fetched = await sogsV3FetchPreview(roomInfos, true);
    if (fetched && fetched.byteLength) {
        return (0, util_worker_interface_1.callUtilsWorker)('arrayBufferToStringBase64', fetched);
    }
    return null;
}
exports.sogsV3FetchPreviewBase64 = sogsV3FetchPreviewBase64;
const sogsV3FetchPreview = async (roomInfos, blinded) => {
    if (!roomInfos || !roomInfos.imageID) {
        return null;
    }
    const fetched = await fetchBinaryFromSogsWithOnionV4({
        abortSignal: new abort_controller_1.default().signal,
        blinded,
        headers: null,
        serverPubkey: roomInfos.serverPublicKey,
        serverUrl: roomInfos.serverUrl,
        roomId: roomInfos.roomId,
        fileId: roomInfos.imageID,
        throwError: false,
    });
    if (fetched && fetched.byteLength) {
        return fetched;
    }
    return null;
};
const sogsV3FetchFileByFileID = async (roomInfos, fileId) => {
    if (!roomInfos) {
        return null;
    }
    const fetched = await fetchBinaryFromSogsWithOnionV4({
        abortSignal: new abort_controller_1.default().signal,
        blinded: (0, sqlSharedTypes_1.roomHasBlindEnabled)(roomInfos),
        headers: null,
        serverPubkey: roomInfos.serverPublicKey,
        serverUrl: roomInfos.serverUrl,
        roomId: roomInfos.roomId,
        fileId,
        throwError: true,
    });
    return fetched && fetched.byteLength ? fetched : null;
};
exports.sogsV3FetchFileByFileID = sogsV3FetchFileByFileID;
