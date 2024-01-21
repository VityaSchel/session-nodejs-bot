"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LibSessionUtil = void 0;
const lodash_1 = require("lodash");
const long_1 = __importDefault(require("long"));
const __1 = require("..");
const configDump_1 = require("../../../data/configDump/configDump");
const protobuf_1 = require("../../../protobuf");
const sqlSharedTypes_1 = require("../../../types/sqlSharedTypes");
const libsession_worker_interface_1 = require("../../../webworker/workers/browser/libsession_worker_interface");
const getNetworkTime_1 = require("../../apis/snode_api/getNetworkTime");
const SharedConfigMessage_1 = require("../../messages/outgoing/controlMessage/SharedConfigMessage");
const ConfigurationSyncJob_1 = require("../job_runners/jobs/ConfigurationSyncJob");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
const requiredUserVariants = [
    'UserConfig',
    'ContactsConfig',
    'UserGroupsConfig',
    'ConvoInfoVolatileConfig',
];
async function initializeLibSessionUtilWrappers() {
    const keypair = await __1.UserUtils.getUserED25519KeyPairBytes();
    if (!keypair || !keypair.privKeyBytes) {
        throw new Error('edkeypair not found for current user');
    }
    const privateKeyEd25519 = keypair.privKeyBytes;
    setTimeout(() => ConfigurationSyncJob_1.ConfigurationSync.queueNewJobIfNeeded, 20000);
    const dumps = await configDump_1.ConfigDumpData.getAllDumpsWithData();
    sessionjs_logger_1.console.info('initializeLibSessionUtilWrappers alldumpsInDB already: ', JSON.stringify(dumps.map(m => (0, lodash_1.omit)(m, 'data'))));
    const userVariantsBuildWithoutErrors = new Set();
    for (let index = 0; index < dumps.length; index++) {
        const dump = dumps[index];
        sessionjs_logger_1.console.debug('initializeLibSessionUtilWrappers initing from dump', dump.variant);
        try {
            await libsession_worker_interface_1.GenericWrapperActions.init(dump.variant, privateKeyEd25519, dump.data.length ? dump.data : null);
            userVariantsBuildWithoutErrors.add(dump.variant);
        }
        catch (e) {
            sessionjs_logger_1.console.warn(`init of UserConfig failed with ${e.message} `);
            throw new Error(`initializeLibSessionUtilWrappers failed with ${e.message}`);
        }
    }
    const missingRequiredVariants = (0, lodash_1.difference)(exports.LibSessionUtil.requiredUserVariants, [...userVariantsBuildWithoutErrors.values()]);
    for (let index = 0; index < missingRequiredVariants.length; index++) {
        const missingVariant = missingRequiredVariants[index];
        sessionjs_logger_1.console.warn(`initializeLibSessionUtilWrappers: missingRequiredVariants "${missingVariant}"`);
        await libsession_worker_interface_1.GenericWrapperActions.init(missingVariant, privateKeyEd25519, null);
        const dump = await libsession_worker_interface_1.GenericWrapperActions.dump(missingVariant);
        await configDump_1.ConfigDumpData.saveConfigDump({
            data: dump,
            publicKey: __1.UserUtils.getOurPubKeyStrFromCache(),
            variant: missingVariant,
        });
        sessionjs_logger_1.console.debug(`initializeLibSessionUtilWrappers: missingRequiredVariants "${missingVariant}" created`);
    }
}
async function pendingChangesForPubkey(pubkey) {
    const dumps = await configDump_1.ConfigDumpData.getAllDumpsWithoutData();
    const us = __1.UserUtils.getOurPubKeyStrFromCache();
    if (pubkey === us) {
        exports.LibSessionUtil.requiredUserVariants.forEach(requiredVariant => {
            if (!dumps.find(m => m.publicKey === us && m.variant === requiredVariant)) {
                dumps.push({
                    publicKey: us,
                    variant: requiredVariant,
                });
            }
        });
    }
    const results = [];
    const variantsNeedingPush = new Set();
    for (let index = 0; index < dumps.length; index++) {
        const dump = dumps[index];
        const variant = dump.variant;
        const needsPush = await libsession_worker_interface_1.GenericWrapperActions.needsPush(variant);
        if (!needsPush) {
            continue;
        }
        variantsNeedingPush.add(variant);
        const { data, seqno, hashes } = await libsession_worker_interface_1.GenericWrapperActions.push(variant);
        const kind = variantToKind(variant);
        const namespace = await libsession_worker_interface_1.GenericWrapperActions.storageNamespace(variant);
        results.push({
            message: new SharedConfigMessage_1.SharedConfigMessage({
                data,
                kind,
                seqno: long_1.default.fromNumber(seqno),
                timestamp: getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset(),
            }),
            oldMessageHashes: hashes,
            namespace,
        });
    }
    sessionjs_logger_1.console.info(`those variants needs push: "${[...variantsNeedingPush]}"`);
    return results;
}
function kindToVariant(kind) {
    switch (kind) {
        case protobuf_1.SignalService.SharedConfigMessage.Kind.USER_PROFILE:
            return 'UserConfig';
        case protobuf_1.SignalService.SharedConfigMessage.Kind.CONTACTS:
            return 'ContactsConfig';
        case protobuf_1.SignalService.SharedConfigMessage.Kind.USER_GROUPS:
            return 'UserGroupsConfig';
        case protobuf_1.SignalService.SharedConfigMessage.Kind.CONVO_INFO_VOLATILE:
            return 'ConvoInfoVolatileConfig';
        default:
            (0, sqlSharedTypes_1.assertUnreachable)(kind, `kindToVariant: Unsupported variant: "${kind}"`);
    }
}
function variantToKind(variant) {
    switch (variant) {
        case 'UserConfig':
            return protobuf_1.SignalService.SharedConfigMessage.Kind.USER_PROFILE;
        case 'ContactsConfig':
            return protobuf_1.SignalService.SharedConfigMessage.Kind.CONTACTS;
        case 'UserGroupsConfig':
            return protobuf_1.SignalService.SharedConfigMessage.Kind.USER_GROUPS;
        case 'ConvoInfoVolatileConfig':
            return protobuf_1.SignalService.SharedConfigMessage.Kind.CONVO_INFO_VOLATILE;
        default:
            (0, sqlSharedTypes_1.assertUnreachable)(variant, `variantToKind: Unsupported kind: "${variant}"`);
    }
}
async function markAsPushed(variant, pubkey, seqno, hash) {
    if (pubkey !== __1.UserUtils.getOurPubKeyStrFromCache()) {
        throw new Error('FIXME, generic case is to be done');
    }
    await libsession_worker_interface_1.GenericWrapperActions.confirmPushed(variant, seqno, hash);
    return libsession_worker_interface_1.GenericWrapperActions.needsDump(variant);
}
exports.LibSessionUtil = {
    initializeLibSessionUtilWrappers,
    requiredUserVariants,
    pendingChangesForPubkey,
    kindToVariant,
    variantToKind,
    markAsPushed,
};
