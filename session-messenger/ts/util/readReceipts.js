"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReadReceipts = void 0;
const data_1 = require("../data/data");
const conversations_1 = require("../session/conversations");
const sessionjs_logger_1 = require("../sessionjs-logger");
async function getTargetMessage(reader, messages) {
    if (messages.length === 0) {
        return null;
    }
    const message = messages.find(msg => msg.isOutgoing() && reader === msg.get('conversationId'));
    if (message) {
        return message;
    }
    return null;
}
async function onReadReceipt(receipt) {
    try {
        const messages = await data_1.Data.getMessagesBySentAt(receipt.timestamp);
        const message = await getTargetMessage(receipt.source, messages);
        if (!message) {
            sessionjs_logger_1.console.info('No message for read receipt', receipt.source, receipt.timestamp);
            return;
        }
        const convoId = message.get('conversationId');
        if (!convoId ||
            !(0, conversations_1.getConversationController)().get(convoId) ||
            !(0, conversations_1.getConversationController)()
                .get(convoId)
                .isPrivate()) {
            sessionjs_logger_1.console.info('Convo is undefined or not a private chat for read receipt in convo', convoId);
            return;
        }
        let readBy = message.get('read_by') || [];
        const expirationStartTimestamp = message.get('expirationStartTimestamp');
        if (!readBy.length) {
            readBy.push(receipt.source);
        }
        if (readBy.length > 1) {
            readBy = readBy.slice(0, 1);
        }
        message.set({
            read_by: readBy,
            expirationStartTimestamp: expirationStartTimestamp || Date.now(),
            sent: true,
        });
        if (message.isExpiring() && !expirationStartTimestamp) {
            await message.setToExpire();
        }
        else {
            await message.commit();
        }
        const conversation = (0, conversations_1.getConversationController)().get(message.get('conversationId'));
        if (conversation) {
            conversation.updateLastMessage();
        }
    }
    catch (error) {
        sessionjs_logger_1.console.error('ReadReceipts.onReceipt error:', error && error.stack ? error.stack : error);
    }
}
exports.ReadReceipts = { onReadReceipt };
