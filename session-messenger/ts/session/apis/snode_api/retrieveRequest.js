"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnodeAPIRetrieve = void 0;
const lodash_1 = require("lodash");
const batchRequest_1 = require("./batchRequest");
const getNetworkTime_1 = require("./getNetworkTime");
const namespaces_1 = require("./namespaces");
const constants_1 = require("../../constants");
const utils_1 = require("../../utils");
const snodeSignatures_1 = require("./snodeSignatures");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
async function buildRetrieveRequest(lastHashes, pubkey, namespaces, ourPubkey, configHashesToBump) {
    const maxSizeMap = namespaces_1.SnodeNamespace.maxSizeMap(namespaces);
    const retrieveRequestsParams = await Promise.all(namespaces.map(async (namespace, index) => {
        const foundMaxSize = maxSizeMap.find(m => m.namespace === namespace)?.maxSize;
        const retrieveParam = {
            pubkey,
            last_hash: lastHashes.at(index) || '',
            namespace,
            timestamp: getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset(),
            max_size: foundMaxSize,
        };
        if (namespace === namespaces_1.SnodeNamespaces.ClosedGroupMessage) {
            if (pubkey === ourPubkey || !pubkey.startsWith('05')) {
                throw new Error('namespace -10 can only be used to retrieve messages from a legacy closed group (prefix 05)');
            }
            const retrieveLegacyClosedGroup = {
                ...retrieveParam,
                namespace,
            };
            const retrieveParamsLegacy = {
                method: 'retrieve',
                params: (0, lodash_1.omit)(retrieveLegacyClosedGroup, 'timestamp'),
            };
            return retrieveParamsLegacy;
        }
        if (!namespaces_1.SnodeNamespace.isUserConfigNamespace(namespace) &&
            namespace !== namespaces_1.SnodeNamespaces.UserMessages) {
            throw new Error(`not a legacy closed group. namespace can only be 0 and was ${namespace}`);
        }
        if (pubkey !== ourPubkey) {
            throw new Error('not a legacy closed group. pubkey can only be ours');
        }
        const signatureArgs = { ...retrieveParam, method: 'retrieve', ourPubkey };
        const signatureBuilt = await snodeSignatures_1.SnodeSignature.getSnodeSignatureParams(signatureArgs);
        const retrieve = {
            method: 'retrieve',
            params: { ...retrieveParam, ...signatureBuilt },
        };
        return retrieve;
    }));
    if (configHashesToBump?.length) {
        const expiry = getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset() + constants_1.DURATION.DAYS * 30;
        const signResult = await snodeSignatures_1.SnodeSignature.generateUpdateExpirySignature({
            shortenOrExtend: '',
            timestamp: expiry,
            messageHashes: configHashesToBump,
        });
        if (!signResult) {
            sessionjs_logger_1.console.warn(`SnodeSignature.generateUpdateExpirySignature returned result empty for hashes ${configHashesToBump}`);
        }
        else {
            const expireParams = {
                method: 'expire',
                params: {
                    messages: configHashesToBump,
                    pubkey: utils_1.UserUtils.getOurPubKeyStrFromCache(),
                    expiry,
                    signature: signResult.signature,
                    pubkey_ed25519: signResult.pubkey_ed25519,
                },
            };
            retrieveRequestsParams.push(expireParams);
        }
    }
    return retrieveRequestsParams;
}
async function retrieveNextMessages(targetNode, lastHashes, associatedWith, namespaces, ourPubkey, configHashesToBump) {
    if (namespaces.length !== lastHashes.length) {
        throw new Error('namespaces and lasthashes does not match');
    }
    const retrieveRequestsParams = await buildRetrieveRequest(lastHashes, associatedWith, namespaces, ourPubkey, configHashesToBump);
    const results = await (0, batchRequest_1.doSnodeBatchRequest)(retrieveRequestsParams, targetNode, 4000, associatedWith);
    if (!results || !results.length) {
        sessionjs_logger_1.console.warn(`_retrieveNextMessages - sessionRpc could not talk to ${targetNode.ip}:${targetNode.port}`);
        throw new Error(`_retrieveNextMessages - sessionRpc could not talk to ${targetNode.ip}:${targetNode.port}`);
    }
    if (results.length !== namespaces.length && results.length !== namespaces.length + 1) {
        throw new Error(`We asked for updates about ${namespaces.length} messages but got results of length ${results.length}`);
    }
    const firstResult = results[0];
    if (firstResult.code !== 200) {
        sessionjs_logger_1.console.warn(`retrieveNextMessages result is not 200 but ${firstResult.code}`);
        throw new Error(`_retrieveNextMessages - retrieve result is not 200 with ${targetNode.ip}:${targetNode.port} but ${firstResult.code}`);
    }
    try {
        const bodyFirstResult = firstResult.body;
        getNetworkTime_1.GetNetworkTime.handleTimestampOffsetFromNetwork('retrieve', bodyFirstResult.t);
        return results.map((result, index) => ({
            code: result.code,
            messages: result.body,
            namespace: namespaces[index],
        }));
    }
    catch (e) {
        sessionjs_logger_1.console.warn('exception while parsing json of nextMessage:', e);
        throw new Error(`_retrieveNextMessages - exception while parsing json of nextMessage ${targetNode.ip}:${targetNode.port}: ${e?.message}`);
    }
}
exports.SnodeAPIRetrieve = { retrieveNextMessages };
