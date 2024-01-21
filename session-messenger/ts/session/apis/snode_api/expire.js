"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expireMessageOnSnode = void 0;
const lodash_1 = require("lodash");
const crypto_1 = require("../../crypto");
const utils_1 = require("../../utils");
const String_1 = require("../../utils/String");
const errors_1 = require("../../utils/errors");
const batchRequest_1 = require("./batchRequest");
const getNetworkTime_1 = require("./getNetworkTime");
const snodePool_1 = require("./snodePool");
const snodeSignatures_1 = require("./snodeSignatures");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
async function verifySignature({ pubkey, snodePubkey, expiryApplied, signature, messageHashes, updatedHashes, unchangedHashes, }) {
    if (!expiryApplied || (0, lodash_1.isEmpty)(messageHashes) || (0, lodash_1.isEmpty)(signature)) {
        sessionjs_logger_1.console.warn('verifySignature missing argument');
        return false;
    }
    const edKeyPrivBytes = (0, String_1.fromHexToArray)(snodePubkey);
    const hashes = [...messageHashes, ...updatedHashes];
    if (unchangedHashes && Object.keys(unchangedHashes).length > 0) {
        hashes.push(...Object.entries(unchangedHashes)
            .map(([key, value]) => {
            return `${key}${value}`;
        })
            .sort());
    }
    const verificationString = `${pubkey}${expiryApplied}${hashes.join('')}`;
    const verificationData = utils_1.StringUtils.encode(verificationString, 'utf8');
    sessionjs_logger_1.console.debug('verifySignature verificationString', verificationString);
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    try {
        const isValid = sodium.crypto_sign_verify_detached((0, String_1.fromBase64ToArray)(signature), new Uint8Array(verificationData), edKeyPrivBytes);
        return isValid;
    }
    catch (e) {
        sessionjs_logger_1.console.warn('verifySignature failed with: ', e.message);
        return false;
    }
}
async function processExpirationResults(pubkey, targetNode, swarm, messageHashes) {
    if ((0, lodash_1.isEmpty)(swarm)) {
        throw Error(`expireOnNodes failed! ${messageHashes}`);
    }
    const results = {};
    for (const nodeKey of Object.keys(swarm)) {
        if (!(0, lodash_1.isEmpty)(swarm[nodeKey].failed)) {
            const reason = 'Unknown';
            const statusCode = '404';
            sessionjs_logger_1.console.warn(`loki_message:::expireMessage - Couldn't delete data from: ${targetNode.pubkey_ed25519}${reason && statusCode && ` due to an error ${reason} (${statusCode})`}`);
            results[nodeKey] = { hashes: [], expiry: 0 };
        }
        const updatedHashes = swarm[nodeKey].updated;
        const unchangedHashes = swarm[nodeKey].unchanged;
        const expiryApplied = swarm[nodeKey].expiry;
        const signature = swarm[nodeKey].signature;
        const isValid = await verifySignature({
            pubkey,
            snodePubkey: nodeKey,
            expiryApplied,
            signature,
            messageHashes,
            updatedHashes,
            unchangedHashes,
        });
        if (!isValid) {
            sessionjs_logger_1.console.warn('loki_message:::expireMessage - Signature verification failed!', messageHashes);
        }
        results[nodeKey] = { hashes: updatedHashes, expiry: expiryApplied };
    }
    return results;
}
async function expireOnNodes(targetNode, params) {
    try {
        const result = await (0, batchRequest_1.doSnodeBatchRequest)([
            {
                method: 'expire',
                params,
            },
        ], targetNode, 4000, params.pubkey, 'batch');
        if (!result || result.length !== 1 || result[0]?.code !== 200 || !result[0]?.body) {
            return false;
        }
        try {
            const parsed = result[0].body;
            const expirationResults = await processExpirationResults(params.pubkey, targetNode, parsed.swarm, params.messages);
            sessionjs_logger_1.console.debug('expireOnNodes attempt complete. Here are the results', expirationResults);
            return true;
        }
        catch (e) {
            sessionjs_logger_1.console.warn('expireOnNodes Failed to parse "swarm" result: ', e.msg);
        }
        return false;
    }
    catch (e) {
        sessionjs_logger_1.console.warn('expire - send error:', e, `destination ${targetNode.ip}:${targetNode.port}`);
        throw e;
    }
}
async function expireMessageOnSnode(props) {
    const { messageHash, expireTimer, extend, shorten } = props;
    if (extend && shorten) {
        sessionjs_logger_1.console.error('[expireMessageOnSnode] We cannot extend and shorten a message at the same time', messageHash);
        return;
    }
    const shortenOrExtend = shorten ? 'shorten' : extend ? 'extend' : '';
    const ourPubKey = utils_1.UserUtils.getOurPubKeyStrFromCache();
    if (!ourPubKey) {
        sessionjs_logger_1.console.eror('[expireMessageOnSnode] No pubkey found', messageHash);
        return;
    }
    const swarm = await (0, snodePool_1.getSwarmFor)(ourPubKey);
    const expiry = getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset() + expireTimer;
    const signResult = await snodeSignatures_1.SnodeSignature.generateUpdateExpirySignature({
        shortenOrExtend,
        timestamp: expiry,
        messageHashes: [messageHash],
    });
    if (!signResult) {
        sessionjs_logger_1.console.error('[expireMessageOnSnode] Signing message expiry on swarm failed', messageHash);
        return;
    }
    const params = {
        pubkey: ourPubKey,
        pubkey_ed25519: signResult.pubkey_ed25519.toUpperCase(),
        messages: [messageHash],
        expiry,
        extend: extend || undefined,
        shorten: shorten || undefined,
        signature: signResult?.signature,
    };
    const snode = (0, lodash_1.sample)(swarm);
    if (!snode) {
        throw new errors_1.EmptySwarmError(ourPubKey, 'Ran out of swarm nodes to query');
    }
    try {
        await expireOnNodes(snode, params);
    }
    catch (e) {
        const snodeStr = snode ? `${snode.ip}:${snode.port}` : 'null';
        sessionjs_logger_1.console.warn(`loki_message:::expireMessage - ${e.code ? `${e.code} ` : ''}${e.message} by ${ourPubKey} for ${messageHash} via snode:${snodeStr}`);
        throw e;
    }
}
exports.expireMessageOnSnode = expireMessageOnSnode;
