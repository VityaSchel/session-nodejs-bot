"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = void 0;
const uuid_1 = require("uuid");
class Message {
    timestamp;
    identifier;
    constructor({ timestamp, identifier }) {
        this.timestamp = timestamp;
        if (identifier && identifier.length === 0) {
            throw new Error('Cannot set empty identifier');
        }
        if (!timestamp) {
            throw new Error('Cannot set undefined timestamp');
        }
        this.identifier = identifier || (0, uuid_1.v4)();
    }
}
exports.Message = Message;
