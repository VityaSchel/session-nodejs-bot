"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sogsV3RemoveAdmins = exports.sogsV3AddAdmin = void 0;
const abort_controller_1 = __importDefault(require("abort-controller"));
const sogsV3BatchPoll_1 = require("./sogsV3BatchPoll");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const sogsV3AddAdmin = async (usersToAddAsMods, roomInfos) => {
    const batchSendResponse = await (0, sogsV3BatchPoll_1.sogsBatchSend)(roomInfos.serverUrl, new Set([roomInfos.roomId]), new abort_controller_1.default().signal, [
        {
            type: 'addRemoveModerators',
            addRemoveModerators: {
                sessionIds: usersToAddAsMods.map(m => m.key),
                roomId: roomInfos.roomId,
                type: 'add_mods',
            },
        },
    ], 'batch');
    const isSuccess = (0, sogsV3BatchPoll_1.batchFirstSubIsSuccess)(batchSendResponse);
    if (!isSuccess) {
        sessionjs_logger_1.console.warn('add as mod failed with body', batchSendResponse?.body);
    }
    return isSuccess;
};
exports.sogsV3AddAdmin = sogsV3AddAdmin;
const sogsV3RemoveAdmins = async (usersToRemoveFromMods, roomInfos) => {
    const batchSendResponse = await (0, sogsV3BatchPoll_1.sogsBatchSend)(roomInfos.serverUrl, new Set([roomInfos.roomId]), new abort_controller_1.default().signal, [
        {
            type: 'addRemoveModerators',
            addRemoveModerators: {
                sessionIds: usersToRemoveFromMods.map(m => m.key),
                roomId: roomInfos.roomId,
                type: 'remove_mods',
            },
        },
    ], 'batch');
    const isSuccess = batchSendResponse?.body?.every(m => m?.code === 200) || false;
    if (!isSuccess) {
        sessionjs_logger_1.console.warn('remove mods failed with body', batchSendResponse?.body);
    }
    return isSuccess;
};
exports.sogsV3RemoveAdmins = sogsV3RemoveAdmins;
