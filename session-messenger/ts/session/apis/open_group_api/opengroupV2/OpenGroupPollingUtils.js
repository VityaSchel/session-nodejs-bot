"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenGroupPollingUtils = void 0;
const lodash_1 = require("lodash");
const opengroups_1 = require("../../../../data/opengroups");
const utils_1 = require("../../../utils");
const String_1 = require("../../../utils/String");
const crypto_1 = require("../../../crypto");
const sogsBlinding_1 = require("../sogsv3/sogsBlinding");
const getNetworkTime_1 = require("../../snode_api/getNetworkTime");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
const getOurOpenGroupHeaders = async (serverPublicKey, endpoint, method, blinded, body) => {
    const signingKeys = await utils_1.UserUtils.getUserED25519KeyPairBytes();
    if (!signingKeys) {
        sessionjs_logger_1.console.error('getOurOpenGroupHeaders - Unable to get our signing keys');
        return undefined;
    }
    const nonce = (await (0, crypto_1.getSodiumRenderer)()).randombytes_buf(16);
    const timestamp = Math.floor(getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset() / 1000);
    return sogsBlinding_1.SogsBlinding.getOpenGroupHeaders({
        signingKeys,
        serverPK: (0, String_1.fromHexToArray)(serverPublicKey),
        nonce,
        method,
        path: endpoint,
        timestamp,
        blinded,
        body,
    });
};
const getAllValidRoomInfos = (serverUrl, rooms) => {
    const allServerPubKeys = [];
    const validRoomInfos = (0, lodash_1.compact)([...rooms].map(roomId => {
        try {
            const fetchedInfo = opengroups_1.OpenGroupData.getV2OpenGroupRoomByRoomId({
                serverUrl,
                roomId,
            });
            if (!fetchedInfo) {
                sessionjs_logger_1.console.warn('Could not find this room getMessages');
                return null;
            }
            allServerPubKeys.push(fetchedInfo.serverPublicKey);
            return fetchedInfo;
        }
        catch (e) {
            sessionjs_logger_1.console.warn('failed to fetch roominfos for room', roomId);
            return null;
        }
    }));
    if (!validRoomInfos?.length) {
        return null;
    }
    let firstPubkey;
    if (allServerPubKeys?.length) {
        firstPubkey = allServerPubKeys[0];
        const allMatch = allServerPubKeys.every(p => p === firstPubkey);
        if (!allMatch) {
            sessionjs_logger_1.console.warn('All pubkeys do not match:', allServerPubKeys);
            return null;
        }
    }
    else {
        sessionjs_logger_1.console.warn('No pubkeys found:', allServerPubKeys);
        return null;
    }
    return validRoomInfos;
};
exports.OpenGroupPollingUtils = { getAllValidRoomInfos, getOurOpenGroupHeaders };
