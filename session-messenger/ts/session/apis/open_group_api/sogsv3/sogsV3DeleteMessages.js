"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSogsMessageByServerIds = void 0;
const abort_controller_1 = __importDefault(require("abort-controller"));
const sogsV3BatchPoll_1 = require("./sogsV3BatchPoll");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const deleteSogsMessageByServerIds = async (idsToRemove, roomInfos) => {
    const options = idsToRemove.map(idToRemove => ({
        type: 'deleteMessage',
        deleteMessage: { roomId: roomInfos.roomId, messageId: idToRemove },
    }));
    const result = await (0, sogsV3BatchPoll_1.sogsBatchSend)(roomInfos.serverUrl, new Set([roomInfos.roomId]), new abort_controller_1.default().signal, options, 'batch');
    try {
        return (0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(result) && (0, sogsV3BatchPoll_1.batchFirstSubIsSuccess)(result);
    }
    catch (e) {
        sessionjs_logger_1.console.error("deleteMessageByServerIds Can't decode JSON body");
    }
    return false;
};
exports.deleteSogsMessageByServerIds = deleteSogsMessageByServerIds;
