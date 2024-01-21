"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearSogsReactionByServerId = void 0;
const abort_controller_1 = __importDefault(require("abort-controller"));
const reactions_1 = require("../../../../util/reactions");
const OpenGroupUtils_1 = require("../utils/OpenGroupUtils");
const sogsV3BatchPoll_1 = require("./sogsV3BatchPoll");
const sogsV3MutationCache_1 = require("./sogsV3MutationCache");
const sogsV3SendReaction_1 = require("./sogsV3SendReaction");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const clearSogsReactionByServerId = async (reaction, serverId, roomInfos) => {
    const converationId = (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(roomInfos.serverUrl, roomInfos.roomId);
    const { supported, conversation } = await (0, sogsV3SendReaction_1.hasReactionSupport)(converationId, serverId);
    if (!supported) {
        return false;
    }
    if (!conversation) {
        sessionjs_logger_1.console.warn(`Conversation for ${reaction} not found in db`);
        return false;
    }
    const cacheEntry = {
        server: roomInfos.serverUrl,
        room: roomInfos.roomId,
        changeType: sogsV3MutationCache_1.ChangeType.REACTIONS,
        seqno: null,
        metadata: {
            messageId: serverId,
            emoji: reaction,
            action: 'CLEAR',
        },
    };
    (0, sogsV3MutationCache_1.addToMutationCache)(cacheEntry);
    await reactions_1.Reactions.handleClearReaction(converationId, serverId, reaction);
    const options = [
        {
            type: 'deleteReaction',
            deleteReaction: {
                reaction,
                messageId: serverId,
                roomId: roomInfos.roomId,
            },
        },
    ];
    const result = await (0, sogsV3BatchPoll_1.sogsBatchSend)(roomInfos.serverUrl, new Set([roomInfos.roomId]), new abort_controller_1.default().signal, options, 'batch');
    if (!result) {
        throw new Error('Could not deleteReaction, res is invalid');
    }
    const rawMessage = (result.body && result.body[0].body) || null;
    if (!rawMessage) {
        throw new Error('deleteReaction parsing failed');
    }
    try {
        if ((0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(result) && (0, sogsV3BatchPoll_1.batchFirstSubIsSuccess)(result)) {
            (0, sogsV3MutationCache_1.updateMutationCache)(cacheEntry, rawMessage.seqno);
            return true;
        }
        return false;
    }
    catch (e) {
        sessionjs_logger_1.console.error("clearSogsReactionByServerId Can't decode JSON body");
    }
    return false;
};
exports.clearSogsReactionByServerId = clearSogsReactionByServerId;
