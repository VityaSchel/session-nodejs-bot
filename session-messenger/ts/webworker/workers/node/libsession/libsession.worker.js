"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const libsession_util_nodejs_1 = require("libsession_util_nodejs");
const sessionjs_logger_1 = require("../../../../sessionjs-logger");
function assertUnreachable(_x, message) {
    sessionjs_logger_1.console.info(`assertUnreachable: Didn't expect to get here with "${message}"`);
    throw new Error("Didn't expect to get here");
}
let userProfileWrapper;
let contactsConfigWrapper;
let userGroupsConfigWrapper;
let convoInfoVolatileConfigWrapper;
function getUserWrapper(type) {
    switch (type) {
        case 'UserConfig':
            return userProfileWrapper;
        case 'ContactsConfig':
            return contactsConfigWrapper;
        case 'UserGroupsConfig':
            return userGroupsConfigWrapper;
        case 'ConvoInfoVolatileConfig':
            return convoInfoVolatileConfigWrapper;
        default:
            assertUnreachable(type, `getUserWrapper: Missing case error "${type}"`);
    }
}
function getCorrespondingWrapper(wrapperType) {
    switch (wrapperType) {
        case 'UserConfig':
        case 'ContactsConfig':
        case 'UserGroupsConfig':
        case 'ConvoInfoVolatileConfig':
            const wrapper = getUserWrapper(wrapperType);
            if (!wrapper) {
                throw new Error(`${wrapperType} is not init yet`);
            }
            return wrapper;
        default:
            assertUnreachable(wrapperType, `getCorrespondingWrapper: Missing case error "${wrapperType}"`);
    }
}
function isUInt8Array(value) {
    return value.constructor === Uint8Array;
}
function assertUserWrapperType(wrapperType) {
    if (wrapperType !== 'ContactsConfig' &&
        wrapperType !== 'UserConfig' &&
        wrapperType !== 'UserGroupsConfig' &&
        wrapperType !== 'ConvoInfoVolatileConfig') {
        throw new Error(`wrapperType "${wrapperType} is not of type User"`);
    }
    return wrapperType;
}
function initUserWrapper(options, wrapperType) {
    const userType = assertUserWrapperType(wrapperType);
    const wrapper = getUserWrapper(wrapperType);
    if (wrapper) {
        throw new Error(`${wrapperType} already init`);
    }
    if (options.length !== 2) {
        throw new Error(`${wrapperType} init needs two arguments`);
    }
    const [edSecretKey, dump] = options;
    if ((0, lodash_1.isEmpty)(edSecretKey) || !isUInt8Array(edSecretKey)) {
        throw new Error(`${wrapperType} init needs a valid edSecretKey`);
    }
    if (!(0, lodash_1.isNull)(dump) && !isUInt8Array(dump)) {
        throw new Error(`${wrapperType} init needs a valid dump`);
    }
    switch (userType) {
        case 'UserConfig':
            userProfileWrapper = new libsession_util_nodejs_1.UserConfigWrapperNode(edSecretKey, dump);
            break;
        case 'ContactsConfig':
            contactsConfigWrapper = new libsession_util_nodejs_1.ContactsConfigWrapperNode(edSecretKey, dump);
            break;
        case 'UserGroupsConfig':
            userGroupsConfigWrapper = new libsession_util_nodejs_1.UserGroupsWrapperNode(edSecretKey, dump);
            break;
        case 'ConvoInfoVolatileConfig':
            convoInfoVolatileConfigWrapper = new libsession_util_nodejs_1.ConvoInfoVolatileWrapperNode(edSecretKey, dump);
            break;
        default:
            assertUnreachable(userType, `initUserWrapper: Missing case error "${userType}"`);
    }
}
self.onmessage = async (e) => {
    const [jobId, config, action, ...args] = e.data;
    try {
        if (action === 'init') {
            initUserWrapper(args, config);
            postMessage([jobId, null, null]);
            return;
        }
        const wrapper = getCorrespondingWrapper(config);
        const fn = wrapper[action];
        if (!fn) {
            throw new Error(`Worker: job "${jobId}" did not find function "${action}" on config "${config}"`);
        }
        const result = await wrapper[action](...args);
        postMessage([jobId, null, result]);
    }
    catch (error) {
        const errorForDisplay = prepareErrorForPostMessage(error);
        postMessage([jobId, errorForDisplay]);
    }
};
function prepareErrorForPostMessage(error) {
    if (!error) {
        return null;
    }
    return error.message;
}
