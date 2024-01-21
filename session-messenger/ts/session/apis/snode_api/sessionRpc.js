"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.snodeRpc = void 0;
const node_fetch_1 = __importDefault(require("node-fetch"));
const lodash_1 = require("lodash");
const p_retry_1 = __importDefault(require("p-retry"));
const errors_1 = require("../../utils/errors");
const onions_1 = require("./onions");
const MIME_1 = require("../../../types/MIME");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
async function doRequest({ options, url, associatedWith, targetNode, timeout, }) {
    const method = options.method || 'GET';
    const fetchOptions = {
        ...options,
        timeout,
        method,
    };
    try {
        const useOnionRequests = true;
        if (useOnionRequests && targetNode) {
            const fetchResult = await onions_1.Onions.lokiOnionFetch({
                targetNode,
                body: fetchOptions.body,
                headers: fetchOptions.headers,
                associatedWith: associatedWith || undefined,
            });
            if (!fetchResult) {
                return undefined;
            }
            return fetchResult;
        }
        if (url.match(/https:\/\//)) {
            fetchOptions.agent = onions_1.snodeHttpsAgent;
        }
        fetchOptions.headers = {
            'User-Agent': 'WhatsApp',
            'Accept-Language': 'en-us',
            'Content-Type': MIME_1.APPLICATION_JSON,
        };
        sessionjs_logger_1.console.warn(`insecureNodeFetch => doRequest of ${url}`);
        const response = await (0, node_fetch_1.default)(url, {
            ...fetchOptions,
            body: fetchOptions.body || undefined,
            agent: fetchOptions.agent || undefined,
        });
        if (!response.ok) {
            throw new errors_1.HTTPError('Loki_rpc error', response);
        }
        const result = await response.text();
        return {
            body: result,
            status: response.status,
            bodyBinary: null,
        };
    }
    catch (e) {
        if (e.code === 'ENOTFOUND') {
            throw new errors_1.NotFoundError('Failed to resolve address', e);
        }
        if (e.message === onions_1.ERROR_421_HANDLED_RETRY_REQUEST) {
            throw new p_retry_1.default.AbortError(onions_1.ERROR_421_HANDLED_RETRY_REQUEST);
        }
        throw e;
    }
}
async function snodeRpc({ method, params, targetNode, associatedWith, timeout = 10000, }) {
    const url = `https://${targetNode.ip}:${targetNode.port}/storage_rpc/v1`;
    const body = {
        jsonrpc: '2.0',
        method,
        params: (0, lodash_1.clone)(params),
    };
    const fetchOptions = {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': MIME_1.APPLICATION_JSON },
        agent: null,
    };
    return doRequest({
        url,
        options: fetchOptions,
        targetNode,
        associatedWith,
        timeout,
    });
}
exports.snodeRpc = snodeRpc;
