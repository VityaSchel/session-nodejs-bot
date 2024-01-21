"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeGroupPubKeyFromHex = exports.isClosedGroup = exports.getGroupMembers = void 0;
const types_1 = require("../types");
const conversations_1 = require("../conversations");
const String_1 = require("./String");
function getGroupMembers(groupId) {
    const groupConversation = (0, conversations_1.getConversationController)().get(groupId.key);
    const groupMembers = groupConversation ? groupConversation.get('members') : undefined;
    if (!groupMembers) {
        return [];
    }
    return groupMembers.map(types_1.PubKey.cast);
}
exports.getGroupMembers = getGroupMembers;
function isClosedGroup(groupId) {
    const conversation = (0, conversations_1.getConversationController)().get(groupId.key);
    if (!conversation) {
        return false;
    }
    return Boolean(conversation.isClosedGroup());
}
exports.isClosedGroup = isClosedGroup;
function encodeGroupPubKeyFromHex(hexGroupPublicKey) {
    const pubkey = types_1.PubKey.cast(hexGroupPublicKey);
    return (0, String_1.fromHexToArray)(pubkey.key);
}
exports.encodeGroupPubKeyFromHex = encodeGroupPubKeyFromHex;
