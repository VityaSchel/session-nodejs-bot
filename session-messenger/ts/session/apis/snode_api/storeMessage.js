"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnodeAPIStore = void 0;
const lodash_1 = require("lodash");
const batchRequest_1 = require("./batchRequest");
const getNetworkTime_1 = require("./getNetworkTime");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
function justStores(params) {
    return params.map(p => {
        return {
            method: 'store',
            params: p,
        };
    });
}
function buildStoreRequests(params, toDeleteOnSequence) {
    if (!toDeleteOnSequence || (0, lodash_1.isEmpty)(toDeleteOnSequence)) {
        return justStores(params);
    }
    return [...justStores(params), ...buildDeleteByHashesSubRequest(toDeleteOnSequence)];
}
function buildDeleteByHashesSubRequest(params) {
    return [
        {
            method: 'delete',
            params,
        },
    ];
}
async function storeOnNode(targetNode, params, toDeleteOnSequence) {
    try {
        const subRequests = buildStoreRequests(params, toDeleteOnSequence);
        const result = await (0, batchRequest_1.doSnodeBatchRequest)(subRequests, targetNode, 4000, params[0].pubkey, toDeleteOnSequence ? 'sequence' : 'batch');
        if (!result || !result.length) {
            sessionjs_logger_1.console.warn(`SessionSnodeAPI::requestSnodesForPubkeyWithTargetNodeRetryable - sessionRpc on ${targetNode.ip}:${targetNode.port} returned falsish value`, result);
            throw new Error('requestSnodesForPubkeyWithTargetNodeRetryable: Invalid result');
        }
        const firstResult = result[0];
        if (firstResult.code !== 200) {
            sessionjs_logger_1.console.warn('first result status is not 200 for storeOnNode but: ', firstResult.code);
            throw new Error('storeOnNode: Invalid status code');
        }
        getNetworkTime_1.GetNetworkTime.handleTimestampOffsetFromNetwork('store', firstResult.body.t);
        return result;
    }
    catch (e) {
        sessionjs_logger_1.console.warn('store - send error:', e, `destination ${targetNode.ip}:${targetNode.port}`);
        throw e;
    }
}
exports.SnodeAPIStore = { storeOnNode };
