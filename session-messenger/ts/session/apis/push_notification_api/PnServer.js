"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyPnServer = exports.pnServerUrl = exports.hrefPnServerProd = exports.pnServerPubkeyHex = void 0;
const abort_controller_1 = __importDefault(require("abort-controller"));
const util_worker_interface_1 = require("../../../webworker/workers/browser/util_worker_interface");
const onionSend_1 = require("../../onions/onionSend");
exports.pnServerPubkeyHex = '642a6585919742e5a2d4dc51244964fbcd8bcab2b75612407de58b810740d049';
exports.hrefPnServerProd = 'live.apns.getsession.org';
exports.pnServerUrl = `https://${exports.hrefPnServerProd}`;
async function notifyPnServer(wrappedEnvelope, sentTo) {
    const wrappedEnvelopeBase64 = await (0, util_worker_interface_1.callUtilsWorker)('arrayBufferToStringBase64', wrappedEnvelope);
    await onionSend_1.OnionSending.sendJsonViaOnionV4ToPnServer({
        abortSignal: new abort_controller_1.default().signal,
        endpoint: '/notify',
        method: 'POST',
        stringifiedBody: JSON.stringify({
            data: wrappedEnvelopeBase64,
            send_to: sentTo,
        }),
    });
}
exports.notifyPnServer = notifyPnServer;
