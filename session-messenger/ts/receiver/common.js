"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEnvelopeId = void 0;
const lodash_1 = require("lodash");
function getEnvelopeId(envelope) {
    if (envelope.source) {
        return `${envelope.source} ${(0, lodash_1.toNumber)(envelope.timestamp)} (${envelope.id})`;
    }
    return envelope.id;
}
exports.getEnvelopeId = getEnvelopeId;
