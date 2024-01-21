"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleHardforkResult = exports.getHasSeenHF191 = exports.getHasSeenHF190 = exports.resetHardForkCachedValues = void 0;
const lodash_1 = require("lodash");
const data_1 = require("../../../data/data");
const storage_1 = require("../../../util/storage");
let hasSeenHardfork190;
let hasSeenHardfork191;
const hasSeenHardfork190ItemId = 'hasSeenHardfork190';
const hasSeenHardfork191ItemId = 'hasSeenHardfork191';
function resetHardForkCachedValues() {
    hasSeenHardfork190 = undefined;
    hasSeenHardfork191 = undefined;
}
exports.resetHardForkCachedValues = resetHardForkCachedValues;
async function getHasSeenHF190() {
    if (hasSeenHardfork190 === undefined) {
        const oldHhasSeenHardfork190 = (await data_1.Data.getItemById(hasSeenHardfork190ItemId))?.value;
        if (oldHhasSeenHardfork190 === undefined) {
            await storage_1.Storage.put(hasSeenHardfork190ItemId, false);
            hasSeenHardfork190 = false;
        }
        else {
            hasSeenHardfork190 = oldHhasSeenHardfork190;
        }
    }
    return hasSeenHardfork190;
}
exports.getHasSeenHF190 = getHasSeenHF190;
async function getHasSeenHF191() {
    if (hasSeenHardfork191 === undefined) {
        const oldHhasSeenHardfork191 = (await data_1.Data.getItemById(hasSeenHardfork191ItemId))?.value;
        if (oldHhasSeenHardfork191 === undefined) {
            await storage_1.Storage.put(hasSeenHardfork191ItemId, false);
            hasSeenHardfork191 = false;
        }
        else {
            hasSeenHardfork191 = oldHhasSeenHardfork191;
        }
    }
    return hasSeenHardfork191;
}
exports.getHasSeenHF191 = getHasSeenHF191;
async function handleHardforkResult(json) {
    if (hasSeenHardfork190 === undefined || hasSeenHardfork191 === undefined) {
        const oldHhasSeenHardfork190 = (await data_1.Data.getItemById(hasSeenHardfork190ItemId))?.value;
        const oldHasSeenHardfork191 = (await data_1.Data.getItemById(hasSeenHardfork191ItemId))?.value;
        if (oldHhasSeenHardfork190 === undefined) {
            await storage_1.Storage.put(hasSeenHardfork190ItemId, false);
            hasSeenHardfork190 = false;
        }
        else {
            hasSeenHardfork190 = oldHhasSeenHardfork190;
        }
        if (oldHasSeenHardfork191 === undefined) {
            await storage_1.Storage.put(hasSeenHardfork191ItemId, false);
            hasSeenHardfork191 = false;
        }
        else {
            hasSeenHardfork191 = oldHasSeenHardfork191;
        }
    }
    if (hasSeenHardfork191 && hasSeenHardfork190) {
        return;
    }
    if (json?.hf &&
        Array.isArray(json.hf) &&
        json.hf.length === 2 &&
        (0, lodash_1.isNumber)(json.hf[0]) &&
        (0, lodash_1.isNumber)(json.hf[1])) {
        if (!hasSeenHardfork190 && json.hf[0] >= 19 && json.hf[1] >= 0) {
            await storage_1.Storage.put(hasSeenHardfork190ItemId, true);
            hasSeenHardfork190 = true;
        }
        if (!hasSeenHardfork191 && json.hf[0] >= 19 && json.hf[1] >= 1) {
            await storage_1.Storage.put(hasSeenHardfork191ItemId, true);
            hasSeenHardfork191 = true;
        }
    }
}
exports.handleHardforkResult = handleHardforkResult;
