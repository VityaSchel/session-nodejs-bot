"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.configDumpData = exports.uniqCompacted = void 0;
const lodash_1 = require("lodash");
const sqlSharedTypes_1 = require("../../types/sqlSharedTypes");
const sqlInstance_1 = require("../sqlInstance");
function parseRow(row) {
    const parsedNoData = parseRowNoData(row);
    if (!parsedNoData) {
        return null;
    }
    return { ...parsedNoData, data: row.data };
}
function parseRowNoData(row) {
    const toRet = {
        publicKey: row.publicKey,
        variant: row.variant,
    };
    return toRet;
}
function uniqCompacted(list) {
    if (!list || !list.length) {
        return [];
    }
    return (0, lodash_1.uniq)((0, lodash_1.compact)(list));
}
exports.uniqCompacted = uniqCompacted;
exports.configDumpData = {
    getByVariantAndPubkey: (variant, publicKey) => {
        const rows = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`SELECT publicKey, variant, data FROM ${sqlSharedTypes_1.CONFIG_DUMP_TABLE} WHERE variant = $variant AND publicKey = $publicKey;`)
            .all({
            publicKey,
            variant,
        });
        if (!rows) {
            return [];
        }
        return (0, lodash_1.compact)(rows.map(parseRow));
    },
    getAllDumpsWithData: () => {
        const rows = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`SELECT variant, publicKey, data from ${sqlSharedTypes_1.CONFIG_DUMP_TABLE};`)
            .all();
        if (!rows) {
            return [];
        }
        return (0, lodash_1.compact)(rows.map(parseRow));
    },
    getAllDumpsWithoutData: () => {
        const rows = (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`SELECT variant, publicKey from ${sqlSharedTypes_1.CONFIG_DUMP_TABLE};`)
            .all();
        if (!rows) {
            return [];
        }
        return (0, lodash_1.compact)(rows.map(parseRowNoData));
    },
    saveConfigDump: ({ data, publicKey, variant }) => {
        (0, sqlInstance_1.assertGlobalInstance)()
            .prepare(`INSERT OR REPLACE INTO ${sqlSharedTypes_1.CONFIG_DUMP_TABLE} (
              publicKey,
              variant,
              data
          ) values (
            $publicKey,
            $variant,
            $data
          );`)
            .run({
            publicKey,
            variant,
            data,
        });
    },
};
