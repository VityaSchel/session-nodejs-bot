"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnionSending = void 0;
const lodash_1 = require("lodash");
const p_retry_1 = __importDefault(require("p-retry"));
const _1 = require(".");
const onions_1 = require("../apis/snode_api/onions");
const constants_1 = require("../constants");
const onionv4_1 = require("./onionv4");
const OpenGroupPollingUtils_1 = require("../apis/open_group_api/opengroupV2/OpenGroupPollingUtils");
const sogsV3SendMessage_1 = require("../apis/open_group_api/sogsv3/sogsV3SendMessage");
const PnServer_1 = require("../apis/push_notification_api/PnServer");
const FileServerApi_1 = require("../apis/file_server_api/FileServerApi");
const OpenGroupServerPoller_1 = require("../apis/open_group_api/opengroupV2/OpenGroupServerPoller");
const sessionjs_logger_1 = require("../../sessionjs-logger");
const endpointExceptions = ['/reaction'];
const endpointRequiresDecoding = (url) => {
    for (let i = 0; i < endpointExceptions.length; i++) {
        if (url.includes(endpointExceptions[i])) {
            return decodeURIComponent(url);
        }
    }
    return url;
};
const buildSendViaOnionPayload = (url, fetchOptions) => {
    const endpoint = exports.OnionSending.endpointRequiresDecoding(url.search ? `${url.pathname}${url.search}` : url.pathname);
    const payloadObj = {
        method: fetchOptions.method || 'GET',
        body: fetchOptions.body,
        endpoint,
        headers: fetchOptions.headers || {},
    };
    return payloadObj;
};
const getOnionPathForSending = async () => {
    let pathNodes = [];
    try {
        pathNodes = await _1.OnionPaths.getOnionPath({});
    }
    catch (e) {
        sessionjs_logger_1.console.error(`sendViaOnion - getOnionPath Error ${e.code} ${e.message}`);
    }
    if (!pathNodes?.length) {
        sessionjs_logger_1.console.warn('sendViaOnion - failing, no path available');
        return null;
    }
    return pathNodes;
};
const sendViaOnionV4ToNonSnodeWithRetries = async (destinationX25519Key, url, fetchOptions, throwErrors, abortSignal) => {
    if (!fetchOptions.useV4) {
        throw new Error('sendViaOnionV4ToNonSnodeWithRetries is only to be used for onion v4 calls');
    }
    if (typeof destinationX25519Key !== 'string') {
        throw new Error(`destinationX25519Key is not a string ${typeof destinationX25519Key})a`);
    }
    const payloadObj = buildSendViaOnionPayload(url, fetchOptions);
    const forcedHttp = url.protocol === constants_1.PROTOCOLS.HTTP;
    const finalRelayOptions = {
        host: url.hostname,
    };
    if (forcedHttp) {
        finalRelayOptions.protocol = 'http';
    }
    if (forcedHttp) {
        finalRelayOptions.port = url.port ? (0, lodash_1.toNumber)(url.port) : 80;
    }
    let result;
    try {
        result = await (0, p_retry_1.default)(async () => {
            const pathNodes = await exports.OnionSending.getOnionPathForSending();
            if (!pathNodes) {
                throw new Error('getOnionPathForSending is emtpy');
            }
            const onionV4Response = await onions_1.Onions.sendOnionRequestHandlingSnodeEject({
                nodePath: pathNodes,
                destSnodeX25519: destinationX25519Key,
                finalDestOptions: payloadObj,
                finalRelayOptions,
                abortSignal,
                useV4: true,
                throwErrors,
            });
            if (abortSignal?.aborted) {
                sessionjs_logger_1.console.warn('sendViaOnionV4ToNonSnodeRetryable request aborted.');
                throw new p_retry_1.default.AbortError('Request Aborted');
            }
            if (!onionV4Response) {
                sessionjs_logger_1.console.warn('sendViaOnionV4ToNonSnodeRetryable failed during V4 request (in)');
                throw new Error('sendViaOnionV4ToNonSnodeRetryable failed during V4 request. Retrying...');
            }
            const decodedV4 = onionv4_1.OnionV4.decodeV4Response(onionV4Response);
            const foundStatusCode = decodedV4?.metadata?.code || onions_1.STATUS_NO_STATUS;
            if (foundStatusCode < 200 || foundStatusCode > 299) {
                if (foundStatusCode === 400 &&
                    (decodedV4?.body).plainText === OpenGroupServerPoller_1.invalidAuthRequiresBlinding) {
                    return {
                        status_code: foundStatusCode,
                        body: decodedV4?.body || null,
                        bodyBinary: decodedV4?.bodyBinary || null,
                    };
                }
                if (foundStatusCode === 404) {
                    sessionjs_logger_1.console.warn(`Got 404 while sendViaOnionV4ToNonSnodeWithRetries with url:${url}. Stopping retries`);
                    throw new p_retry_1.default.AbortError((0, onions_1.buildErrorMessageWithFailedCode)('sendViaOnionV4ToNonSnodeWithRetries', 404, `with url:${url}. Stopping retries`));
                }
                throw new Error(`sendViaOnionV4ToNonSnodeWithRetries failed with status code: ${foundStatusCode}. Retrying...`);
            }
            return {
                status_code: foundStatusCode,
                body: decodedV4?.body || null,
                bodyBinary: decodedV4?.bodyBinary || null,
            };
        }, {
            retries: 2,
            minTimeout: 100,
            onFailedAttempt: e => {
                sessionjs_logger_1.console.warn(`sendViaOnionV4ToNonSnodeRetryable attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left...: ${e.message}`);
            },
        });
    }
    catch (e) {
        sessionjs_logger_1.console.warn('sendViaOnionV4ToNonSnodeRetryable failed ', e.message, throwErrors);
        if (throwErrors) {
            throw e;
        }
        return null;
    }
    if (abortSignal?.aborted) {
        sessionjs_logger_1.console.warn('sendViaOnionV4ToNonSnodeRetryable request aborted.');
        return null;
    }
    if (!result) {
        sessionjs_logger_1.console.warn('sendViaOnionV4ToNonSnodeRetryable failed during V4 request (out)');
        return null;
    }
    return result;
};
async function sendJsonViaOnionV4ToSogs(sendOptions) {
    const { serverUrl, endpoint, serverPubkey, method, blinded, stringifiedBody, abortSignal, headers: includedHeaders, throwErrors, } = sendOptions;
    if (!endpoint.startsWith('/')) {
        throw new Error('endpoint needs a leading /');
    }
    const builtUrl = new URL(`${serverUrl}${endpoint}`);
    let headersWithSogsHeadersIfNeeded = await OpenGroupPollingUtils_1.OpenGroupPollingUtils.getOurOpenGroupHeaders(serverPubkey, endpoint, method, blinded, stringifiedBody);
    if (!headersWithSogsHeadersIfNeeded) {
        return null;
    }
    headersWithSogsHeadersIfNeeded = { ...includedHeaders, ...headersWithSogsHeadersIfNeeded };
    const res = await exports.OnionSending.sendViaOnionV4ToNonSnodeWithRetries(serverPubkey, builtUrl, {
        method,
        headers: (0, sogsV3SendMessage_1.addJsonContentTypeToHeaders)(headersWithSogsHeadersIfNeeded),
        body: stringifiedBody,
        useV4: true,
    }, throwErrors, abortSignal);
    return res;
}
async function sendJsonViaOnionV4ToPnServer(sendOptions) {
    const { endpoint, method, stringifiedBody, abortSignal } = sendOptions;
    if (!endpoint.startsWith('/')) {
        throw new Error('endpoint needs a leading /');
    }
    const builtUrl = new URL(`${PnServer_1.pnServerUrl}${endpoint}`);
    const res = await exports.OnionSending.sendViaOnionV4ToNonSnodeWithRetries(PnServer_1.pnServerPubkeyHex, builtUrl, {
        method,
        headers: {},
        body: stringifiedBody,
        useV4: true,
    }, false, abortSignal);
    return res;
}
async function sendBinaryViaOnionV4ToSogs(sendOptions) {
    const { serverUrl, endpoint, serverPubkey, method, blinded, bodyBinary, abortSignal, headers: includedHeaders, } = sendOptions;
    if (!bodyBinary) {
        return null;
    }
    if (!endpoint.startsWith('/')) {
        throw new Error('endpoint needs a leading /');
    }
    const builtUrl = new URL(`${serverUrl}${endpoint}`);
    let headersWithSogsHeadersIfNeeded = await OpenGroupPollingUtils_1.OpenGroupPollingUtils.getOurOpenGroupHeaders(serverPubkey, endpoint, method, blinded, bodyBinary);
    if (!headersWithSogsHeadersIfNeeded) {
        return null;
    }
    headersWithSogsHeadersIfNeeded = { ...includedHeaders, ...headersWithSogsHeadersIfNeeded };
    const res = await exports.OnionSending.sendViaOnionV4ToNonSnodeWithRetries(serverPubkey, builtUrl, {
        method,
        headers: (0, sogsV3SendMessage_1.addBinaryContentTypeToHeaders)(headersWithSogsHeadersIfNeeded),
        body: bodyBinary || undefined,
        useV4: true,
    }, false, abortSignal);
    return res;
}
async function sendBinaryViaOnionV4ToFileServer(sendOptions) {
    const { endpoint, method, bodyBinary, abortSignal } = sendOptions;
    if (!endpoint.startsWith('/')) {
        throw new Error('endpoint needs a leading /');
    }
    const builtUrl = new URL(`${FileServerApi_1.fileServerURL}${endpoint}`);
    const res = await exports.OnionSending.sendViaOnionV4ToNonSnodeWithRetries(FileServerApi_1.fileServerPubKey, builtUrl, {
        method,
        headers: {},
        body: bodyBinary,
        useV4: true,
    }, false, abortSignal);
    return res;
}
async function getBinaryViaOnionV4FromFileServer(sendOptions) {
    const { endpoint, method, abortSignal, throwError } = sendOptions;
    if (!endpoint.startsWith('/')) {
        throw new Error('endpoint needs a leading /');
    }
    const builtUrl = new URL(`${FileServerApi_1.fileServerURL}${endpoint}`);
    const res = await exports.OnionSending.sendViaOnionV4ToNonSnodeWithRetries(FileServerApi_1.fileServerPubKey, builtUrl, {
        method,
        headers: {},
        body: null,
        useV4: true,
    }, throwError, abortSignal);
    return res;
}
async function sendJsonViaOnionV4ToFileServer(sendOptions) {
    const { endpoint, method, stringifiedBody, abortSignal } = sendOptions;
    if (!endpoint.startsWith('/')) {
        throw new Error('endpoint needs a leading /');
    }
    const builtUrl = new URL(`${FileServerApi_1.fileServerURL}${endpoint}`);
    const res = await exports.OnionSending.sendViaOnionV4ToNonSnodeWithRetries(FileServerApi_1.fileServerPubKey, builtUrl, {
        method,
        headers: {},
        body: stringifiedBody,
        useV4: true,
    }, false, abortSignal);
    return res;
}
exports.OnionSending = {
    endpointRequiresDecoding,
    sendViaOnionV4ToNonSnodeWithRetries,
    getOnionPathForSending,
    sendJsonViaOnionV4ToSogs,
    sendJsonViaOnionV4ToPnServer,
    sendBinaryViaOnionV4ToFileServer,
    sendBinaryViaOnionV4ToSogs,
    getBinaryViaOnionV4FromFileServer,
    sendJsonViaOnionV4ToFileServer,
};
