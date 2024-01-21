"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.READ_MESSAGE_STATE = exports.CONVERSATION_PRIORITIES = exports.fillConvoAttributesWithDefaults = exports.ConversationNotificationSetting = exports.isDirectConversation = exports.isOpenOrClosedGroup = exports.ConversationTypeEnum = void 0;
const lodash_1 = require("lodash");
var ConversationTypeEnum;
(function (ConversationTypeEnum) {
    ConversationTypeEnum["GROUP"] = "group";
    ConversationTypeEnum["GROUPV3"] = "groupv3";
    ConversationTypeEnum["PRIVATE"] = "private";
})(ConversationTypeEnum || (exports.ConversationTypeEnum = ConversationTypeEnum = {}));
function isOpenOrClosedGroup(conversationType) {
    return (conversationType === ConversationTypeEnum.GROUP ||
        conversationType === ConversationTypeEnum.GROUPV3);
}
exports.isOpenOrClosedGroup = isOpenOrClosedGroup;
function isDirectConversation(conversationType) {
    return conversationType === ConversationTypeEnum.PRIVATE;
}
exports.isDirectConversation = isDirectConversation;
exports.ConversationNotificationSetting = ['all', 'disabled', 'mentions_only'];
const fillConvoAttributesWithDefaults = (optAttributes) => {
    return (0, lodash_1.defaults)(optAttributes, {
        members: [],
        zombies: [],
        groupAdmins: [],
        lastJoinedTimestamp: 0,
        expireTimer: 0,
        active_at: 0,
        lastMessageStatus: undefined,
        lastMessage: null,
        triggerNotificationsFor: 'all',
        isTrustedForAttachmentDownload: false,
        isApproved: false,
        didApproveMe: false,
        isKickedFromGroup: false,
        left: false,
        priority: exports.CONVERSATION_PRIORITIES.default,
        markedAsUnread: false,
        blocksSogsMsgReqsTimestamp: 0,
    });
};
exports.fillConvoAttributesWithDefaults = fillConvoAttributesWithDefaults;
exports.CONVERSATION_PRIORITIES = {
    default: 0,
    hidden: -1,
    pinned: 1,
};
exports.READ_MESSAGE_STATE = {
    unread: 1,
    read: 0,
};
