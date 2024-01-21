"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IncomingMessage = void 0;
const long_1 = __importDefault(require("long"));
class IncomingMessage {
    envelopeTimestamp;
    authorOrGroupPubkey;
    authorInGroup;
    messageHash;
    message;
    constructor({ envelopeTimestamp, authorOrGroupPubkey, authorInGroup, message, messageHash, }) {
        if (envelopeTimestamp > long_1.default.fromNumber(Number.MAX_SAFE_INTEGER)) {
            throw new Error('envelopeTimestamp as Long is > Number.MAX_SAFE_INTEGER');
        }
        this.envelopeTimestamp = envelopeTimestamp.toNumber();
        this.authorOrGroupPubkey = authorOrGroupPubkey;
        this.authorInGroup = authorInGroup;
        this.messageHash = messageHash;
        this.message = message;
    }
}
exports.IncomingMessage = IncomingMessage;
