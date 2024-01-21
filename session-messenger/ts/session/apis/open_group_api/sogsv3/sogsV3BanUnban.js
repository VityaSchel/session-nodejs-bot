"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sogsV3UnbanUser = exports.sogsV3BanUser = void 0;
const abort_controller_1 = __importDefault(require("abort-controller"));
const sogsV3BatchPoll_1 = require("./sogsV3BatchPoll");
const sogsV3BanUser = async (userToBan, roomInfos, deleteAllMessages) => {
    const sequence = [
        {
            type: 'banUnbanUser',
            banUnbanUser: {
                sessionId: userToBan.key,
                roomId: roomInfos.roomId,
                type: 'ban',
            },
        },
    ];
    if (deleteAllMessages) {
        sequence.push({
            type: 'deleteAllPosts',
            deleteAllPosts: { sessionId: userToBan.key, roomId: roomInfos.roomId },
        });
    }
    const batchSendResponse = await (0, sogsV3BatchPoll_1.sogsBatchSend)(roomInfos.serverUrl, new Set([roomInfos.roomId]), new abort_controller_1.default().signal, sequence, 'sequence');
    return (0, sogsV3BatchPoll_1.batchFirstSubIsSuccess)(batchSendResponse);
};
exports.sogsV3BanUser = sogsV3BanUser;
const sogsV3UnbanUser = async (userToBan, roomInfos) => {
    const batchSendResponse = await (0, sogsV3BatchPoll_1.sogsBatchSend)(roomInfos.serverUrl, new Set([roomInfos.roomId]), new abort_controller_1.default().signal, [
        {
            type: 'banUnbanUser',
            banUnbanUser: {
                sessionId: userToBan.key,
                roomId: roomInfos.roomId,
                type: 'unban',
            },
        },
    ], 'batch');
    return (0, sogsV3BatchPoll_1.batchFirstSubIsSuccess)(batchSendResponse);
};
exports.sogsV3UnbanUser = sogsV3UnbanUser;
