"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchCapabilitiesAndUpdateRelatedRoomsOfServerUrl = exports.parseCapabilities = void 0;
const abort_controller_1 = __importDefault(require("abort-controller"));
const lodash_1 = require("lodash");
const opengroups_1 = require("../../../../data/opengroups");
const onionSend_1 = require("../../../onions/onionSend");
const OpenGroupPollingUtils_1 = require("../opengroupV2/OpenGroupPollingUtils");
const sogsV3BatchPoll_1 = require("./sogsV3BatchPoll");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const capabilitiesFetchForServer = async (serverUrl, serverPubKey, abortSignal) => {
    const endpoint = '/capabilities';
    const method = 'GET';
    const serverPubkey = serverPubKey;
    const blinded = true;
    const capabilityHeaders = await OpenGroupPollingUtils_1.OpenGroupPollingUtils.getOurOpenGroupHeaders(serverPubkey, endpoint, method, blinded, null);
    if (!capabilityHeaders) {
        return null;
    }
    const result = await onionSend_1.OnionSending.sendJsonViaOnionV4ToSogs({
        abortSignal,
        blinded,
        endpoint,
        method,
        serverPubkey,
        serverUrl,
        stringifiedBody: null,
        headers: null,
        throwErrors: false,
    });
    if (!(0, sogsV3BatchPoll_1.batchGlobalIsSuccess)(result)) {
        sessionjs_logger_1.console.warn('Capabilities Request Got unknown status code; res:', result);
        return null;
    }
    const parsedCapabilities = result?.body ? parseCapabilities(result.body) : [];
    return parsedCapabilities;
};
function parseCapabilities(body) {
    if (!body || (0, lodash_1.isEmpty)(body) || !(0, lodash_1.isObject)(body) || !(0, lodash_1.isArray)(body.capabilities)) {
        return null;
    }
    return (body.capabilities || []).sort();
}
exports.parseCapabilities = parseCapabilities;
async function fetchCapabilitiesAndUpdateRelatedRoomsOfServerUrl(serverUrl) {
    let relatedRooms = opengroups_1.OpenGroupData.getV2OpenGroupRoomsByServerUrl(serverUrl);
    if (!relatedRooms || relatedRooms.length === 0) {
        return undefined;
    }
    const capabilities = await capabilitiesFetchForServer(serverUrl, relatedRooms[0].serverPublicKey, new abort_controller_1.default().signal);
    if (!capabilities) {
        return undefined;
    }
    relatedRooms = opengroups_1.OpenGroupData.getV2OpenGroupRoomsByServerUrl(serverUrl);
    if (!relatedRooms || relatedRooms.length === 0) {
        return undefined;
    }
    const newSortedCaps = capabilities.sort();
    await Promise.all(relatedRooms.map(async (room) => {
        if (!(0, lodash_1.isEqual)(newSortedCaps, room.capabilities?.sort() || '')) {
            room.capabilities = newSortedCaps;
            await opengroups_1.OpenGroupData.saveV2OpenGroupRoom(room);
        }
    }));
    return newSortedCaps;
}
exports.fetchCapabilitiesAndUpdateRelatedRoomsOfServerUrl = fetchCapabilitiesAndUpdateRelatedRoomsOfServerUrl;
