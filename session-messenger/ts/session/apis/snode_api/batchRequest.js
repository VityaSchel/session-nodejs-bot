"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.doSnodeBatchRequest = void 0;
const lodash_1 = require("lodash");
const onions_1 = require("./onions");
const sessionRpc_1 = require("./sessionRpc");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
async function doSnodeBatchRequest(subRequests, targetNode, timeout, associatedWith, method = 'batch') {
    const result = await (0, sessionRpc_1.snodeRpc)({
        method,
        params: { requests: subRequests },
        targetNode,
        associatedWith,
        timeout,
    });
    if (!result) {
        sessionjs_logger_1.console.warn(`doSnodeBatchRequest - sessionRpc could not talk to ${targetNode.ip}:${targetNode.port}`);
        throw new Error(`doSnodeBatchRequest - sessionRpc could not talk to ${targetNode.ip}:${targetNode.port}`);
    }
    const decoded = decodeBatchRequest(result);
    if (decoded?.length) {
        for (let index = 0; index < decoded.length; index++) {
            const resultRow = decoded[index];
            await (0, onions_1.processOnionRequestErrorAtDestination)({
                statusCode: resultRow.code,
                body: JSON.stringify(resultRow.body),
                associatedWith: associatedWith || undefined,
                destinationSnodeEd25519: targetNode.pubkey_ed25519,
            });
        }
    }
    return decoded;
}
exports.doSnodeBatchRequest = doSnodeBatchRequest;
function decodeBatchRequest(snodeResponse) {
    try {
        if (snodeResponse.status !== 200) {
            throw new Error(`decodeBatchRequest invalid status code: ${snodeResponse.status}`);
        }
        const parsed = JSON.parse(snodeResponse.body);
        if (!(0, lodash_1.isArray)(parsed.results)) {
            throw new Error('decodeBatchRequest results is not an array');
        }
        if (!parsed.results.length) {
            throw new Error('decodeBatchRequest results an empty array');
        }
        return parsed.results;
    }
    catch (e) {
        sessionjs_logger_1.console.error('decodeBatchRequest failed with ', e.message);
        throw e;
    }
}
