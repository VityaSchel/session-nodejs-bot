"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigDumpData = void 0;
const channels_1 = require("../channels");
const dataUtils_1 = require("../dataUtils");
exports.ConfigDumpData = {
    getByVariantAndPubkey: (variant, pubkey) => {
        return channels_1.channels.getByVariantAndPubkey(variant, pubkey);
    },
    saveConfigDump: (dump) => {
        return channels_1.channels.saveConfigDump((0, dataUtils_1.cleanData)(dump));
    },
    getAllDumpsWithData: () => {
        return channels_1.channels.getAllDumpsWithData();
    },
    getAllDumpsWithoutData: () => {
        return channels_1.channels.getAllDumpsWithoutData();
    },
};
