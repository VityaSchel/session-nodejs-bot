"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sogsRollingDeletions = void 0;
const RingBuffer_1 = require("../../../utils/RingBuffer");
const rollingDeletedMessageIds = new Map();
const addMessageDeletedId = (conversationId, messageDeletedId) => {
    if (!rollingDeletedMessageIds.has(conversationId)) {
        rollingDeletedMessageIds.set(conversationId, new RingBuffer_1.RingBuffer(exports.sogsRollingDeletions.getPerRoomCount()));
    }
    const ringBuffer = rollingDeletedMessageIds.get(conversationId);
    if (!ringBuffer) {
        return;
    }
    ringBuffer.insert(messageDeletedId);
};
const hasMessageDeletedId = (conversationId, messageDeletedId) => {
    if (!rollingDeletedMessageIds.has(conversationId)) {
        return false;
    }
    const messageIdWasDeletedRecently = rollingDeletedMessageIds
        ?.get(conversationId)
        ?.has(messageDeletedId);
    return messageIdWasDeletedRecently;
};
const emptyMessageDeleteIds = () => {
    rollingDeletedMessageIds.clear();
};
exports.sogsRollingDeletions = {
    addMessageDeletedId,
    hasMessageDeletedId,
    emptyMessageDeleteIds,
    getPerRoomCount,
};
function getPerRoomCount() {
    return 2000;
}
