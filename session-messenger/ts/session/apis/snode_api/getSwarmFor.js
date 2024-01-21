"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestSnodesForPubkeyFromNetwork = void 0;
const lodash_1 = require("lodash");
const p_retry_1 = __importDefault(require("p-retry"));
const batchRequest_1 = require("./batchRequest");
const getNetworkTime_1 = require("./getNetworkTime");
const snodePool_1 = require("./snodePool");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
function buildSwarmForSubRequests(pubkey) {
    return [{ method: 'get_swarm', params: { pubkey } }];
}
async function requestSnodesForPubkeyWithTargetNodeRetryable(pubkey, targetNode) {
    const subRequests = buildSwarmForSubRequests(pubkey);
    const result = await (0, batchRequest_1.doSnodeBatchRequest)(subRequests, targetNode, 4000, pubkey);
    if (!result || !result.length) {
        sessionjs_logger_1.console.warn(`SessionSnodeAPI::requestSnodesForPubkeyWithTargetNodeRetryable - sessionRpc on ${targetNode.ip}:${targetNode.port} returned falsish value`, result);
        throw new Error('requestSnodesForPubkeyWithTargetNodeRetryable: Invalid result');
    }
    const firstResult = result[0];
    if (firstResult.code !== 200) {
        sessionjs_logger_1.console.warn('Status is not 200 for get_swarm but: ', firstResult.code);
        throw new Error('requestSnodesForPubkeyWithTargetNodeRetryable: Invalid status code');
    }
    try {
        const body = firstResult.body;
        if (!body.snodes || !(0, lodash_1.isArray)(body.snodes) || !body.snodes.length) {
            sessionjs_logger_1.console.warn(`SessionSnodeAPI::requestSnodesForPubkeyRetryable - sessionRpc on ${targetNode.ip}:${targetNode.port} returned falsish value for snodes`, result);
            throw new Error('requestSnodesForPubkey: Invalid json (empty)');
        }
        const snodes = body.snodes.filter((tSnode) => tSnode.ip !== '0.0.0.0');
        getNetworkTime_1.GetNetworkTime.handleTimestampOffsetFromNetwork('get_swarm', body.t);
        return snodes;
    }
    catch (e) {
        throw new Error('Invalid json');
    }
}
async function requestSnodesForPubkeyWithTargetNode(pubKey, targetNode) {
    return (0, p_retry_1.default)(async () => {
        return requestSnodesForPubkeyWithTargetNodeRetryable(pubKey, targetNode);
    }, {
        retries: 3,
        factor: 2,
        minTimeout: 100,
        maxTimeout: 2000,
        onFailedAttempt: e => {
            sessionjs_logger_1.console.warn(`requestSnodesForPubkeyWithTargetNode attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left..., ${e.message}, ${e.stack}`);
        },
    });
}
async function requestSnodesForPubkeyRetryable(pubKey) {
    return (0, p_retry_1.default)(async () => {
        const targetNode = await (0, snodePool_1.getRandomSnode)();
        return requestSnodesForPubkeyWithTargetNode(pubKey, targetNode);
    }, {
        retries: 3,
        factor: 2,
        minTimeout: 100,
        maxTimeout: 4000,
        onFailedAttempt: e => {
            sessionjs_logger_1.console.warn(`requestSnodesForPubkeyRetryable attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left...`);
        },
    });
}
async function requestSnodesForPubkeyFromNetwork(pubKey) {
    try {
        return await requestSnodesForPubkeyRetryable(pubKey);
    }
    catch (e) {
        sessionjs_logger_1.console.error('SessionSnodeAPI::requestSnodesForPubkey - error', e);
        return [];
    }
}
exports.requestSnodesForPubkeyFromNetwork = requestSnodesForPubkeyFromNetwork;
