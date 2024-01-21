"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetNetworkTime = void 0;
const lodash_1 = require("lodash");
const batchRequest_1 = require("./batchRequest");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
function getNetworkTimeSubRequests() {
    const request = { method: 'info', params: {} };
    return [request];
}
const getNetworkTime = async (snode) => {
    const subRequests = getNetworkTimeSubRequests();
    const result = await (0, batchRequest_1.doSnodeBatchRequest)(subRequests, snode, 4000, null);
    if (!result || !result.length) {
        sessionjs_logger_1.console.warn(`getNetworkTime on ${snode.ip}:${snode.port} returned falsish value`, result);
        throw new Error('getNetworkTime: Invalid result');
    }
    const firstResult = result[0];
    if (firstResult.code !== 200) {
        sessionjs_logger_1.console.warn('Status is not 200 for getNetworkTime but: ', firstResult.code);
        throw new Error('getNetworkTime: Invalid status code');
    }
    const timestamp = firstResult?.body?.timestamp;
    if (!timestamp) {
        throw new Error(`getNetworkTime returned invalid timestamp: ${timestamp}`);
    }
    exports.GetNetworkTime.handleTimestampOffsetFromNetwork('getNetworkTime', timestamp);
    return timestamp;
};
let latestTimestampOffset = Number.MAX_SAFE_INTEGER;
function handleTimestampOffsetFromNetwork(_request, snodeTimestamp) {
    if (snodeTimestamp && (0, lodash_1.isNumber)(snodeTimestamp) && snodeTimestamp > 1609419600 * 1000) {
        const now = Date.now();
        if (latestTimestampOffset === Number.MAX_SAFE_INTEGER) {
            sessionjs_logger_1.console.info(`first timestamp offset received:  ${now - snodeTimestamp}ms`);
        }
        latestTimestampOffset = now - snodeTimestamp;
    }
}
function getLatestTimestampOffset() {
    if (latestTimestampOffset === Number.MAX_SAFE_INTEGER) {
        sessionjs_logger_1.console.debug('latestTimestampOffset is not set yet');
        return 0;
    }
    return latestTimestampOffset;
}
function getNowWithNetworkOffset() {
    return Date.now() - exports.GetNetworkTime.getLatestTimestampOffset();
}
exports.GetNetworkTime = {
    getNetworkTime,
    handleTimestampOffsetFromNetwork,
    getLatestTimestampOffset,
    getNowWithNetworkOffset,
};
