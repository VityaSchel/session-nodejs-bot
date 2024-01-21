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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGuardNodeOrSelectNewOnes = exports.selectGuardNodes = exports.testGuardNode = exports.incrementBadPathCountOrDrop = exports.getOnionPath = exports.dropSnodeFromPath = exports.buildNewOnionPathsOneAtATime = exports.ed25519Str = exports.guardNodes = exports.resetPathFailureCount = exports.pathFailureCount = exports.clearTestOnionPath = exports.TEST_getTestguardNodes = exports.TEST_getTestOnionPath = exports.onionPaths = void 0;
const lodash_1 = __importStar(require("lodash"));
const p_retry_1 = __importDefault(require("p-retry"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const data_1 = require("../../data/data");
const SnodePool = __importStar(require("../apis/snode_api/snodePool"));
const utils_1 = require("../utils");
const onions_1 = require("../apis/snode_api/onions");
const Promise_1 = require("../utils/Promise");
const SNodeAPI_1 = require("../apis/snode_api/SNodeAPI");
const _1 = require(".");
const MIME_1 = require("../../types/MIME");
const sessionjs_logger_1 = require("../../sessionjs-logger");
const desiredGuardCount = 3;
const minimumGuardCount = 2;
const ONION_REQUEST_HOPS = 3;
exports.onionPaths = [];
const TEST_getTestOnionPath = () => {
    return lodash_1.default.cloneDeep(exports.onionPaths);
};
exports.TEST_getTestOnionPath = TEST_getTestOnionPath;
const TEST_getTestguardNodes = () => {
    return lodash_1.default.cloneDeep(exports.guardNodes);
};
exports.TEST_getTestguardNodes = TEST_getTestguardNodes;
const clearTestOnionPath = () => {
    exports.onionPaths = [];
    exports.guardNodes = [];
};
exports.clearTestOnionPath = clearTestOnionPath;
exports.pathFailureCount = {};
const resetPathFailureCount = () => {
    exports.pathFailureCount = {};
};
exports.resetPathFailureCount = resetPathFailureCount;
const pathFailureThreshold = 3;
exports.guardNodes = [];
const ed25519Str = (ed25519Key) => `(...${ed25519Key.substr(58)})`;
exports.ed25519Str = ed25519Str;
async function buildNewOnionPathsOneAtATime() {
    return (0, Promise_1.allowOnlyOneAtATime)('buildNewOnionPaths', async () => {
        try {
            await buildNewOnionPathsWorker();
        }
        catch (e) {
            sessionjs_logger_1.console.warn(`buildNewOnionPathsWorker failed with ${e.message}`);
        }
    });
}
exports.buildNewOnionPathsOneAtATime = buildNewOnionPathsOneAtATime;
async function dropSnodeFromPath(snodeEd25519) {
    const pathWithSnodeIndex = exports.onionPaths.findIndex(path => path.some(snode => snode.pubkey_ed25519 === snodeEd25519));
    if (pathWithSnodeIndex === -1) {
        sessionjs_logger_1.console.warn(`Could not drop ${(0, exports.ed25519Str)(snodeEd25519)} as it is not in any paths`);
        return;
    }
    sessionjs_logger_1.console.info(`dropping snode ${(0, exports.ed25519Str)(snodeEd25519)} from path index: ${pathWithSnodeIndex}`);
    const oldPaths = lodash_1.default.cloneDeep(exports.onionPaths);
    let pathtoPatchUp = oldPaths[pathWithSnodeIndex];
    const nodeToRemoveIndex = pathtoPatchUp.findIndex(snode => snode.pubkey_ed25519 === snodeEd25519);
    if (nodeToRemoveIndex === -1) {
        return;
    }
    pathtoPatchUp = pathtoPatchUp.filter(snode => snode.pubkey_ed25519 !== snodeEd25519);
    const ed25519KeysToExclude = lodash_1.default.flattenDeep(oldPaths).map(m => m.pubkey_ed25519);
    const snodeToAppendToPath = await SnodePool.getRandomSnode(ed25519KeysToExclude);
    pathtoPatchUp.push(snodeToAppendToPath);
    exports.onionPaths[pathWithSnodeIndex] = pathtoPatchUp;
}
exports.dropSnodeFromPath = dropSnodeFromPath;
async function getOnionPath({ toExclude }) {
    let attemptNumber = 0;
    while (exports.onionPaths.length < minimumGuardCount) {
        sessionjs_logger_1.console.info(`getOnionPath: Must have at least ${minimumGuardCount} good onion paths, actual: ${exports.onionPaths.length}, attempt #${attemptNumber}`);
        try {
            await buildNewOnionPathsOneAtATime();
        }
        catch (e) {
            sessionjs_logger_1.console.warn(`buildNewOnionPathsOneAtATime failed with ${e.message}`);
        }
        attemptNumber += 1;
        if (attemptNumber >= 10) {
            sessionjs_logger_1.console.error('Failed to get an onion path after 10 attempts');
            throw new Error(`Failed to build enough onion paths, current count: ${exports.onionPaths.length}`);
        }
    }
    exports.onionPaths = exports.onionPaths.map(lodash_1.compact);
    if (exports.onionPaths.length === 0) {
    }
    else {
        const ipsOnly = exports.onionPaths.map(m => m.map(c => {
            return { ip: c.ip };
        }));
    }
    if (!toExclude) {
        if (!exports.onionPaths || exports.onionPaths.length === 0) {
            throw new Error('No onion paths available');
        }
        const randomPathNoExclude = lodash_1.default.sample(exports.onionPaths);
        if (!randomPathNoExclude) {
            throw new Error('No onion paths available');
        }
        return randomPathNoExclude;
    }
    const onionPathsWithoutExcluded = exports.onionPaths.filter(path => !lodash_1.default.some(path, node => node.pubkey_ed25519 === toExclude.pubkey_ed25519));
    if (!onionPathsWithoutExcluded || onionPathsWithoutExcluded.length === 0) {
        throw new Error('No onion paths available after filtering');
    }
    const randomPath = lodash_1.default.sample(onionPathsWithoutExcluded);
    if (!randomPath) {
        throw new Error('No onion paths available after filtering');
    }
    return randomPath;
}
exports.getOnionPath = getOnionPath;
async function incrementBadPathCountOrDrop(snodeEd25519) {
    const pathWithSnodeIndex = exports.onionPaths.findIndex(path => path.some(snode => snode.pubkey_ed25519 === snodeEd25519));
    if (pathWithSnodeIndex === -1) {
        sessionjs_logger_1.console.info('incrementBadPathCountOrDrop: Did not find any path containing this snode');
        await onions_1.Onions.incrementBadSnodeCountOrDrop({ snodeEd25519 });
        return undefined;
    }
    const guardNodeEd25519 = exports.onionPaths[pathWithSnodeIndex][0].pubkey_ed25519;
    sessionjs_logger_1.console.info(`incrementBadPathCountOrDrop starting with guard ${(0, exports.ed25519Str)(guardNodeEd25519)}`);
    const pathWithIssues = exports.onionPaths[pathWithSnodeIndex];
    sessionjs_logger_1.console.info('handling bad path for path index', pathWithSnodeIndex);
    const oldPathFailureCount = exports.pathFailureCount[guardNodeEd25519] || 0;
    const newPathFailureCount = oldPathFailureCount + 1;
    for (let index = 1; index < pathWithIssues.length; index++) {
        const snode = pathWithIssues[index];
        await onions_1.Onions.incrementBadSnodeCountOrDrop({ snodeEd25519: snode.pubkey_ed25519 });
    }
    if (newPathFailureCount >= pathFailureThreshold) {
        return dropPathStartingWithGuardNode(guardNodeEd25519);
    }
    exports.pathFailureCount[guardNodeEd25519] = newPathFailureCount;
    return undefined;
}
exports.incrementBadPathCountOrDrop = incrementBadPathCountOrDrop;
async function dropPathStartingWithGuardNode(guardNodeEd25519) {
    await SnodePool.dropSnodeFromSnodePool(guardNodeEd25519);
    const failingPathIndex = exports.onionPaths.findIndex(p => p[0].pubkey_ed25519 === guardNodeEd25519);
    if (failingPathIndex === -1) {
        sessionjs_logger_1.console.warn('No such path starts with this guard node ');
    }
    else {
        sessionjs_logger_1.console.info(`Dropping path starting with guard node ${(0, exports.ed25519Str)(guardNodeEd25519)}; index:${failingPathIndex}`);
        exports.onionPaths = exports.onionPaths.filter(p => p[0].pubkey_ed25519 !== guardNodeEd25519);
    }
    exports.guardNodes = exports.guardNodes.filter(g => g.pubkey_ed25519 !== guardNodeEd25519);
    await internalUpdateGuardNodes(exports.guardNodes);
    exports.pathFailureCount[guardNodeEd25519] = 0;
    await buildNewOnionPathsOneAtATime();
}
async function internalUpdateGuardNodes(updatedGuardNodes) {
    const edKeys = updatedGuardNodes.map(n => n.pubkey_ed25519);
    await data_1.Data.updateGuardNodes(edKeys);
}
async function testGuardNode(snode) {
    sessionjs_logger_1.console.info(`Testing a candidate guard node ${(0, exports.ed25519Str)(snode.pubkey_ed25519)}`);
    const endpoint = '/storage_rpc/v1';
    const url = `https://${snode.ip}:${snode.port}${endpoint}`;
    const ourPK = utils_1.UserUtils.getOurPubKeyStrFromCache();
    const method = 'get_swarm';
    const params = { pubkey: ourPK };
    const body = {
        jsonrpc: '2.0',
        method,
        params,
    };
    const fetchOptions = {
        method: 'POST',
        body: JSON.stringify(body),
        headers: {
            'Content-Type': MIME_1.APPLICATION_JSON,
            'User-Agent': 'WhatsApp',
            'Accept-Language': 'en-us',
        },
        timeout: 10000,
        agent: onions_1.snodeHttpsAgent,
    };
    let response;
    try {
        sessionjs_logger_1.console.info('insecureNodeFetch => plaintext for testGuardNode');
        response = await (0, node_fetch_1.default)(url, fetchOptions);
    }
    catch (e) {
        if (e.type === 'request-timeout') {
            sessionjs_logger_1.console.warn('test :,', (0, exports.ed25519Str)(snode.pubkey_ed25519));
        }
        if (e.code === 'ENETUNREACH') {
            sessionjs_logger_1.console.warn('no network on node,', snode);
            throw new p_retry_1.default.AbortError(SNodeAPI_1.ERROR_CODE_NO_CONNECT);
        }
        return false;
    }
    if (!response.ok) {
        await response.text();
        sessionjs_logger_1.console.info('Node failed the guard test:', snode);
    }
    return response.ok;
}
exports.testGuardNode = testGuardNode;
async function selectGuardNodes() {
    const nodePool = await SnodePool.getSnodePoolFromDBOrFetchFromSeed();
    sessionjs_logger_1.console.info(`selectGuardNodes snodePool length: ${nodePool.length}`);
    if (nodePool.length < SnodePool.minSnodePoolCount) {
        sessionjs_logger_1.console.error(`Could not select guard nodes. Not enough nodes in the pool: ${nodePool.length}`);
        throw new Error(`Could not select guard nodes. Not enough nodes in the pool: ${nodePool.length}`);
    }
    const shuffled = lodash_1.default.shuffle(nodePool);
    let selectedGuardNodes = [];
    let attempts = 0;
    while (selectedGuardNodes.length < desiredGuardCount) {
        const candidateNodes = shuffled.splice(0, desiredGuardCount);
        if (attempts > 5) {
            sessionjs_logger_1.console.info(`selectGuardNodes stopping after attempts: ${attempts}`);
            throw new Error(`selectGuardNodes stopping after attempts: ${attempts}`);
        }
        sessionjs_logger_1.console.info(`selectGuardNodes attempts: ${attempts}`);
        const idxOk = (await Promise.allSettled(candidateNodes.map(_1.OnionPaths.testGuardNode))).flatMap(p => (p.status === 'fulfilled' ? p.value : null));
        const goodNodes = lodash_1.default.zip(idxOk, candidateNodes)
            .filter(x => x[0])
            .map(x => x[1]);
        selectedGuardNodes = lodash_1.default.concat(selectedGuardNodes, goodNodes);
        attempts++;
    }
    exports.guardNodes = selectedGuardNodes.slice(0, desiredGuardCount);
    if (exports.guardNodes.length < desiredGuardCount) {
        sessionjs_logger_1.console.error(`Cound't get enough guard nodes, only have: ${exports.guardNodes.length}`);
        throw new Error(`Cound't get enough guard nodes, only have: ${exports.guardNodes.length}`);
    }
    await internalUpdateGuardNodes(exports.guardNodes);
    return exports.guardNodes;
}
exports.selectGuardNodes = selectGuardNodes;
async function getGuardNodeOrSelectNewOnes() {
    if (exports.guardNodes.length === 0) {
        const guardNodesFromDb = await data_1.Data.getGuardNodes();
        if (guardNodesFromDb.length === 0) {
            sessionjs_logger_1.console.warn('SessionSnodeAPI::getGuardNodeOrSelectNewOnes - no guard nodes in DB. Will be selecting new guards nodes...');
        }
        else {
            const allNodes = await SnodePool.getSnodePoolFromDBOrFetchFromSeed();
            const edKeys = guardNodesFromDb.map(x => x.ed25519PubKey);
            exports.guardNodes = allNodes.filter(x => edKeys.indexOf(x.pubkey_ed25519) !== -1);
            if (exports.guardNodes.length < edKeys.length) {
                sessionjs_logger_1.console.warn(`SessionSnodeAPI::getGuardNodeOrSelectNewOnes - could not find some guard nodes: ${exports.guardNodes.length}/${edKeys.length} left`);
            }
        }
    }
    if (exports.guardNodes.length < desiredGuardCount) {
        const start = Date.now();
        exports.guardNodes = await _1.OnionPaths.selectGuardNodes();
        sessionjs_logger_1.console.info(`OnionPaths.selectGuardNodes took ${Date.now() - start}ms`);
    }
}
exports.getGuardNodeOrSelectNewOnes = getGuardNodeOrSelectNewOnes;
async function buildNewOnionPathsWorker() {
    return (0, p_retry_1.default)(async () => {
        sessionjs_logger_1.console.info('SessionSnodeAPI::buildNewOnionPaths - building new onion paths...');
        let allNodes = await SnodePool.getSnodePoolFromDBOrFetchFromSeed();
        if (allNodes.length <= SnodePool.minSnodePoolCount) {
            throw new Error(`Cannot rebuild path as we do not have enough snodes: ${allNodes.length}`);
        }
        await _1.OnionPaths.getGuardNodeOrSelectNewOnes();
        allNodes = await SnodePool.getSnodePoolFromDBOrFetchFromSeed();
        sessionjs_logger_1.console.info(`SessionSnodeAPI::buildNewOnionPaths, snodePool length: ${allNodes.length}`);
        if (allNodes.length <= SnodePool.minSnodePoolCount) {
            throw new Error('Too few nodes to build an onion path. Even after fetching from seed.');
        }
        const allNodesGroupedBySubnet24 = lodash_1.default.groupBy(allNodes, e => {
            const lastDot = e.ip.lastIndexOf('.');
            return e.ip.substr(0, lastDot);
        });
        const oneNodeForEachSubnet24KeepingRatio = lodash_1.default.flatten(lodash_1.default.map(allNodesGroupedBySubnet24, group => {
            return lodash_1.default.fill(Array(group.length), lodash_1.default.sample(group));
        }));
        if (oneNodeForEachSubnet24KeepingRatio.length <= SnodePool.minSnodePoolCount) {
            throw new Error('Too few nodes "unique by ip" to build an onion path. Even after fetching from seed.');
        }
        let otherNodes = lodash_1.default.differenceBy(oneNodeForEachSubnet24KeepingRatio, exports.guardNodes, 'pubkey_ed25519');
        const guards = lodash_1.default.shuffle(exports.guardNodes);
        const nodesNeededPerPaths = ONION_REQUEST_HOPS - 1;
        const maxPath = Math.floor(Math.min(guards.length, otherNodes.length / nodesNeededPerPaths));
        sessionjs_logger_1.console.info(`Building ${maxPath} onion paths based on guard nodes length: ${guards.length}, other nodes length ${otherNodes.length} `);
        exports.onionPaths = [];
        for (let i = 0; i < maxPath; i += 1) {
            const path = [guards[i]];
            for (let j = 0; j < nodesNeededPerPaths; j += 1) {
                const randomWinner = lodash_1.default.sample(otherNodes);
                if (!randomWinner) {
                    throw new Error('randomWinner unset during path building task');
                }
                otherNodes = otherNodes.filter(n => {
                    return n.pubkey_ed25519 !== randomWinner?.pubkey_ed25519;
                });
                path.push(randomWinner);
            }
            exports.onionPaths.push(path);
        }
        sessionjs_logger_1.console.info(`Built ${exports.onionPaths.length} onion paths`);
    }, {
        retries: 3,
        factor: 1,
        minTimeout: 1000,
        onFailedAttempt: e => {
            sessionjs_logger_1.console.warn(`buildNewOnionPathsWorker attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left... Error: ${e.message}`);
        },
    });
}
