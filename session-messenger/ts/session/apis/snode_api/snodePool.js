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
exports.getFreshSwarmFor = exports.getSwarmFor = exports.getSwarmFromCacheOrDb = exports.updateSwarmFor = exports.dropSnodeFromSwarmIfNeeded = exports.TEST_fetchFromSeedWithRetriesAndWriteToDb = exports.getRandomSnodePool = exports.getSnodePoolFromDBOrFetchFromSeed = exports.forceRefreshRandomSnodePool = exports.getRandomSnode = exports.dropSnodeFromSnodePool = exports.TEST_resetState = exports.requiredSnodesForAgreement = exports.minSnodePoolCountBeforeRefreshFromSnodes = exports.minSnodePoolCount = void 0;
const lodash_1 = __importStar(require("lodash"));
const p_retry_1 = __importDefault(require("p-retry"));
const data_1 = require("../../../data/data");
const onionPath_1 = require("../../onions/onionPath");
const onions_1 = require("../../onions");
const _1 = require(".");
const seed_node_api_1 = require("../seed_node_api");
const getSwarmFor_1 = require("./getSwarmFor");
const getServiceNodesList_1 = require("./getServiceNodesList");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
const minSwarmSnodeCount = 3;
exports.minSnodePoolCount = 12;
exports.minSnodePoolCountBeforeRefreshFromSnodes = exports.minSnodePoolCount * 2;
exports.requiredSnodesForAgreement = 24;
let randomSnodePool = [];
function TEST_resetState() {
    randomSnodePool = [];
    swarmCache.clear();
}
exports.TEST_resetState = TEST_resetState;
const swarmCache = new Map();
async function dropSnodeFromSnodePool(snodeEd25519) {
    const exists = lodash_1.default.some(randomSnodePool, x => x.pubkey_ed25519 === snodeEd25519);
    if (exists) {
        lodash_1.default.remove(randomSnodePool, x => x.pubkey_ed25519 === snodeEd25519);
        sessionjs_logger_1.console.warn(`Droppping ${(0, onionPath_1.ed25519Str)(snodeEd25519)} from snode pool. ${randomSnodePool.length} snodes remaining in randomPool`);
        await data_1.Data.updateSnodePoolOnDb(JSON.stringify(randomSnodePool));
    }
}
exports.dropSnodeFromSnodePool = dropSnodeFromSnodePool;
async function getRandomSnode(excludingEd25519Snode) {
    const requiredCount = exports.minSnodePoolCount + (excludingEd25519Snode?.length || 0);
    if (randomSnodePool.length < requiredCount) {
        await getSnodePoolFromDBOrFetchFromSeed(excludingEd25519Snode?.length);
        if (randomSnodePool.length < requiredCount) {
            sessionjs_logger_1.console.warn(`getRandomSnode: failed to fetch snodes from seed. Current pool: ${randomSnodePool.length}`);
            throw new Error(`getRandomSnode: failed to fetch snodes from seed. Current pool: ${randomSnodePool.length}, required count: ${requiredCount}`);
        }
    }
    if (!excludingEd25519Snode) {
        return lodash_1.default.sample(randomSnodePool);
    }
    const snodePoolExcluding = randomSnodePool.filter(e => !excludingEd25519Snode.includes(e.pubkey_ed25519));
    if (!snodePoolExcluding || !snodePoolExcluding.length) {
        throw new Error(`Not enough snodes with excluding length ${excludingEd25519Snode.length}`);
    }
    return lodash_1.default.sample(snodePoolExcluding);
}
exports.getRandomSnode = getRandomSnode;
async function forceRefreshRandomSnodePool() {
    try {
        await getSnodePoolFromDBOrFetchFromSeed();
        sessionjs_logger_1.console.info(`forceRefreshRandomSnodePool: enough snodes to fetch from them, so we try using them ${randomSnodePool.length}`);
        await tryToGetConsensusWithSnodesWithRetries();
        if (randomSnodePool.length < exports.minSnodePoolCountBeforeRefreshFromSnodes) {
            throw new Error('forceRefreshRandomSnodePool still too small after refetching from snodes');
        }
    }
    catch (e) {
        sessionjs_logger_1.console.warn('forceRefreshRandomSnodePool: Failed to fetch snode pool from snodes. Fetching from seed node instead:', e.message);
        try {
            await _1.SnodePool.TEST_fetchFromSeedWithRetriesAndWriteToDb();
        }
        catch (err2) {
            sessionjs_logger_1.console.warn('forceRefreshRandomSnodePool: Failed to fetch snode pool from seed. Fetching from seed node instead:', err2.message);
        }
    }
    return randomSnodePool;
}
exports.forceRefreshRandomSnodePool = forceRefreshRandomSnodePool;
async function getSnodePoolFromDBOrFetchFromSeed(countToAddToRequirement = 0) {
    if (randomSnodePool && randomSnodePool.length > exports.minSnodePoolCount + countToAddToRequirement) {
        return randomSnodePool;
    }
    const fetchedFromDb = await data_1.Data.getSnodePoolFromDb();
    if (!fetchedFromDb || fetchedFromDb.length <= exports.minSnodePoolCount + countToAddToRequirement) {
        sessionjs_logger_1.console.warn(`getSnodePoolFromDBOrFetchFromSeed: not enough snodes in db (${fetchedFromDb?.length}), Fetching from seed node instead... `);
        await _1.SnodePool.TEST_fetchFromSeedWithRetriesAndWriteToDb();
        return randomSnodePool;
    }
    randomSnodePool = fetchedFromDb;
    return randomSnodePool;
}
exports.getSnodePoolFromDBOrFetchFromSeed = getSnodePoolFromDBOrFetchFromSeed;
async function getRandomSnodePool() {
    if (randomSnodePool.length <= exports.minSnodePoolCount) {
        await getSnodePoolFromDBOrFetchFromSeed();
    }
    return randomSnodePool;
}
exports.getRandomSnodePool = getRandomSnodePool;
async function TEST_fetchFromSeedWithRetriesAndWriteToDb() {
    const seedNodes = window.getSeedNodeList();
    if (!seedNodes || !seedNodes.length) {
        sessionjs_logger_1.console.error('SessionSnodeAPI:::fetchFromSeedWithRetriesAndWriteToDb - getSeedNodeList has not been loaded yet');
        return;
    }
    const start = Date.now();
    try {
        randomSnodePool = await seed_node_api_1.SeedNodeAPI.fetchSnodePoolFromSeedNodeWithRetries(seedNodes);
        await data_1.Data.updateSnodePoolOnDb(JSON.stringify(randomSnodePool));
        sessionjs_logger_1.console.info(`fetchSnodePoolFromSeedNodeWithRetries took ${Date.now() - start}ms`);
        onions_1.OnionPaths.resetPathFailureCount();
        _1.Onions.resetSnodeFailureCount();
    }
    catch (e) {
        sessionjs_logger_1.console.error('SessionSnodeAPI:::fetchFromSeedWithRetriesAndWriteToDb - Failed to fetch snode poll from seed node with retries. Error:', e);
    }
}
exports.TEST_fetchFromSeedWithRetriesAndWriteToDb = TEST_fetchFromSeedWithRetriesAndWriteToDb;
async function tryToGetConsensusWithSnodesWithRetries() {
    return (0, p_retry_1.default)(async () => {
        const commonNodes = await getServiceNodesList_1.ServiceNodesList.getSnodePoolFromSnodes();
        if (!commonNodes || commonNodes.length < exports.requiredSnodesForAgreement) {
            sessionjs_logger_1.console.info(`tryToGetConsensusWithSnodesWithRetries: Not enough common nodes ${commonNodes?.length}`);
            throw new Error('Not enough common nodes.');
        }
        sessionjs_logger_1.console.info('Got consensus: updating snode list with snode pool length:', commonNodes.length);
        randomSnodePool = commonNodes;
        await data_1.Data.updateSnodePoolOnDb(JSON.stringify(randomSnodePool));
        onions_1.OnionPaths.resetPathFailureCount();
        _1.Onions.resetSnodeFailureCount();
    }, {
        retries: 3,
        factor: 1,
        minTimeout: 1000,
        onFailedAttempt: e => {
            sessionjs_logger_1.console.warn(`tryToGetConsensusWithSnodesWithRetries attempt #${e.attemptNumber} failed. ${e.retriesLeft} retries left...`);
        },
    });
}
async function dropSnodeFromSwarmIfNeeded(pubkey, snodeToDropEd25519) {
    sessionjs_logger_1.console.warn(`Dropping ${(0, onionPath_1.ed25519Str)(snodeToDropEd25519)} from swarm of ${(0, onionPath_1.ed25519Str)(pubkey)}`);
    const existingSwarm = await getSwarmFromCacheOrDb(pubkey);
    if (!existingSwarm.includes(snodeToDropEd25519)) {
        return;
    }
    const updatedSwarm = existingSwarm.filter(ed25519 => ed25519 !== snodeToDropEd25519);
    await internalUpdateSwarmFor(pubkey, updatedSwarm);
}
exports.dropSnodeFromSwarmIfNeeded = dropSnodeFromSwarmIfNeeded;
async function updateSwarmFor(pubkey, snodes) {
    const edkeys = snodes.map((sn) => sn.pubkey_ed25519);
    await internalUpdateSwarmFor(pubkey, edkeys);
}
exports.updateSwarmFor = updateSwarmFor;
async function internalUpdateSwarmFor(pubkey, edkeys) {
    swarmCache.set(pubkey, edkeys);
    await data_1.Data.updateSwarmNodesForPubkey(pubkey, edkeys);
}
async function getSwarmFromCacheOrDb(pubkey) {
    const existingCache = swarmCache.get(pubkey);
    if (existingCache === undefined) {
        const nodes = await data_1.Data.getSwarmNodesForPubkey(pubkey);
        swarmCache.set(pubkey, nodes);
        return nodes;
    }
    return existingCache;
}
exports.getSwarmFromCacheOrDb = getSwarmFromCacheOrDb;
async function getSwarmFor(pubkey) {
    const nodes = await getSwarmFromCacheOrDb(pubkey);
    const goodNodes = randomSnodePool.filter((n) => nodes.indexOf(n.pubkey_ed25519) !== -1);
    if (goodNodes.length >= minSwarmSnodeCount) {
        return goodNodes;
    }
    return getSwarmFromNetworkAndSave(pubkey);
}
exports.getSwarmFor = getSwarmFor;
async function getFreshSwarmFor(pubkey) {
    return getSwarmFromNetworkAndSave(pubkey);
}
exports.getFreshSwarmFor = getFreshSwarmFor;
async function getSwarmFromNetworkAndSave(pubkey) {
    const swarm = await (0, getSwarmFor_1.requestSnodesForPubkeyFromNetwork)(pubkey);
    const shuffledSwarm = (0, lodash_1.shuffle)(swarm);
    const edkeys = shuffledSwarm.map((n) => n.pubkey_ed25519);
    await internalUpdateSwarmFor(pubkey, edkeys);
    return shuffledSwarm;
}
