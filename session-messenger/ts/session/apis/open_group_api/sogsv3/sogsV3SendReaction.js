"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSogsReactionOnionV4 = exports.hasReactionSupport = void 0;
const emoji_mart_1 = require("emoji-mart");
const data_1 = require("../../../../data/data");
const Reaction_1 = require("../../../../types/Reaction");
const reactions_1 = require("../../../../util/reactions");
const onionSend_1 = require("../../../onions/onionSend");
const utils_1 = require("../../../utils");
const OpenGroupPollingUtils_1 = require("../opengroupV2/OpenGroupPollingUtils");
const OpenGroupUtils_1 = require("../utils/OpenGroupUtils");
const sogsV3BatchPoll_1 = require("./sogsV3BatchPoll");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const hasReactionSupport = async (conversationId, serverId) => {
    const found = await data_1.Data.getMessageByServerId(conversationId, serverId);
    if (!found) {
        sessionjs_logger_1.console.warn(`Open Group Message ${serverId} not found in db`);
        return { supported: false, conversation: null };
    }
    const conversationModel = found?.getConversation();
    if (!conversationModel) {
        sessionjs_logger_1.console.warn(`Conversation for ${serverId} not found in db`);
        return { supported: false, conversation: null };
    }
    if (!conversationModel.hasReactions()) {
        sessionjs_logger_1.console.warn("This open group doesn't have reaction support. Server Message ID", serverId);
        return { supported: false, conversation: null };
    }
    return { supported: true, conversation: conversationModel };
};
exports.hasReactionSupport = hasReactionSupport;
const sendSogsReactionOnionV4 = async (serverUrl, room, abortSignal, reaction, blinded) => {
    const allValidRoomInfos = OpenGroupPollingUtils_1.OpenGroupPollingUtils.getAllValidRoomInfos(serverUrl, new Set([room]));
    if (!allValidRoomInfos?.length) {
        sessionjs_logger_1.console.info('getSendReactionRequest: no valid roominfos got.');
        throw new Error(`Could not find sogs pubkey of url:${serverUrl}`);
    }
    const { supported, conversation } = await (0, exports.hasReactionSupport)((0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(serverUrl, room), reaction.id);
    if (!supported) {
        return false;
    }
    if (reactions_1.Reactions.hitRateLimit()) {
        utils_1.ToastUtils.pushRateLimitHitReactions();
        return false;
    }
    if (!conversation) {
        sessionjs_logger_1.console.warn(`Conversation for ${reaction.id} not found in db`);
        return false;
    }
    const emoji = (await emoji_mart_1.SearchIndex.search(reaction.emoji)) ? reaction.emoji : '🖾';
    const endpoint = `/room/${room}/reaction/${reaction.id}/${emoji}`;
    const method = reaction.action === Reaction_1.Action.REACT ? 'PUT' : 'DELETE';
    const serverPubkey = allValidRoomInfos[0].serverPublicKey;
    const me = utils_1.UserUtils.getOurPubKeyStrFromCache();
    await reactions_1.Reactions.handleMessageReaction({
        reaction,
        sender: blinded ? conversation.getUsInThatConversation() || me : me,
        you: true,
        openGroupConversationId: (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(serverUrl, room),
    });
    const stringifiedBody = null;
    const result = await onionSend_1.OnionSending.sendJsonViaOnionV4ToSogs({
        serverUrl,
        endpoint,
        serverPubkey,
        method,
        abortSignal,
        blinded,
        stringifiedBody,
        headers: null,
        throwErrors: true,
    });
    if (!(0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(result)) {
        sessionjs_logger_1.console.warn('sendSogsReactionWithOnionV4 Got unknown status code; res:', result);
        throw new Error(`sendSogsReactionOnionV4: invalid status code: ${(0, sogsV3BatchPoll_1.parseBatchGlobalStatusCode)(result)}`);
    }
    if (!result) {
        throw new Error('Could not putReaction, res is invalid');
    }
    const rawMessage = result.body;
    if (!rawMessage) {
        throw new Error('putReaction parsing failed');
    }
    const success = Boolean(reaction.action === Reaction_1.Action.REACT ? rawMessage.added : rawMessage.removed);
    return success;
};
exports.sendSogsReactionOnionV4 = sendSogsReactionOnionV4;
