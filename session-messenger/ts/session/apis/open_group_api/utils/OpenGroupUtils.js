"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isOpenGroupV2 = exports.getOpenGroupV2FromConversationId = exports.getOpenGroupV2ConversationId = exports.prefixify = exports.getCompleteUrlFromRoom = exports.openGroupV2CompleteURLRegex = exports.publicKeyParam = void 0;
const lodash_1 = require("lodash");
const protocolRegex = new RegExp('https?://');
const dot = '\\.';
const qMark = '\\?';
const hostSegment = '[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?';
const hostnameRegex = new RegExp(`(?:${hostSegment}${dot})+${hostSegment}`);
const portRegex = ':[1-9][0-9]{0,4}';
const roomIdV2Regex = '[0-9a-zA-Z_-]{1,64}';
const publicKeyRegex = '[0-9a-fA-F]{64}';
exports.publicKeyParam = 'public_key=';
const openGroupV2ServerUrlRegex = new RegExp(`(?:${protocolRegex.source})?${hostnameRegex.source}(?:${portRegex})?`);
exports.openGroupV2CompleteURLRegex = new RegExp(`^${openGroupV2ServerUrlRegex.source}\/${roomIdV2Regex}${qMark}${exports.publicKeyParam}${publicKeyRegex}$`);
const openGroupPrefix = 'http';
function getCompleteUrlFromRoom(roomInfos) {
    if ((0, lodash_1.isEmpty)(roomInfos.serverUrl) ||
        (0, lodash_1.isEmpty)(roomInfos.roomId) ||
        (0, lodash_1.isEmpty)(roomInfos.serverPublicKey)) {
        throw new Error('getCompleteUrlFromRoom needs serverPublicKey, roomid and serverUrl to be set');
    }
    return `${roomInfos.serverUrl}/${roomInfos.roomId}?${exports.publicKeyParam}${roomInfos.serverPublicKey}`;
}
exports.getCompleteUrlFromRoom = getCompleteUrlFromRoom;
function prefixify(server) {
    const hasPrefix = server.match('^https?://');
    if (hasPrefix) {
        return server;
    }
    return `http://${server}`;
}
exports.prefixify = prefixify;
function getOpenGroupV2ConversationId(serverUrl, roomId) {
    if (!roomId.match(`^${roomIdV2Regex}$`)) {
        throw new Error('getOpenGroupV2ConversationId: Invalid roomId');
    }
    if (!serverUrl.match(openGroupV2ServerUrlRegex)) {
        throw new Error('getOpenGroupV2ConversationId: Invalid serverUrl');
    }
    return `${serverUrl}/${roomId}`;
}
exports.getOpenGroupV2ConversationId = getOpenGroupV2ConversationId;
function getOpenGroupV2FromConversationId(conversationId) {
    if (isOpenGroupV2(conversationId)) {
        const endProtocolStr = '://';
        const startOfDoubleSlashes = conversationId.indexOf(endProtocolStr);
        if (startOfDoubleSlashes < 0) {
            throw new Error('We need :// to be present in an opengroup URL');
        }
        const firstSlashAfterProtocol = conversationId.indexOf('/', startOfDoubleSlashes + endProtocolStr.length + 1);
        const baseUrlWithProtocol = conversationId.substring(0, firstSlashAfterProtocol);
        const lastSlash = conversationId.lastIndexOf('/');
        const roomId = conversationId.slice(lastSlash + 1);
        return {
            serverUrl: baseUrlWithProtocol,
            roomId,
        };
    }
    throw new Error('Not a v2 open group convo id');
}
exports.getOpenGroupV2FromConversationId = getOpenGroupV2FromConversationId;
function isOpenGroupV2(conversationId) {
    return Boolean(conversationId?.startsWith(openGroupPrefix));
}
exports.isOpenGroupV2 = isOpenGroupV2;
