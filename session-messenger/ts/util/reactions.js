"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Reactions = void 0;
const lodash_1 = require("lodash");
const data_1 = require("../data/data");
const knownBlindedkeys_1 = require("../session/apis/open_group_api/sogsv3/knownBlindedkeys");
const utils_1 = require("../session/utils");
const Reaction_1 = require("../types/Reaction");
const storage_1 = require("./storage");
const sessionjs_logger_1 = require("../sessionjs-logger");
const SOGSReactorsFetchCount = 5;
const rateCountLimit = 20;
const rateTimeLimit = 60 * 1000;
const latestReactionTimestamps = [];
function hitRateLimit() {
    const now = Date.now();
    latestReactionTimestamps.push(now);
    if (latestReactionTimestamps.length > rateCountLimit) {
        const firstTimestamp = latestReactionTimestamps[0];
        if (now - firstTimestamp < rateTimeLimit) {
            latestReactionTimestamps.pop();
            sessionjs_logger_1.console.warn(`Only ${rateCountLimit} reactions are allowed per minute`);
            return true;
        }
        latestReactionTimestamps.shift();
    }
    return false;
}
const getMessageByReaction = async (reaction, openGroupConversationId) => {
    let originalMessage = null;
    const originalMessageId = Number(reaction.id);
    const originalMessageAuthor = reaction.author;
    if (openGroupConversationId && !(0, lodash_1.isEmpty)(openGroupConversationId)) {
        originalMessage = await data_1.Data.getMessageByServerId(openGroupConversationId, originalMessageId);
    }
    else {
        const collection = await data_1.Data.getMessagesBySentAt(originalMessageId);
        originalMessage = collection.find((item) => {
            const messageTimestamp = item.get('sent_at');
            const author = item.get('source');
            return Boolean(messageTimestamp &&
                messageTimestamp === originalMessageId &&
                author &&
                author === originalMessageAuthor);
        });
    }
    if (!originalMessage) {
        sessionjs_logger_1.console.debug(`Cannot find the original reacted message ${originalMessageId}.`);
        return null;
    }
    return originalMessage;
};
const sendMessageReaction = async (messageId, emoji) => {
    const found = await data_1.Data.getMessageById(messageId);
    if (found) {
        const conversationModel = found?.getConversation();
        if (!conversationModel) {
            sessionjs_logger_1.console.warn(`Conversation for ${messageId} not found in db`);
            return undefined;
        }
        if (!conversationModel.hasReactions()) {
            sessionjs_logger_1.console.warn("This conversation doesn't have reaction support");
            return undefined;
        }
        if (hitRateLimit()) {
            utils_1.ToastUtils.pushRateLimitHitReactions();
            return undefined;
        }
        let me = utils_1.UserUtils.getOurPubKeyStrFromCache();
        let id = Number(found.get('sent_at'));
        if (found.get('isPublic')) {
            if (found.get('serverId')) {
                id = found.get('serverId') || id;
                me = conversationModel.getUsInThatConversation();
            }
            else {
                sessionjs_logger_1.console.warn(`Server Id was not found in message ${messageId} for opengroup reaction`);
                return undefined;
            }
        }
        const author = found.get('source');
        let action = Reaction_1.Action.REACT;
        const reacts = found.get('reacts');
        if (reacts?.[emoji]?.senders?.includes(me)) {
            sessionjs_logger_1.console.info('Found matching reaction removing it');
            action = Reaction_1.Action.REMOVE;
        }
        else {
            const reactions = (0, storage_1.getRecentReactions)();
            if (reactions) {
                await updateRecentReactions(reactions, emoji);
            }
        }
        const reaction = {
            id,
            author,
            emoji,
            action,
        };
        await conversationModel.sendReaction(messageId, reaction);
        sessionjs_logger_1.console.info(`You ${action === Reaction_1.Action.REACT ? 'added' : 'removed'} a`, emoji, 'reaction for message', id, found.get('isPublic') ? `on ${conversationModel.id}` : '');
        return reaction;
    }
    sessionjs_logger_1.console.warn(`Message ${messageId} not found in db`);
    return undefined;
};
const handleMessageReaction = async ({ reaction, sender, you, openGroupConversationId, }) => {
    if (!reaction.emoji) {
        sessionjs_logger_1.console.warn(`There is no emoji for the reaction ${reaction}.`);
        return undefined;
    }
    const originalMessage = await getMessageByReaction(reaction, openGroupConversationId);
    if (!originalMessage) {
        return undefined;
    }
    const reacts = originalMessage.get('reacts') ?? {};
    reacts[reaction.emoji] = reacts[reaction.emoji] || { count: null, senders: [] };
    const details = reacts[reaction.emoji] ?? {};
    const senders = details.senders;
    let count = details.count || 0;
    if (details.you && senders.includes(sender)) {
        if (reaction.action === Reaction_1.Action.REACT) {
            sessionjs_logger_1.console.warn('Received duplicate message for your reaction. Ignoring it');
            return undefined;
        }
        details.you = false;
    }
    else {
        details.you = you;
    }
    switch (reaction.action) {
        case Reaction_1.Action.REACT:
            if (senders.includes(sender)) {
                sessionjs_logger_1.console.warn('Received duplicate reaction message. Ignoring it', reaction, sender);
                return undefined;
            }
            details.senders.push(sender);
            count += 1;
            break;
        case Reaction_1.Action.REMOVE:
        default:
            if (senders?.length > 0) {
                const sendersIndex = senders.indexOf(sender);
                if (sendersIndex >= 0) {
                    details.senders.splice(sendersIndex, 1);
                    count -= 1;
                }
            }
    }
    if (count > 0) {
        reacts[reaction.emoji].count = count;
        reacts[reaction.emoji].senders = details.senders;
        reacts[reaction.emoji].you = details.you;
        if (details && details.index === undefined) {
            reacts[reaction.emoji].index = originalMessage.get('reactsIndex') ?? 0;
            originalMessage.set('reactsIndex', (originalMessage.get('reactsIndex') ?? 0) + 1);
        }
    }
    else {
        delete reacts[reaction.emoji];
    }
    originalMessage.set({
        reacts: !(0, lodash_1.isEmpty)(reacts) ? reacts : undefined,
    });
    await originalMessage.commit();
    if (!you) {
        sessionjs_logger_1.console.info(`${sender} ${reaction.action === Reaction_1.Action.REACT ? 'added' : 'removed'} a ${reaction.emoji} reaction`);
    }
    return originalMessage;
};
const handleClearReaction = async (conversationId, serverId, emoji) => {
    const originalMessage = await data_1.Data.getMessageByServerId(conversationId, serverId);
    if (!originalMessage) {
        sessionjs_logger_1.console.debug(`Cannot find the original reacted message ${serverId} in conversation ${conversationId}.`);
        return undefined;
    }
    const reacts = originalMessage.get('reacts');
    if (reacts) {
        delete reacts[emoji];
    }
    originalMessage.set({
        reacts: !(0, lodash_1.isEmpty)(reacts) ? reacts : undefined,
    });
    await originalMessage.commit();
    sessionjs_logger_1.console.info(`You cleared all ${emoji} reactions on message ${serverId}`);
    return originalMessage;
};
const handleOpenGroupMessageReactions = async (conversationId, serverId, reactions) => {
    const originalMessage = await data_1.Data.getMessageByServerId(conversationId, serverId);
    if (!originalMessage) {
        sessionjs_logger_1.console.debug(`Cannot find the original reacted message ${serverId} in conversation ${conversationId}.`);
        return undefined;
    }
    if (!originalMessage.get('isPublic')) {
        sessionjs_logger_1.console.warn('handleOpenGroupMessageReactions() should only be used in opengroups');
        return undefined;
    }
    if ((0, lodash_1.isEmpty)(reactions)) {
        if (originalMessage.get('reacts')) {
            originalMessage.set({
                reacts: undefined,
            });
        }
    }
    else {
        const reacts = {};
        Object.keys(reactions).forEach(key => {
            const emoji = decodeURI(key);
            const you = reactions[key].you || false;
            if (you) {
                if (reactions[key]?.reactors.length > 0) {
                    const reactorsWithoutMe = reactions[key].reactors.filter(reactor => !(0, knownBlindedkeys_1.isUsAnySogsFromCache)(reactor));
                    if (reactorsWithoutMe.length === SOGSReactorsFetchCount) {
                        reactorsWithoutMe.pop();
                    }
                    const conversationModel = originalMessage?.getConversation();
                    if (conversationModel) {
                        const me = conversationModel.getUsInThatConversation() || utils_1.UserUtils.getOurPubKeyStrFromCache();
                        reactions[key].reactors = [me, ...reactorsWithoutMe];
                    }
                }
            }
            const senders = [];
            reactions[key].reactors.forEach(reactor => {
                senders.push(reactor);
            });
            if (reactions[key].count > 0) {
                reacts[emoji] = {
                    count: reactions[key].count,
                    index: reactions[key].index,
                    senders,
                    you,
                };
            }
            else {
                delete reacts[key];
            }
        });
        originalMessage.set({
            reacts,
        });
    }
    await originalMessage.commit();
    return originalMessage;
};
const updateRecentReactions = async (reactions, newReaction) => {
    sessionjs_logger_1.console.info('updating recent reactions with', newReaction);
    const recentReactions = new Reaction_1.RecentReactions(reactions);
    const foundIndex = recentReactions.items.indexOf(newReaction);
    if (foundIndex === 0) {
        return;
    }
    if (foundIndex > 0) {
        recentReactions.swap(foundIndex);
    }
    else {
        recentReactions.push(newReaction);
    }
    await (0, storage_1.saveRecentReations)(recentReactions.items);
};
exports.Reactions = {
    SOGSReactorsFetchCount,
    hitRateLimit,
    sendMessageReaction,
    handleMessageReaction,
    handleClearReaction,
    handleOpenGroupMessageReactions,
    updateRecentReactions,
};
