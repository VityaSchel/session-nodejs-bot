"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImageForRoomSogsV3 = void 0;
const abort_controller_1 = __importDefault(require("abort-controller"));
const lodash_1 = require("lodash");
const sogsV3BatchPoll_1 = require("./sogsV3BatchPoll");
const sogsV3SendFile_1 = require("./sogsV3SendFile");
const uploadImageForRoomSogsV3 = async (fileContent, roomInfos) => {
    if (!fileContent || !fileContent.length) {
        return null;
    }
    const result = await (0, sogsV3SendFile_1.uploadFileToRoomSogs3)(fileContent, roomInfos);
    if (!result || !(0, lodash_1.isNumber)(result.fileId)) {
        return null;
    }
    const { fileId, fileUrl } = result;
    if (!fileId || !fileContent.length) {
        return null;
    }
    const batchResult = await (0, sogsV3BatchPoll_1.sogsBatchSend)(roomInfos.serverUrl, new Set([roomInfos.roomId]), new abort_controller_1.default().signal, [{ type: 'updateRoom', updateRoom: { roomId: roomInfos.roomId, imageId: fileId } }], 'batch');
    if (!(0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(batchResult) || !(0, sogsV3BatchPoll_1.batchFirstSubIsSuccess)(batchResult)) {
        return null;
    }
    return {
        fileUrl,
        fileId,
    };
};
exports.uploadImageForRoomSogsV3 = uploadImageForRoomSogsV3;
