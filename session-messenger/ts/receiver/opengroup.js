"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleOpenGroupV4Message = void 0;
const lodash_1 = require("lodash");
const messageFactory_1 = require("../models/messageFactory");
const protobuf_1 = require("../protobuf");
const knownBlindedkeys_1 = require("../session/apis/open_group_api/sogsv3/knownBlindedkeys");
const OpenGroupUtils_1 = require("../session/apis/open_group_api/utils/OpenGroupUtils");
const conversations_1 = require("../session/conversations");
const BufferPadding_1 = require("../session/crypto/BufferPadding");
const Performance_1 = require("../session/utils/Performance");
const String_1 = require("../session/utils/String");
const dataMessage_1 = require("./dataMessage");
const queuedJob_1 = require("./queuedJob");
const sessionjs_logger_1 = require("../sessionjs-logger");
const handleOpenGroupV4Message = async (message, roomInfos) => {
    const { data, id, posted, session_id } = message;
    if (data && posted && session_id) {
        await handleOpenGroupMessage(roomInfos, data, posted, session_id, id);
    }
    else {
        throw Error('Missing data passed to handleOpenGroupV4Message.');
    }
};
exports.handleOpenGroupV4Message = handleOpenGroupV4Message;
const handleOpenGroupMessage = async (roomInfos, base64EncodedData, sentTimestamp, sender, serverId) => {
    const { serverUrl, roomId } = roomInfos;
    if (!base64EncodedData || !sentTimestamp || !sender || !serverId) {
        sessionjs_logger_1.console.warn('Invalid data passed to handleOpenGroupV2Message.');
        return;
    }
    (0, Performance_1.perfStart)(`fromBase64ToArray-${base64EncodedData.length}`);
    const arr = (0, String_1.fromBase64ToArray)(base64EncodedData);
    (0, Performance_1.perfEnd)(`fromBase64ToArray-${base64EncodedData.length}`, 'fromBase64ToArray');
    const dataUint = new Uint8Array((0, BufferPadding_1.removeMessagePadding)(arr));
    const decodedContent = protobuf_1.SignalService.Content.decode(dataUint);
    const conversationId = (0, OpenGroupUtils_1.getOpenGroupV2ConversationId)(serverUrl, roomId);
    if (!conversationId) {
        sessionjs_logger_1.console.error('We cannot handle a message without a conversationId');
        return;
    }
    const idataMessage = decodedContent?.dataMessage;
    if (!idataMessage) {
        sessionjs_logger_1.console.error('Invalid decoded opengroup message: no dataMessage');
        return;
    }
    if (!(0, dataMessage_1.messageHasVisibleContent)(idataMessage)) {
        sessionjs_logger_1.console.info('received an empty message for sogs');
        return;
    }
    if (!(0, conversations_1.getConversationController)()
        .get(conversationId)
        ?.isOpenGroupV2()) {
        sessionjs_logger_1.console.error('Received a message for an unknown convo or not an v2. Skipping');
        return;
    }
    const groupConvo = (0, conversations_1.getConversationController)().get(conversationId);
    if (!groupConvo) {
        sessionjs_logger_1.console.warn('Skipping handleJob for unknown convo: ', conversationId);
        return;
    }
    void groupConvo.queueJob(async () => {
        const isMe = (0, knownBlindedkeys_1.isUsAnySogsFromCache)(sender);
        const commonAttributes = { serverTimestamp: sentTimestamp, serverId, conversationId };
        const attributesForNotUs = { ...commonAttributes, sender };
        const msgModel = isMe
            ? (0, messageFactory_1.createPublicMessageSentFromUs)(commonAttributes)
            : (0, messageFactory_1.createPublicMessageSentFromNotUs)(attributesForNotUs);
        await (0, queuedJob_1.handleMessageJob)(msgModel, groupConvo, (0, queuedJob_1.toRegularMessage)((0, dataMessage_1.cleanIncomingDataMessage)(decodedContent?.dataMessage)), lodash_1.noop, sender, '');
    });
};
