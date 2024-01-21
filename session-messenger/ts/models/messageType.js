"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fillMessageAttributesWithDefaults = exports.MessageDirection = void 0;
const lodash_1 = require("lodash");
const uuid_1 = require("uuid");
const conversationAttributes_1 = require("./conversationAttributes");
var MessageDirection;
(function (MessageDirection) {
    MessageDirection["outgoing"] = "outgoing";
    MessageDirection["incoming"] = "incoming";
    MessageDirection["any"] = "%";
})(MessageDirection || (exports.MessageDirection = MessageDirection = {}));
const fillMessageAttributesWithDefaults = (optAttributes) => {
    const defaulted = (0, lodash_1.defaultsDeep)(optAttributes, {
        expireTimer: 0,
        id: (0, uuid_1.v4)(),
        unread: conversationAttributes_1.READ_MESSAGE_STATE.read,
    });
    if (defaulted.delivered) {
        delete defaulted.delivered;
    }
    if (defaulted.delivered_to) {
        delete defaulted.delivered_to;
    }
    return defaulted;
};
exports.fillMessageAttributesWithDefaults = fillMessageAttributesWithDefaults;
