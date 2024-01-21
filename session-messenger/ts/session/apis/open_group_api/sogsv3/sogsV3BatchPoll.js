"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.batchFirstSubIsSuccess = exports.batchGlobalIsSuccess = exports.parseBatchGlobalStatusCode = exports.sogsBatchSend = void 0;
const lodash_1 = require("lodash");
const opengroups_1 = require("../../../../data/opengroups");
const sqlSharedTypes_1 = require("../../../../types/sqlSharedTypes");
const reactions_1 = require("../../../../util/reactions");
const onionSend_1 = require("../../../onions/onionSend");
const OpenGroupPollingUtils_1 = require("../opengroupV2/OpenGroupPollingUtils");
const sogsV3SendMessage_1 = require("./sogsV3SendMessage");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const sogsBatchSend = async (serverUrl, roomInfos, abortSignal, batchRequestOptions, batchType) => {
    const [roomId] = roomInfos;
    const fetchedRoomInfo = opengroups_1.OpenGroupData.getV2OpenGroupRoomByRoomId({
        serverUrl,
        roomId,
    });
    if (!fetchedRoomInfo || !fetchedRoomInfo?.serverPublicKey) {
        sessionjs_logger_1.console.warn('Couldnt get fetched info or server public key -- aborting batch request');
        return null;
    }
    const { serverPublicKey } = fetchedRoomInfo;
    const requireBlinding = Boolean((0, sqlSharedTypes_1.roomHasBlindEnabled)(fetchedRoomInfo));
    const batchRequest = await getBatchRequest(serverPublicKey, batchRequestOptions, requireBlinding, batchType);
    if (!batchRequest) {
        sessionjs_logger_1.console.error('Could not generate batch request. Aborting request');
        return null;
    }
    const result = await sendSogsBatchRequestOnionV4(serverUrl, serverPublicKey, batchRequest, abortSignal);
    if (abortSignal.aborted) {
        sessionjs_logger_1.console.info('sendSogsBatchRequestOnionV4 aborted.');
        return null;
    }
    return result || null;
};
exports.sogsBatchSend = sogsBatchSend;
function parseBatchGlobalStatusCode(response) {
    return response?.status_code;
}
exports.parseBatchGlobalStatusCode = parseBatchGlobalStatusCode;
function batchGlobalIsSuccess(response) {
    const status = parseBatchGlobalStatusCode(response);
    return Boolean(status && (0, lodash_1.isNumber)(status) && status >= 200 && status <= 300);
}
exports.batchGlobalIsSuccess = batchGlobalIsSuccess;
function parseBatchFirstSubStatusCode(response) {
    return response?.body?.[0].code;
}
function batchFirstSubIsSuccess(response) {
    const status = parseBatchFirstSubStatusCode(response);
    return Boolean(status && (0, lodash_1.isNumber)(status) && status >= 200 && status <= 300);
}
exports.batchFirstSubIsSuccess = batchFirstSubIsSuccess;
const makeBatchRequestPayload = (options) => {
    const type = options.type;
    switch (type) {
        case 'capabilities':
            return {
                method: 'GET',
                path: '/capabilities',
            };
        case 'messages':
            if (options.messages) {
                return {
                    method: 'GET',
                    path: (0, lodash_1.isNumber)(options.messages.sinceSeqNo)
                        ? `/room/${options.messages.roomId}/messages/since/${options.messages.sinceSeqNo}?t=r&reactors=${reactions_1.Reactions.SOGSReactorsFetchCount}`
                        : `/room/${options.messages.roomId}/messages/recent?reactors=${reactions_1.Reactions.SOGSReactorsFetchCount}`,
                };
            }
            break;
        case 'inbox':
            return {
                method: 'GET',
                path: options?.inboxSince?.id && (0, lodash_1.isNumber)(options.inboxSince.id)
                    ? `/inbox/since/${options.inboxSince.id}`
                    : '/inbox',
            };
        case 'outbox':
            return {
                method: 'GET',
                path: options?.outboxSince?.id && (0, lodash_1.isNumber)(options.outboxSince.id)
                    ? `/outbox/since/${options.outboxSince.id}`
                    : '/outbox',
            };
        case 'pollInfo':
            return {
                method: 'GET',
                path: `/room/${options.pollInfo.roomId}/pollInfo/${options.pollInfo.infoUpdated}`,
            };
        case 'deleteMessage':
            return {
                method: 'DELETE',
                path: `/room/${options.deleteMessage.roomId}/message/${options.deleteMessage.messageId}`,
            };
        case 'addRemoveModerators':
            const isAddMod = Boolean(options.addRemoveModerators.type === 'add_mods');
            return options.addRemoveModerators.sessionIds.map(sessionId => ({
                method: 'POST',
                path: `/user/${sessionId}/moderator`,
                json: {
                    rooms: [options.addRemoveModerators.roomId],
                    global: false,
                    visible: true,
                    admin: isAddMod,
                    moderator: isAddMod,
                },
            }));
        case 'banUnbanUser':
            const isBan = Boolean(options.banUnbanUser.type === 'ban');
            return {
                method: 'POST',
                path: `/user/${options.banUnbanUser.sessionId}/${isBan ? 'ban' : 'unban'}`,
                json: {
                    rooms: [options.banUnbanUser.roomId],
                },
            };
        case 'deleteAllPosts':
            return {
                method: 'DELETE',
                path: `/room/${options.deleteAllPosts.roomId}/all/${options.deleteAllPosts.sessionId}`,
            };
        case 'updateRoom':
            return {
                method: 'PUT',
                path: `/room/${options.updateRoom.roomId}`,
                json: { image: options.updateRoom.imageId },
            };
        case 'deleteReaction':
            return {
                method: 'DELETE',
                path: `/room/${options.deleteReaction.roomId}/reactions/${options.deleteReaction.messageId}/${options.deleteReaction.reaction}`,
            };
        default:
            (0, sqlSharedTypes_1.assertUnreachable)(type, 'Invalid batch request row');
    }
    return null;
};
const getBatchRequest = async (serverPublicKey, batchOptions, requireBlinding, batchType) => {
    const batchEndpoint = batchType === 'sequence' ? '/sequence' : '/batch';
    const batchMethod = 'POST';
    if (!batchOptions || (0, lodash_1.isEmpty)(batchOptions)) {
        return undefined;
    }
    const batchBody = (0, lodash_1.flatten)(batchOptions.map(options => {
        return makeBatchRequestPayload(options);
    }));
    const stringBody = JSON.stringify(batchBody);
    const headers = await OpenGroupPollingUtils_1.OpenGroupPollingUtils.getOurOpenGroupHeaders(serverPublicKey, batchEndpoint, batchMethod, requireBlinding, stringBody);
    if (!headers) {
        sessionjs_logger_1.console.error('Unable to create headers for batch request - aborting');
        return undefined;
    }
    return {
        endpoint: batchEndpoint,
        method: batchMethod,
        body: stringBody,
        headers: (0, sogsV3SendMessage_1.addJsonContentTypeToHeaders)(headers),
    };
};
const sendSogsBatchRequestOnionV4 = async (serverUrl, serverPubkey, request, abortSignal) => {
    const { endpoint, headers, method, body } = request;
    if (!endpoint.startsWith('/')) {
        throw new Error('endpoint needs a leading /');
    }
    const builtUrl = new URL(`${serverUrl}${endpoint}`);
    const batchResponse = await onionSend_1.OnionSending.sendViaOnionV4ToNonSnodeWithRetries(serverPubkey, builtUrl, {
        method,
        headers,
        body,
        useV4: true,
    }, false, abortSignal);
    if (abortSignal.aborted) {
        return null;
    }
    if (!batchResponse) {
        sessionjs_logger_1.console.error('sogsbatch: Undefined batch response - cancelling batch request');
        return null;
    }
    if ((0, lodash_1.isObject)(batchResponse.body)) {
        return batchResponse;
    }
    sessionjs_logger_1.console.warn('sogsbatch: batch response decoded body is not object. Returning null');
    return null;
};
