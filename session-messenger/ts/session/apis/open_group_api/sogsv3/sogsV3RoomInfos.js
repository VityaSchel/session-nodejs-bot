"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openGroupV2GetRoomInfoViaOnionV4 = exports.getAllRoomInfos = void 0;
const abort_controller_1 = __importDefault(require("abort-controller"));
const lodash_1 = require("lodash");
const sqlSharedTypes_1 = require("../../../../types/sqlSharedTypes");
const onionSend_1 = require("../../../onions/onionSend");
const sogsV3BatchPoll_1 = require("./sogsV3BatchPoll");
const sogsV3Capabilities_1 = require("./sogsV3Capabilities");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const getAllRoomInfos = async (roomInfos) => {
    const result = await onionSend_1.OnionSending.sendJsonViaOnionV4ToSogs({
        blinded: true,
        endpoint: '/rooms',
        method: 'GET',
        serverPubkey: roomInfos.serverPublicKey,
        stringifiedBody: null,
        abortSignal: new abort_controller_1.default().signal,
        serverUrl: roomInfos.serverUrl,
        headers: null,
        throwErrors: false,
    });
    if (result && (0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(result)) {
        return parseRooms(result);
    }
    const statusCode = (0, sogsV3BatchPoll_1.parseBatchGlobalStatusCode)(result);
    sessionjs_logger_1.console.warn('getAllRoomInfos failed invalid status code:', statusCode);
    return undefined;
};
exports.getAllRoomInfos = getAllRoomInfos;
const parseRooms = (jsonResult) => {
    if (!jsonResult) {
        return undefined;
    }
    const rooms = jsonResult?.body;
    if (!rooms || !rooms.length) {
        sessionjs_logger_1.console.warn('getAllRoomInfos failed invalid infos');
        return [];
    }
    return (0, lodash_1.compact)(rooms.map(room => {
        const { token: id, name, image_id: imageId } = room;
        if (!id || !name) {
            sessionjs_logger_1.console.info('getAllRoomInfos: Got invalid room details, skipping');
            return null;
        }
        return { id, name, imageId };
    }));
};
async function openGroupV2GetRoomInfoViaOnionV4({ serverUrl, serverPubkey, roomId, }) {
    const abortSignal = new abort_controller_1.default().signal;
    const caps = await (0, sogsV3Capabilities_1.fetchCapabilitiesAndUpdateRelatedRoomsOfServerUrl)(serverUrl);
    if (!caps || caps.length === 0) {
        sessionjs_logger_1.console.warn('getInfo failed because capabilities failed');
        return null;
    }
    const hasBlindingEnabled = (0, sqlSharedTypes_1.capabilitiesListHasBlindEnabled)(caps);
    sessionjs_logger_1.console.info(`openGroupV2GetRoomInfoViaOnionV4 capabilities for  ${serverUrl}: ${caps}`);
    const result = await onionSend_1.OnionSending.sendJsonViaOnionV4ToSogs({
        blinded: hasBlindingEnabled,
        method: 'GET',
        serverUrl,
        endpoint: `/room/${roomId}`,
        abortSignal,
        stringifiedBody: null,
        serverPubkey,
        headers: null,
        throwErrors: false,
    });
    const room = result?.body;
    if (room) {
        const { token: id, name, image_id: imageId } = room;
        if (!id || !name) {
            sessionjs_logger_1.console.warn('getRoominfo Parsing failed');
            return null;
        }
        const info = {
            id,
            name,
            imageId,
            capabilities: caps ? (0, lodash_1.uniq)(caps) : undefined,
        };
        return info;
    }
    sessionjs_logger_1.console.warn('openGroupV2GetRoomInfoViaOnionV4 failed');
    return null;
}
exports.openGroupV2GetRoomInfoViaOnionV4 = openGroupV2GetRoomInfoViaOnionV4;
