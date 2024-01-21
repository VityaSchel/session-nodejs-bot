"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleCapabilities = exports.getCapabilitiesFromBatch = void 0;
const lodash_1 = require("lodash");
const opengroups_1 = require("../../../../data/opengroups");
const sogsV3Capabilities_1 = require("./sogsV3Capabilities");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const getCapabilitiesFromBatch = (subrequestOptionsLookup, bodies) => {
    const capabilitiesBatchIndex = (0, lodash_1.findIndex)(subrequestOptionsLookup, (subrequest) => {
        return subrequest.type === 'capabilities';
    });
    const capabilities = (0, sogsV3Capabilities_1.parseCapabilities)(bodies?.[capabilitiesBatchIndex]?.body) || null;
    return capabilities;
};
exports.getCapabilitiesFromBatch = getCapabilitiesFromBatch;
const handleCapabilities = async (subrequestOptionsLookup, batchPollResults, serverUrl) => {
    if (!batchPollResults.body) {
        return null;
    }
    const capabilities = (0, exports.getCapabilitiesFromBatch)(subrequestOptionsLookup, batchPollResults.body);
    if (!capabilities) {
        sessionjs_logger_1.console.error('Failed capabilities subrequest - cancelling capabilities response handling');
        return null;
    }
    const rooms = opengroups_1.OpenGroupData.getV2OpenGroupRoomsByServerUrl(serverUrl);
    if (!rooms || !rooms.length) {
        sessionjs_logger_1.console.error('handleCapabilities - Found no groups with matching server url');
        return null;
    }
    const updatedRooms = rooms.map(r => ({ ...r, capabilities }));
    await opengroups_1.OpenGroupData.saveV2OpenGroupRooms(updatedRooms);
    return capabilities;
};
exports.handleCapabilities = handleCapabilities;
