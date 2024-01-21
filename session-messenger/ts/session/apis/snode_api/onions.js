"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Onions = exports.snodeHttpsAgent = exports.STATUS_NO_STATUS = exports.processOnionRequestErrorAtDestination = exports.CLOCK_OUT_OF_SYNC_MESSAGE_ERROR = exports.ERROR_421_HANDLED_RETRY_REQUEST = exports.NEXT_NODE_NOT_FOUND_PREFIX = exports.buildErrorMessageWithFailedCode = exports.was404Error = exports.OXEN_SERVER_ERROR = exports.resetSnodeFailureCount = void 0;
const https_1 = __importDefault(require("https"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const bytebuffer_1 = __importDefault(require("bytebuffer"));
const p_retry_1 = __importDefault(require("p-retry"));
const lodash_1 = require("lodash");
const libsodium_wrappers_sumo_1 = require("libsodium-wrappers-sumo");
const snodePool_1 = require("./snodePool");
const onions_1 = require("../../onions");
const String_1 = require("../../utils/String");
const onionPath_1 = require("../../onions/onionPath");
const SNodeAPI_1 = require("./SNodeAPI");
const PnServer_1 = require("../push_notification_api/PnServer");
const util_worker_interface_1 = require("../../../webworker/workers/browser/util_worker_interface");
const onionv4_1 = require("../../onions/onionv4");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
let snodeFailureCount = {};
const resetSnodeFailureCount = () => {
    snodeFailureCount = {};
};
exports.resetSnodeFailureCount = resetSnodeFailureCount;
const snodeFailureThreshold = 3;
exports.OXEN_SERVER_ERROR = 'Oxen Server error';
const errorContent404 = ': 404 ';
const was404Error = (error) => error.message.includes(errorContent404);
exports.was404Error = was404Error;
const buildErrorMessageWithFailedCode = (prefix, code, suffix) => `${prefix}: ${code} ${suffix}`;
exports.buildErrorMessageWithFailedCode = buildErrorMessageWithFailedCode;
exports.NEXT_NODE_NOT_FOUND_PREFIX = 'Next node not found: ';
exports.ERROR_421_HANDLED_RETRY_REQUEST = '421 handled. Retry this request with a new targetNode';
exports.CLOCK_OUT_OF_SYNC_MESSAGE_ERROR = 'Your clock is out of sync with the network. Check your clock.';
async function encryptOnionV4RequestForPubkey(pubKeyX25519hex, requestInfo) {
    const plaintext = (0, onionv4_1.encodeV4Request)(requestInfo);
    return (0, util_worker_interface_1.callUtilsWorker)('encryptForPubkey', pubKeyX25519hex, plaintext);
}
async function encryptForPubKey(pubKeyX25519hex, requestInfo) {
    const plaintext = new TextEncoder().encode(JSON.stringify(requestInfo));
    return (0, util_worker_interface_1.callUtilsWorker)('encryptForPubkey', pubKeyX25519hex, plaintext);
}
async function encryptForRelayV2(relayX25519hex, destination, ctx) {
    if (!destination.host && !destination.destination) {
        sessionjs_logger_1.console.warn('loki_rpc::encryptForRelayV2 - no destination', destination);
    }
    const reqObj = {
        ...destination,
        ephemeral_key: (0, String_1.toHex)(ctx.ephemeralKey),
    };
    const plaintext = encodeCiphertextPlusJson(ctx.ciphertext, reqObj);
    return (0, util_worker_interface_1.callUtilsWorker)('encryptForPubkey', relayX25519hex, plaintext);
}
function encodeCiphertextPlusJson(ciphertext, payloadJson) {
    const payloadStr = JSON.stringify(payloadJson);
    const bufferJson = bytebuffer_1.default.wrap(payloadStr, 'utf8');
    const len = ciphertext.length;
    const arrayLen = bufferJson.buffer.length + 4 + len;
    const littleEndian = true;
    const buffer = new bytebuffer_1.default(arrayLen, littleEndian);
    buffer.writeInt32(len);
    buffer.append(ciphertext);
    buffer.append(bufferJson);
    return new Uint8Array(buffer.buffer);
}
async function buildOnionCtxs(nodePath, destCtx, useV4, targetED25519Hex, finalRelayOptions) {
    const ctxes = [destCtx];
    if (!nodePath) {
        throw new Error('buildOnionCtxs needs a valid path');
    }
    const firstPos = nodePath.length - 1;
    for (let i = firstPos; i > -1; i -= 1) {
        let dest;
        const relayingToFinalDestination = i === firstPos;
        if (relayingToFinalDestination && finalRelayOptions) {
            const isCallToPn = finalRelayOptions?.host === PnServer_1.hrefPnServerProd;
            const target = !isCallToPn && !useV4 ? '/loki/v3/lsrpc' : '/oxen/v4/lsrpc';
            dest = {
                host: finalRelayOptions.host,
                target,
                method: 'POST',
            };
            if (finalRelayOptions?.protocol === 'http') {
                dest.protocol = finalRelayOptions.protocol;
                dest.port = finalRelayOptions.port || 80;
            }
        }
        else {
            let pubkeyHex = targetED25519Hex;
            if (!relayingToFinalDestination) {
                pubkeyHex = nodePath[i + 1].pubkey_ed25519;
                if (!pubkeyHex) {
                    sessionjs_logger_1.console.error('loki_rpc:::buildOnionGuardNodePayload - no ed25519 for', nodePath[i + 1], 'path node', i + 1);
                }
            }
            dest = {
                destination: pubkeyHex,
            };
        }
        try {
            const ctx = await encryptForRelayV2(nodePath[i].pubkey_x25519, dest, ctxes[ctxes.length - 1]);
            ctxes.push(ctx);
        }
        catch (e) {
            sessionjs_logger_1.console.error('loki_rpc:::buildOnionGuardNodePayload - encryptForRelayV2 failure', e.code, e.message);
            throw e;
        }
    }
    return ctxes;
}
async function buildOnionGuardNodePayload(nodePath, destCtx, useV4, targetED25519Hex, finalRelayOptions) {
    const ctxes = await buildOnionCtxs(nodePath, destCtx, useV4, targetED25519Hex, finalRelayOptions);
    const guardCtx = ctxes[ctxes.length - 1];
    const guardPayloadObj = {
        ephemeral_key: (0, String_1.toHex)(guardCtx.ephemeralKey),
    };
    return encodeCiphertextPlusJson(guardCtx.ciphertext, guardPayloadObj);
}
function process406Or425Error(statusCode) {
    if (statusCode === 406 || statusCode === 425) {
        throw new p_retry_1.default.AbortError(exports.CLOCK_OUT_OF_SYNC_MESSAGE_ERROR);
    }
}
function processOxenServerError(_statusCode, body) {
    if (body === exports.OXEN_SERVER_ERROR) {
        sessionjs_logger_1.console.warn('[path] Got Oxen server Error. Not much to do if the server has troubles.');
        throw new p_retry_1.default.AbortError(exports.OXEN_SERVER_ERROR);
    }
}
async function process421Error(statusCode, body, associatedWith, destinationSnodeEd25519) {
    if (statusCode === 421) {
        await handle421InvalidSwarm({
            destinationSnodeEd25519,
            body,
            associatedWith,
        });
    }
}
async function processOnionRequestErrorAtDestination({ statusCode, body, destinationSnodeEd25519, associatedWith, }) {
    if (statusCode === 200) {
        return;
    }
    sessionjs_logger_1.console.info(`processOnionRequestErrorAtDestination. statusCode nok: ${statusCode}: "${body}"`);
    process406Or425Error(statusCode);
    processOxenServerError(statusCode, body);
    await process421Error(statusCode, body, associatedWith, destinationSnodeEd25519);
    if (destinationSnodeEd25519) {
        await processAnyOtherErrorAtDestination(statusCode, body, destinationSnodeEd25519, associatedWith);
    }
}
exports.processOnionRequestErrorAtDestination = processOnionRequestErrorAtDestination;
async function handleNodeNotFound({ ed25519NotFound, associatedWith, }) {
    const shortNodeNotFound = (0, onionPath_1.ed25519Str)(ed25519NotFound);
    sessionjs_logger_1.console.warn('Handling NODE NOT FOUND with: ', shortNodeNotFound);
    if (associatedWith) {
        await (0, snodePool_1.dropSnodeFromSwarmIfNeeded)(associatedWith, ed25519NotFound);
    }
    await (0, snodePool_1.dropSnodeFromSnodePool)(ed25519NotFound);
    snodeFailureCount[ed25519NotFound] = 0;
    await onions_1.OnionPaths.dropSnodeFromPath(ed25519NotFound);
}
async function processAnyOtherErrorOnPath(status, guardNodeEd25519, ciphertext, associatedWith) {
    if (status !== 200) {
        sessionjs_logger_1.console.warn(`[path] Got status: ${status}`);
        if (status === 404 || status === 400) {
            sessionjs_logger_1.console.warn('processAnyOtherErrorOnPathgot 404 or 400, probably a dead sogs. Skipping bad path update');
            return;
        }
        if (ciphertext?.startsWith(exports.NEXT_NODE_NOT_FOUND_PREFIX)) {
            const nodeNotFound = ciphertext.substr(exports.NEXT_NODE_NOT_FOUND_PREFIX.length);
            await handleNodeNotFound({ ed25519NotFound: nodeNotFound, associatedWith });
        }
        else {
            await (0, onionPath_1.incrementBadPathCountOrDrop)(guardNodeEd25519);
        }
        processOxenServerError(status, ciphertext);
        throw new Error(`Bad Path handled. Retry this request. Status: ${status}`);
    }
}
async function processAnyOtherErrorAtDestination(status, body, destinationEd25519, associatedWith) {
    if (status !== 400 &&
        status !== 406 &&
        status !== 421) {
        sessionjs_logger_1.console.warn(`[path] Got status at destination: ${status}`);
        if (body?.startsWith(exports.NEXT_NODE_NOT_FOUND_PREFIX)) {
            const nodeNotFound = body.substr(exports.NEXT_NODE_NOT_FOUND_PREFIX.length);
            await handleNodeNotFound({
                ed25519NotFound: nodeNotFound,
                associatedWith,
            });
            throw new p_retry_1.default.AbortError(`Bad Path handled. Retry this request with another targetNode. Status: ${status}`);
        }
        await exports.Onions.incrementBadSnodeCountOrDrop({
            snodeEd25519: destinationEd25519,
            associatedWith,
        });
        throw new Error(`Bad Path handled. Retry this request. Status: ${status}`);
    }
}
async function processOnionRequestErrorOnPath(httpStatusCode, ciphertext, guardNodeEd25519, destinationEd25519Key, associatedWith) {
    let cipherAsString = '';
    if ((0, lodash_1.isString)(ciphertext)) {
        cipherAsString = ciphertext;
    }
    else {
        try {
            cipherAsString = (0, libsodium_wrappers_sumo_1.to_string)(new Uint8Array(ciphertext));
        }
        catch (e) {
            cipherAsString = '';
        }
    }
    if (httpStatusCode !== 200) {
        sessionjs_logger_1.console.warn('processOnionRequestErrorOnPath:', ciphertext);
    }
    process406Or425Error(httpStatusCode);
    await process421Error(httpStatusCode, cipherAsString, associatedWith, destinationEd25519Key);
    await processAnyOtherErrorOnPath(httpStatusCode, guardNodeEd25519, cipherAsString, associatedWith);
}
function processAbortedRequest(abortSignal) {
    if (abortSignal?.aborted) {
        sessionjs_logger_1.console.warn('[path] Call aborted');
        throw new p_retry_1.default.AbortError('Request got aborted');
    }
}
const debug = false;
async function decodeOnionResult(symmetricKey, ciphertext) {
    let parsedCiphertext = ciphertext;
    try {
        const jsonRes = JSON.parse(ciphertext);
        parsedCiphertext = jsonRes.result;
    }
    catch (e) {
    }
    const ciphertextBuffer = await (0, util_worker_interface_1.callUtilsWorker)('fromBase64ToArrayBuffer', parsedCiphertext);
    const plaintextBuffer = (await (0, util_worker_interface_1.callUtilsWorker)('DecryptAESGCM', new Uint8Array(symmetricKey), new Uint8Array(ciphertextBuffer)));
    return {
        ciphertextBuffer,
        plaintext: new TextDecoder().decode(plaintextBuffer),
        plaintextBuffer,
    };
}
exports.STATUS_NO_STATUS = 8888;
async function processOnionResponse({ response, symmetricKey, guardNode, abortSignal, associatedWith, destinationSnodeEd25519, }) {
    let ciphertext = '';
    processAbortedRequest(abortSignal);
    try {
        ciphertext = (await response?.text()) || '';
    }
    catch (e) {
        sessionjs_logger_1.console.warn(e);
    }
    await processOnionRequestErrorOnPath(response?.status || exports.STATUS_NO_STATUS, ciphertext, guardNode.pubkey_ed25519, destinationSnodeEd25519, associatedWith);
    if (!ciphertext) {
        sessionjs_logger_1.console.warn('[path] sessionRpc::processingOnionResponse - Target node return empty ciphertext');
        throw new Error('Target node return empty ciphertext');
    }
    let plaintext;
    let ciphertextBuffer;
    try {
        if (!symmetricKey) {
            throw new Error('Decoding onion requests needs a symmetricKey');
        }
        const decoded = await exports.Onions.decodeOnionResult(symmetricKey, ciphertext);
        plaintext = decoded.plaintext;
        ciphertextBuffer = decoded.ciphertextBuffer;
    }
    catch (e) {
        sessionjs_logger_1.console.error('[path] sessionRpc::processingOnionResponse - decode error', e);
        if (symmetricKey) {
            sessionjs_logger_1.console.error('[path] sessionRpc::processingOnionResponse - symmetricKey', (0, String_1.toHex)(symmetricKey));
        }
        if (ciphertextBuffer) {
            sessionjs_logger_1.console.error('[path] sessionRpc::processingOnionResponse - ciphertextBuffer', (0, String_1.toHex)(ciphertextBuffer));
        }
        throw new Error('Ciphertext decode error');
    }
    if (debug) {
        sessionjs_logger_1.console.debug('sessionRpc::processingOnionResponse - plaintext', plaintext);
    }
    try {
        const jsonRes = JSON.parse(plaintext, (_key, value) => {
            if (typeof value === 'number' && value > Number.MAX_SAFE_INTEGER) {
                sessionjs_logger_1.console.warn('Received an out of bounds js number');
            }
            return value;
        });
        const status = jsonRes.status_code || jsonRes.status;
        await processOnionRequestErrorAtDestination({
            statusCode: status,
            body: jsonRes?.body,
            destinationSnodeEd25519,
            associatedWith,
        });
        return jsonRes;
    }
    catch (e) {
        sessionjs_logger_1.console.error(`[path] sessionRpc::processingOnionResponse - Rethrowing error ${e.message}'`);
        throw e;
    }
}
async function processNoSymmetricKeyError(guardNode, symmetricKey) {
    if (!symmetricKey) {
        const errorMsg = 'No symmetric key to decode response, probably a time out on the onion request itself';
        sessionjs_logger_1.console.error(errorMsg);
        await (0, onionPath_1.incrementBadPathCountOrDrop)(guardNode.pubkey_ed25519);
        throw new Error(errorMsg);
    }
    return symmetricKey;
}
async function processOnionResponseV4({ response, symmetricKey, abortSignal, guardNode, destinationSnodeEd25519, associatedWith, }) {
    processAbortedRequest(abortSignal);
    const validSymmetricKey = await processNoSymmetricKeyError(guardNode, symmetricKey);
    const cipherText = (await response?.arrayBuffer()) || new ArrayBuffer(0);
    if (!cipherText) {
        sessionjs_logger_1.console.warn('[path] sessionRpc::processOnionResponseV4 - Target node/path return empty ciphertext');
        throw new Error('Target node return empty ciphertext');
    }
    await processOnionRequestErrorOnPath(response?.status || exports.STATUS_NO_STATUS, cipherText, guardNode.pubkey_ed25519, destinationSnodeEd25519, associatedWith);
    const plaintextBuffer = await (0, util_worker_interface_1.callUtilsWorker)('DecryptAESGCM', new Uint8Array(validSymmetricKey), new Uint8Array(cipherText));
    const bodyBinary = new Uint8Array(plaintextBuffer);
    return {
        bodyBinary,
    };
}
exports.snodeHttpsAgent = new https_1.default.Agent({
    rejectUnauthorized: false,
});
async function handle421InvalidSwarm({ body, destinationSnodeEd25519, associatedWith, }) {
    if (!destinationSnodeEd25519 || !associatedWith) {
        throw new Error('status 421 without a final destination or no associatedWith makes no sense');
    }
    sessionjs_logger_1.console.info(`Invalidating swarm for ${(0, onionPath_1.ed25519Str)(associatedWith)}`);
    try {
        const parsedBody = JSON.parse(body);
        if (parsedBody?.snodes?.length) {
            sessionjs_logger_1.console.warn(`Wrong swarm, now looking for pk ${(0, onionPath_1.ed25519Str)(associatedWith)} at snodes: `, parsedBody.snodes.map((s) => (0, onionPath_1.ed25519Str)(s.pubkey_ed25519)));
            await (0, snodePool_1.updateSwarmFor)(associatedWith, parsedBody.snodes);
            throw new p_retry_1.default.AbortError(exports.ERROR_421_HANDLED_RETRY_REQUEST);
        }
        await (0, snodePool_1.dropSnodeFromSwarmIfNeeded)(associatedWith, destinationSnodeEd25519);
    }
    catch (e) {
        if (e.message !== exports.ERROR_421_HANDLED_RETRY_REQUEST) {
            sessionjs_logger_1.console.warn('Got error while parsing 421 result. Dropping this snode from the swarm of this pubkey', e);
            await (0, snodePool_1.dropSnodeFromSwarmIfNeeded)(associatedWith, destinationSnodeEd25519);
        }
    }
    await exports.Onions.incrementBadSnodeCountOrDrop({
        snodeEd25519: destinationSnodeEd25519,
        associatedWith,
    });
    throw new p_retry_1.default.AbortError(exports.ERROR_421_HANDLED_RETRY_REQUEST);
}
async function incrementBadSnodeCountOrDrop({ snodeEd25519, associatedWith, }) {
    const oldFailureCount = snodeFailureCount[snodeEd25519] || 0;
    const newFailureCount = oldFailureCount + 1;
    snodeFailureCount[snodeEd25519] = newFailureCount;
    if (newFailureCount >= snodeFailureThreshold) {
        sessionjs_logger_1.console.warn(`Failure threshold reached for snode: ${(0, onionPath_1.ed25519Str)(snodeEd25519)}; dropping it.`);
        if (associatedWith) {
            await (0, snodePool_1.dropSnodeFromSwarmIfNeeded)(associatedWith, snodeEd25519);
        }
        await (0, snodePool_1.dropSnodeFromSnodePool)(snodeEd25519);
        snodeFailureCount[snodeEd25519] = 0;
        await onions_1.OnionPaths.dropSnodeFromPath(snodeEd25519);
    }
    else {
        sessionjs_logger_1.console.warn(`Couldn't reach snode at: ${(0, onionPath_1.ed25519Str)(snodeEd25519)}; setting his failure count to ${newFailureCount}`);
    }
}
async function sendOnionRequestHandlingSnodeEject({ destSnodeX25519, finalDestOptions, nodePath, abortSignal, associatedWith, finalRelayOptions, useV4, throwErrors, }) {
    let response;
    let decodingSymmetricKey;
    try {
        const result = await sendOnionRequestNoRetries({
            nodePath,
            destSnodeX25519,
            finalDestOptions,
            finalRelayOptions,
            abortSignal,
            useV4,
        });
        response = result.response;
        if (!(0, lodash_1.isEmpty)(finalRelayOptions) &&
            response.status === 502 &&
            response.statusText === 'Bad Gateway') {
            throw new p_retry_1.default.AbortError('ENETUNREACH');
        }
        decodingSymmetricKey = result.decodingSymmetricKey;
    }
    catch (e) {
        sessionjs_logger_1.console.warn('sendOnionRequestNoRetries error message: ', e.message);
        if (e.code === 'ENETUNREACH' || e.message === 'ENETUNREACH' || throwErrors) {
            throw e;
        }
    }
    const destinationSnodeEd25519 = (isFinalDestinationSnode(finalDestOptions) && finalDestOptions?.destination_ed25519_hex) ||
        undefined;
    if (useV4) {
        return exports.Onions.processOnionResponseV4({
            response,
            symmetricKey: decodingSymmetricKey,
            guardNode: nodePath[0],
            destinationSnodeEd25519,
            abortSignal,
            associatedWith,
        });
    }
    return exports.Onions.processOnionResponse({
        response,
        symmetricKey: decodingSymmetricKey,
        guardNode: nodePath[0],
        destinationSnodeEd25519,
        abortSignal,
        associatedWith,
    });
}
function throwIfInvalidV4RequestInfos(request) {
    if (isFinalDestinationSnode(request)) {
        throw new Error('v4onion request needs endpoint pubkey and method at least');
    }
    const { body, endpoint, headers, method } = request;
    if (!endpoint || !method) {
        throw new Error('v4onion request needs endpoint pubkey and method at least');
    }
    const requestInfos = {
        endpoint,
        headers,
        method,
        body,
    };
    return requestInfos;
}
function isFinalDestinationNonSnode(options) {
    return options.method !== undefined;
}
function isFinalDestinationSnode(options) {
    return options.destination_ed25519_hex !== undefined;
}
const sendOnionRequestNoRetries = async ({ nodePath, destSnodeX25519: destX25519hex, finalDestOptions: finalDestOptionsOri, finalRelayOptions, abortSignal, useV4, }) => {
    const finalDestOptions = (0, lodash_1.cloneDeep)((0, lodash_1.omit)(finalDestOptionsOri, ['destination_ed25519_hex']));
    if (typeof destX25519hex !== 'string') {
        sessionjs_logger_1.console.warn('destX25519hex was not a string');
        throw new Error('sendOnionRequestNoRetries: destX25519hex was not a string');
    }
    finalDestOptions.headers = finalDestOptions.headers || {};
    const isRequestToSnode = !finalRelayOptions;
    let destCtx;
    try {
        const bodyString = (0, lodash_1.isString)(finalDestOptions.body) ? finalDestOptions.body : null;
        const bodyBinary = !(0, lodash_1.isString)(finalDestOptions.body) && finalDestOptions.body ? finalDestOptions.body : null;
        if (isRequestToSnode) {
            if (useV4) {
                throw new Error('sendOnionRequestNoRetries calls cannot be v4 for now.');
            }
            if (!(0, lodash_1.isString)(finalDestOptions.body)) {
                sessionjs_logger_1.console.warn('sendOnionRequestNoRetries calls should only take body as string: ', typeof finalDestOptions.body);
                throw new Error('sendOnionRequestNoRetries calls should only take body as string.');
            }
            finalDestOptions.body = null;
            const textEncoder = new TextEncoder();
            const bodyEncoded = bodyString ? textEncoder.encode(bodyString) : bodyBinary;
            if (!bodyEncoded) {
                throw new Error('bodyEncoded is empty after encoding');
            }
            destCtx = (await (0, util_worker_interface_1.callUtilsWorker)('encryptForPubkey', destX25519hex, encodeCiphertextPlusJson(bodyEncoded, finalDestOptions)));
        }
        else {
            destCtx = useV4
                ? await encryptOnionV4RequestForPubkey(destX25519hex, throwIfInvalidV4RequestInfos(finalDestOptions))
                : await encryptForPubKey(destX25519hex, finalDestOptions);
        }
    }
    catch (e) {
        sessionjs_logger_1.console.error('sendOnionRequestNoRetries - encryptForPubKey failure [', e.code, e.message, '] destination X25519', destX25519hex.substring(0, 32), '...', destX25519hex.substring(32));
        throw e;
    }
    const targetEd25519hex = (isFinalDestinationSnode(finalDestOptionsOri) && finalDestOptionsOri.destination_ed25519_hex) ||
        undefined;
    const payload = await buildOnionGuardNodePayload(nodePath, destCtx, useV4, targetEd25519hex, finalRelayOptions);
    const guardNode = nodePath[0];
    const guardFetchOptions = {
        method: 'POST',
        body: payload,
        agent: exports.snodeHttpsAgent,
        headers: {
            'User-Agent': 'WhatsApp',
            'Accept-Language': 'en-us',
        },
        timeout: 25000,
    };
    if (abortSignal) {
        guardFetchOptions.signal = abortSignal;
    }
    const guardUrl = `https://${guardNode.ip}:${guardNode.port}/onion_req/v2`;
    const response = await (0, node_fetch_1.default)(guardUrl, guardFetchOptions);
    return { response, decodingSymmetricKey: destCtx.symmetricKey };
};
async function sendOnionRequestSnodeDest(onionPath, targetNode, headers, plaintext, associatedWith) {
    return exports.Onions.sendOnionRequestHandlingSnodeEject({
        nodePath: onionPath,
        destSnodeX25519: targetNode.pubkey_x25519,
        finalDestOptions: {
            destination_ed25519_hex: targetNode.pubkey_ed25519,
            body: plaintext,
            headers,
        },
        associatedWith,
        useV4: false,
        throwErrors: false,
    });
}
function getPathString(pathObjArr) {
    return pathObjArr.map(node => `${node.ip}:${node.port}`).join(', ');
}
async function lokiOnionFetch({ targetNode, associatedWith, body, headers, }) {
    try {
        const retriedResult = await (0, p_retry_1.default)(async () => {
            const path = await onions_1.OnionPaths.getOnionPath({ toExclude: targetNode });
            const result = await sendOnionRequestSnodeDest(path, targetNode, headers, body, associatedWith);
            return result;
        }, {
            retries: 3,
            factor: 1,
            minTimeout: 100,
            onFailedAttempt: e => {
                sessionjs_logger_1.console.warn(`onionFetchRetryable attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left...`);
            },
        });
        return retriedResult;
    }
    catch (e) {
        sessionjs_logger_1.console.warn('onionFetchRetryable failed ', e.message);
        if (e?.errno === 'ENETUNREACH') {
            throw new Error(SNodeAPI_1.ERROR_CODE_NO_CONNECT);
        }
        if (e?.message === exports.CLOCK_OUT_OF_SYNC_MESSAGE_ERROR) {
            sessionjs_logger_1.console.warn('Its a clock out of sync error ');
            throw new p_retry_1.default.AbortError(exports.CLOCK_OUT_OF_SYNC_MESSAGE_ERROR);
        }
        throw e;
    }
}
exports.Onions = {
    sendOnionRequestHandlingSnodeEject,
    incrementBadSnodeCountOrDrop,
    decodeOnionResult,
    lokiOnionFetch,
    getPathString,
    sendOnionRequestSnodeDest,
    processOnionResponse,
    processOnionResponseV4,
    isFinalDestinationSnode,
    isFinalDestinationNonSnode,
};
