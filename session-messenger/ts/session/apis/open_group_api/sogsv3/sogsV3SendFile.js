"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFileToRoomSogs3 = void 0;
const abort_controller_1 = __importDefault(require("abort-controller"));
const opengroups_1 = require("../../../../data/opengroups");
const sqlSharedTypes_1 = require("../../../../types/sqlSharedTypes");
const onionSend_1 = require("../../../onions/onionSend");
const sogsV3BatchPoll_1 = require("./sogsV3BatchPoll");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const uploadFileToRoomSogs3 = async (fileContent, roomInfos) => {
    if (!fileContent || !fileContent.length) {
        return null;
    }
    const roomDetails = opengroups_1.OpenGroupData.getV2OpenGroupRoomByRoomId(roomInfos);
    if (!roomDetails || !roomDetails.serverPublicKey) {
        sessionjs_logger_1.console.warn('uploadFileOpenGroupV3: roomDetails is invalid');
        return null;
    }
    const result = await onionSend_1.OnionSending.sendBinaryViaOnionV4ToSogs({
        abortSignal: new abort_controller_1.default().signal,
        blinded: (0, sqlSharedTypes_1.roomHasBlindEnabled)(roomDetails),
        bodyBinary: fileContent,
        headers: null,
        serverPubkey: roomDetails.serverPublicKey,
        endpoint: `/room/${roomDetails.roomId}/file`,
        method: 'POST',
        serverUrl: roomDetails.serverUrl,
    });
    if (!(0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(result)) {
        return null;
    }
    const fileId = result?.body?.id;
    if (!fileId) {
        return null;
    }
    const fileUrl = `${roomInfos.serverUrl}/room/${roomDetails.roomId}/file/${fileId}`;
    return {
        fileId,
        fileUrl,
    };
};
exports.uploadFileToRoomSogs3 = uploadFileToRoomSogs3;
