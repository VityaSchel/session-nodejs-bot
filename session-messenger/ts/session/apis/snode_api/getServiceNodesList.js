"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServiceNodesList = void 0;
const lodash_1 = __importStar(require("lodash"));
const _1 = require(".");
const batchRequest_1 = require("./batchRequest");
const getNetworkTime_1 = require("./getNetworkTime");
const snodePool_1 = require("./snodePool");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
function buildSnodeListRequests() {
    const request = {
        method: 'oxend_request',
        params: {
            endpoint: 'get_service_nodes',
            params: {
                active_only: true,
                fields: {
                    public_ip: true,
                    storage_port: true,
                    pubkey_x25519: true,
                    pubkey_ed25519: true,
                },
            },
        },
    };
    return [request];
}
async function getSnodePoolFromSnode(targetNode) {
    const requests = buildSnodeListRequests();
    const results = await (0, batchRequest_1.doSnodeBatchRequest)(requests, targetNode, 4000, null);
    const firstResult = results[0];
    if (!firstResult || firstResult.code !== 200) {
        throw new Error('Invalid result');
    }
    try {
        const json = firstResult.body;
        if (!json || !json.result || !json.result.service_node_states?.length) {
            sessionjs_logger_1.console.error('getSnodePoolFromSnode - invalid result from snode', firstResult);
            return [];
        }
        const snodes = json.result.service_node_states
            .filter((snode) => snode.public_ip !== '0.0.0.0')
            .map((snode) => ({
            ip: snode.public_ip,
            port: snode.storage_port,
            pubkey_x25519: snode.pubkey_x25519,
            pubkey_ed25519: snode.pubkey_ed25519,
        }));
        getNetworkTime_1.GetNetworkTime.handleTimestampOffsetFromNetwork('get_service_nodes', json.t);
        return lodash_1.default.compact(snodes);
    }
    catch (e) {
        sessionjs_logger_1.console.error('Invalid json response');
        return [];
    }
}
async function getSnodePoolFromSnodes() {
    const existingSnodePool = await _1.SnodePool.getSnodePoolFromDBOrFetchFromSeed();
    if (existingSnodePool.length <= snodePool_1.minSnodePoolCount) {
        sessionjs_logger_1.console.warn('getSnodePoolFromSnodes: Cannot get snodes list from snodes; not enough snodes', existingSnodePool.length);
        throw new Error(`Cannot get snodes list from snodes; not enough snodes even after refetching from seed', ${existingSnodePool.length}`);
    }
    const nodesToRequest = (0, lodash_1.sampleSize)(existingSnodePool, 3);
    const results = await Promise.all(nodesToRequest.map(async (node) => {
        return exports.ServiceNodesList.getSnodePoolFromSnode(node);
    }));
    const commonSnodes = (0, lodash_1.intersectionWith)(results[0], results[1], results[2], (s1, s2) => {
        return s1.ip === s2.ip && s1.port === s2.port;
    });
    if (commonSnodes.length < snodePool_1.requiredSnodesForAgreement) {
        throw new Error(`Inconsistent snode pools. We did not get at least ${snodePool_1.requiredSnodesForAgreement} in common`);
    }
    return commonSnodes;
}
exports.ServiceNodesList = { getSnodePoolFromSnode, getSnodePoolFromSnodes };
