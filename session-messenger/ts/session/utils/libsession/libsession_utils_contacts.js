"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionUtilContact = void 0;
const sqlSharedTypes_1 = require("../../../types/sqlSharedTypes");
const libsession_worker_interface_1 = require("../../../webworker/workers/browser/libsession_worker_interface");
const conversations_1 = require("../../conversations");
const types_1 = require("../../types");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
const mappedContactWrapperValues = new Map();
function isContactToStoreInWrapper(convo) {
    try {
        types_1.PubKey.cast(convo.id);
    }
    catch (e) {
        return false;
    }
    return !convo.isMe() && convo.isPrivate() && convo.isActive() && !types_1.PubKey.isBlinded(convo.id);
}
async function insertContactFromDBIntoWrapperAndRefresh(id) {
    const foundConvo = (0, conversations_1.getConversationController)().get(id);
    if (!foundConvo) {
        return;
    }
    if (!isContactToStoreInWrapper(foundConvo)) {
        return;
    }
    const dbName = foundConvo.get('displayNameInProfile') || undefined;
    const dbNickname = foundConvo.get('nickname') || undefined;
    const dbProfileUrl = foundConvo.get('avatarPointer') || undefined;
    const dbProfileKey = foundConvo.get('profileKey') || undefined;
    const dbApproved = !!foundConvo.get('isApproved') || false;
    const dbApprovedMe = !!foundConvo.get('didApproveMe') || false;
    const dbBlocked = !!foundConvo.isBlocked() || false;
    const priority = foundConvo.get('priority') || 0;
    const wrapperContact = (0, sqlSharedTypes_1.getContactInfoFromDBValues)({
        id,
        dbApproved,
        dbApprovedMe,
        dbBlocked,
        dbName,
        dbNickname,
        dbProfileKey,
        dbProfileUrl,
        priority,
        dbCreatedAtSeconds: 0,
    });
    try {
        sessionjs_logger_1.console.debug('inserting into contact wrapper: ', JSON.stringify(wrapperContact));
        await libsession_worker_interface_1.ContactsWrapperActions.set(wrapperContact);
    }
    catch (e) {
        sessionjs_logger_1.console.warn(`ContactsWrapperActions.set of ${id} failed with ${e.message}`);
    }
    await refreshMappedValue(id);
}
async function refreshMappedValue(id, duringAppStart = false) {
    const fromWrapper = await libsession_worker_interface_1.ContactsWrapperActions.get(id);
    if (fromWrapper) {
        setMappedValue(fromWrapper);
        if (!duringAppStart) {
            (0, conversations_1.getConversationController)()
                .get(id)
                ?.triggerUIRefresh();
        }
    }
    else if (mappedContactWrapperValues.delete(id)) {
        if (!duringAppStart) {
            (0, conversations_1.getConversationController)()
                .get(id)
                ?.triggerUIRefresh();
        }
    }
}
function setMappedValue(info) {
    mappedContactWrapperValues.set(info.id, info);
}
function getContactCached(id) {
    return mappedContactWrapperValues.get(id);
}
async function removeContactFromWrapper(id) {
    try {
        await libsession_worker_interface_1.ContactsWrapperActions.erase(id);
    }
    catch (e) {
        sessionjs_logger_1.console.warn(`ContactsWrapperActions.erase of ${id} failed with ${e.message}`);
    }
    await refreshMappedValue(id);
}
exports.SessionUtilContact = {
    isContactToStoreInWrapper,
    insertContactFromDBIntoWrapperAndRefresh,
    removeContactFromWrapper,
    getContactCached,
    refreshMappedValue,
};
