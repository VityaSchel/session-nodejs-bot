"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnodeAPI = exports.ERROR_CODE_NO_CONNECT = void 0;
const lodash_1 = require("lodash");
const p_retry_1 = __importDefault(require("p-retry"));
const crypto_1 = require("../../crypto");
const onionPath_1 = require("../../onions/onionPath");
const utils_1 = require("../../utils");
const String_1 = require("../../utils/String");
const batchRequest_1 = require("./batchRequest");
const snodePool_1 = require("./snodePool");
const snodeSignatures_1 = require("./snodeSignatures");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
exports.ERROR_CODE_NO_CONNECT = 'ENETUNREACH: No network connection.';
const forceNetworkDeletion = async () => {
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    const userX25519PublicKey = utils_1.UserUtils.getOurPubKeyStrFromCache();
    const userED25519KeyPair = await utils_1.UserUtils.getUserED25519KeyPair();
    if (!userED25519KeyPair) {
        sessionjs_logger_1.console.warn('Cannot forceNetworkDeletion, did not find user ed25519 key.');
        return null;
    }
    const method = 'delete_all';
    const namespace = 'all';
    try {
        const maliciousSnodes = await (0, p_retry_1.default)(async () => {
            const userSwarm = await (0, snodePool_1.getSwarmFor)(userX25519PublicKey);
            const snodeToMakeRequestTo = (0, lodash_1.sample)(userSwarm);
            if (!snodeToMakeRequestTo) {
                sessionjs_logger_1.console.warn('Cannot forceNetworkDeletion, without a valid swarm node.');
                return null;
            }
            return (0, p_retry_1.default)(async () => {
                const signOpts = await snodeSignatures_1.SnodeSignature.getSnodeSignatureParams({
                    method,
                    namespace,
                    pubkey: userX25519PublicKey,
                });
                const ret = await (0, batchRequest_1.doSnodeBatchRequest)([{ method, params: { ...signOpts, namespace } }], snodeToMakeRequestTo, 10000, userX25519PublicKey);
                if (!ret || !ret?.[0].body || ret[0].code !== 200) {
                    throw new Error(`Empty response got for ${method} on snode ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)}`);
                }
                try {
                    const firstResultParsedBody = ret[0].body;
                    const { swarm } = firstResultParsedBody;
                    if (!swarm) {
                        throw new Error(`Invalid JSON swarm response got for ${method} on snode ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)}, ${firstResultParsedBody}`);
                    }
                    const swarmAsArray = Object.entries(swarm);
                    if (!swarmAsArray.length) {
                        throw new Error(`Invalid JSON swarmAsArray response got for ${method} on snode ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)}, ${firstResultParsedBody}`);
                    }
                    const results = (0, lodash_1.compact)(swarmAsArray.map(snode => {
                        const snodePubkey = snode[0];
                        const snodeJson = snode[1];
                        const isFailed = snodeJson.failed || false;
                        if (isFailed) {
                            const reason = snodeJson.reason;
                            const statusCode = snodeJson.code;
                            if (reason && statusCode) {
                                sessionjs_logger_1.console.warn(`Could not ${method} from ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)} due to error: ${reason}: ${statusCode}`);
                                if (statusCode === 421) {
                                    throw new p_retry_1.default.AbortError(`421 error on network ${method}. Retrying with a new snode`);
                                }
                            }
                            else {
                                sessionjs_logger_1.console.warn(`Could not ${method} from ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)}`);
                            }
                            return snodePubkey;
                        }
                        const deletedObj = snodeJson.deleted;
                        const hashes = [];
                        for (const key in deletedObj) {
                            if (deletedObj.hasOwnProperty(key)) {
                                hashes.push(...deletedObj[key]);
                            }
                        }
                        const sortedHashes = hashes.sort();
                        const signatureSnode = snodeJson.signature;
                        const dataToVerify = `${userX25519PublicKey}${signOpts.timestamp}${sortedHashes.join('')}`;
                        const dataToVerifyUtf8 = utils_1.StringUtils.encode(dataToVerify, 'utf8');
                        const isValid = sodium.crypto_sign_verify_detached((0, String_1.fromBase64ToArray)(signatureSnode), new Uint8Array(dataToVerifyUtf8), (0, String_1.fromHexToArray)(snodePubkey));
                        if (!isValid) {
                            return snodePubkey;
                        }
                        return null;
                    }));
                    return results;
                }
                catch (e) {
                    throw new Error(`Invalid JSON response got for ${method} on snode ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)}, ${ret}`);
                }
            }, {
                retries: 3,
                minTimeout: exports.SnodeAPI.TEST_getMinTimeout(),
                onFailedAttempt: e => {
                    sessionjs_logger_1.console.warn(`${method} INNER request attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left...`);
                },
            });
        }, {
            retries: 3,
            minTimeout: exports.SnodeAPI.TEST_getMinTimeout(),
            onFailedAttempt: e => {
                sessionjs_logger_1.console.warn(`${method} OUTER request attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left... ${e.message}`);
            },
        });
        return maliciousSnodes;
    }
    catch (e) {
        sessionjs_logger_1.console.warn(`failed to ${method} everything on network:`, e);
        return null;
    }
};
const TEST_getMinTimeout = () => 500;
const networkDeleteMessages = async (hashes) => {
    const sodium = await (0, crypto_1.getSodiumRenderer)();
    const userX25519PublicKey = utils_1.UserUtils.getOurPubKeyStrFromCache();
    const userED25519KeyPair = await utils_1.UserUtils.getUserED25519KeyPair();
    if (!userED25519KeyPair) {
        sessionjs_logger_1.console.warn('Cannot networkDeleteMessages, did not find user ed25519 key.');
        return null;
    }
    const method = 'delete';
    try {
        const maliciousSnodes = await (0, p_retry_1.default)(async () => {
            const userSwarm = await (0, snodePool_1.getSwarmFor)(userX25519PublicKey);
            const snodeToMakeRequestTo = (0, lodash_1.sample)(userSwarm);
            if (!snodeToMakeRequestTo) {
                sessionjs_logger_1.console.warn('Cannot networkDeleteMessages, without a valid swarm node.');
                return null;
            }
            return (0, p_retry_1.default)(async () => {
                const signOpts = await snodeSignatures_1.SnodeSignature.getSnodeSignatureByHashesParams({
                    messages: hashes,
                    method,
                    pubkey: userX25519PublicKey,
                });
                const ret = await (0, batchRequest_1.doSnodeBatchRequest)([{ method, params: signOpts }], snodeToMakeRequestTo, 10000, userX25519PublicKey);
                if (!ret || !ret?.[0].body || ret[0].code !== 200) {
                    throw new Error(`Empty response got for ${method} on snode ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)}`);
                }
                try {
                    const firstResultParsedBody = ret[0].body;
                    const { swarm } = firstResultParsedBody;
                    if (!swarm) {
                        throw new Error(`Invalid JSON swarm response got for ${method} on snode ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)}, ${firstResultParsedBody}`);
                    }
                    const swarmAsArray = Object.entries(swarm);
                    if (!swarmAsArray.length) {
                        throw new Error(`Invalid JSON swarmAsArray response got for ${method} on snode ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)}, ${firstResultParsedBody}`);
                    }
                    const results = (0, lodash_1.compact)(swarmAsArray.map(snode => {
                        const snodePubkey = snode[0];
                        const snodeJson = snode[1];
                        const isFailed = snodeJson.failed || false;
                        if (isFailed) {
                            const reason = snodeJson.reason;
                            const statusCode = snodeJson.code;
                            if (reason && statusCode) {
                                sessionjs_logger_1.console.warn(`Could not ${method} from ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)} due to error: ${reason}: ${statusCode}`);
                                if (statusCode === 421) {
                                    throw new p_retry_1.default.AbortError(`421 error on network ${method}. Retrying with a new snode`);
                                }
                            }
                            else {
                                sessionjs_logger_1.console.warn(`Could not ${method} from ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)}`);
                            }
                            return snodePubkey;
                        }
                        const responseHashes = snodeJson.deleted;
                        const signatureSnode = snodeJson.signature;
                        const dataToVerify = `${userX25519PublicKey}${hashes.join('')}${responseHashes.join('')}`;
                        const dataToVerifyUtf8 = utils_1.StringUtils.encode(dataToVerify, 'utf8');
                        const isValid = sodium.crypto_sign_verify_detached((0, String_1.fromBase64ToArray)(signatureSnode), new Uint8Array(dataToVerifyUtf8), (0, String_1.fromHexToArray)(snodePubkey));
                        if (!isValid) {
                            return snodePubkey;
                        }
                        return null;
                    }));
                    return results;
                }
                catch (e) {
                    throw new Error(`Invalid JSON response got for ${method} on snode ${(0, onionPath_1.ed25519Str)(snodeToMakeRequestTo.pubkey_ed25519)}, ${ret}`);
                }
            }, {
                retries: 3,
                minTimeout: exports.SnodeAPI.TEST_getMinTimeout(),
                onFailedAttempt: e => {
                    sessionjs_logger_1.console.warn(`${method} INNER request attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left...`);
                },
            });
        }, {
            retries: 3,
            minTimeout: exports.SnodeAPI.TEST_getMinTimeout(),
            onFailedAttempt: e => {
                sessionjs_logger_1.console.warn(`${method} OUTER request attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left... ${e.message}`);
            },
        });
        return maliciousSnodes;
    }
    catch (e) {
        sessionjs_logger_1.console.warn(`failed to ${method} message on network:`, e);
        return null;
    }
};
exports.SnodeAPI = {
    TEST_getMinTimeout,
    networkDeleteMessages,
    forceNetworkDeletion,
};
