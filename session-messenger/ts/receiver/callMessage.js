"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCallMessage = void 0;
const lodash_1 = __importDefault(require("lodash"));
const protobuf_1 = require("../protobuf");
const getNetworkTime_1 = require("../session/apis/snode_api/getNetworkTime");
const constants_1 = require("../session/constants");
const utils_1 = require("../session/utils");
const cache_1 = require("./cache");
const sessionjs_logger_1 = require("../sessionjs-logger");
async function handleCallMessage(envelope, callMessage) {
    const sender = envelope.senderIdentity || envelope.source;
    const sentTimestamp = lodash_1.default.toNumber(envelope.timestamp);
    const { type } = callMessage;
    if (sender === utils_1.UserUtils.getOurPubKeyStrFromCache() &&
        callMessage.type !== protobuf_1.SignalService.CallMessage.Type.ANSWER &&
        callMessage.type !== protobuf_1.SignalService.CallMessage.Type.END_CALL) {
        sessionjs_logger_1.console.info('Dropping incoming call from ourself');
        await (0, cache_1.removeFromCache)(envelope);
        return;
    }
    if (utils_1.CallManager.isCallRejected(callMessage.uuid)) {
        await (0, cache_1.removeFromCache)(envelope);
        sessionjs_logger_1.console.info(`Dropping already rejected call from this device ${callMessage.uuid}`);
        return;
    }
    if (type === protobuf_1.SignalService.CallMessage.Type.PROVISIONAL_ANSWER) {
        await (0, cache_1.removeFromCache)(envelope);
        sessionjs_logger_1.console.info('Skipping callMessage PROVISIONAL_ANSWER');
        return;
    }
    if (type === protobuf_1.SignalService.CallMessage.Type.PRE_OFFER) {
        await (0, cache_1.removeFromCache)(envelope);
        sessionjs_logger_1.console.info('Skipping callMessage PRE_OFFER');
        return;
    }
    if (type === protobuf_1.SignalService.CallMessage.Type.OFFER) {
        if (Math.max(sentTimestamp - getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset()) > constants_1.TTL_DEFAULT.CALL_MESSAGE) {
            sessionjs_logger_1.console.info('Dropping incoming OFFER callMessage sent a while ago: ', sentTimestamp);
            await (0, cache_1.removeFromCache)(envelope);
            return;
        }
        await (0, cache_1.removeFromCache)(envelope);
        await utils_1.CallManager.handleCallTypeOffer(sender, callMessage, sentTimestamp);
        return;
    }
    if (type === protobuf_1.SignalService.CallMessage.Type.END_CALL) {
        await (0, cache_1.removeFromCache)(envelope);
        await utils_1.CallManager.handleCallTypeEndCall(sender, callMessage.uuid);
        return;
    }
    if (type === protobuf_1.SignalService.CallMessage.Type.ANSWER) {
        await (0, cache_1.removeFromCache)(envelope);
        await utils_1.CallManager.handleCallTypeAnswer(sender, callMessage, sentTimestamp);
        return;
    }
    if (type === protobuf_1.SignalService.CallMessage.Type.ICE_CANDIDATES) {
        await (0, cache_1.removeFromCache)(envelope);
        await utils_1.CallManager.handleCallTypeIceCandidates(sender, callMessage, sentTimestamp);
        return;
    }
    await (0, cache_1.removeFromCache)(envelope);
    await utils_1.CallManager.handleOtherCallTypes(sender, callMessage, sentTimestamp);
}
exports.handleCallMessage = handleCallMessage;
