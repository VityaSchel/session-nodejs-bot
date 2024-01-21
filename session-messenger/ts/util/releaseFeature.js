"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReleasedFeatures = exports.getIsFeatureReleased = exports.resetFeatureReleasedCachedValue = void 0;
const getNetworkTime_1 = require("../session/apis/snode_api/getNetworkTime");
const ConfigurationSyncJob_1 = require("../session/utils/job_runners/jobs/ConfigurationSyncJob");
const sessionjs_logger_1 = require("../sessionjs-logger");
const sqlSharedTypes_1 = require("../types/sqlSharedTypes");
const storage_1 = require("./storage");
let isDisappearingMessageFeatureReleased;
let isUserConfigLibsessionFeatureReleased;
function resetFeatureReleasedCachedValue() {
    isDisappearingMessageFeatureReleased = undefined;
    isUserConfigLibsessionFeatureReleased = undefined;
}
exports.resetFeatureReleasedCachedValue = resetFeatureReleasedCachedValue;
function getIsFeatureReleasedCached(featureName) {
    switch (featureName) {
        case 'disappearing_messages':
            return isDisappearingMessageFeatureReleased;
        case 'user_config_libsession':
            return isUserConfigLibsessionFeatureReleased;
        default:
            (0, sqlSharedTypes_1.assertUnreachable)(featureName, 'case not handled for getIsFeatureReleasedCached');
    }
}
function setIsFeatureReleasedCached(featureName, value) {
    switch (featureName) {
        case 'disappearing_messages':
            isDisappearingMessageFeatureReleased = value;
            break;
        case 'user_config_libsession':
            isUserConfigLibsessionFeatureReleased = value;
            break;
        default:
            (0, sqlSharedTypes_1.assertUnreachable)(featureName, 'case not handled for setIsFeatureReleasedCached');
    }
}
function getFeatureReleaseTimestamp(featureName) {
    switch (featureName) {
        case 'disappearing_messages':
            return 1706778000000;
        case 'user_config_libsession':
            return 1690761600000;
        default:
            (0, sqlSharedTypes_1.assertUnreachable)(featureName, 'case not handled for getFeatureReleaseTimestamp');
    }
}
function featureStorageItemId(featureName) {
    return `featureReleased-${featureName}`;
}
async function getIsFeatureReleased(featureName) {
    if (getIsFeatureReleasedCached(featureName) === undefined) {
        const oldIsFeatureReleased = Boolean(storage_1.Storage.get(featureStorageItemId(featureName)));
        if (oldIsFeatureReleased === undefined) {
            await storage_1.Storage.put(featureStorageItemId(featureName), false);
            setIsFeatureReleasedCached(featureName, false);
        }
        else {
            setIsFeatureReleasedCached(featureName, oldIsFeatureReleased);
        }
    }
    return Boolean(getIsFeatureReleasedCached(featureName));
}
exports.getIsFeatureReleased = getIsFeatureReleased;
async function checkIsFeatureReleased(featureName) {
    const featureAlreadyReleased = await getIsFeatureReleased(featureName);
    if (!featureAlreadyReleased &&
        getNetworkTime_1.GetNetworkTime.getNowWithNetworkOffset() >= getFeatureReleaseTimestamp(featureName)) {
        sessionjs_logger_1.console.info(`[releaseFeature]: It is time to release ${featureName}. Releasing it now`);
        await storage_1.Storage.put(featureStorageItemId(featureName), true);
        setIsFeatureReleasedCached(featureName, true);
        await ConfigurationSyncJob_1.ConfigurationSync.queueNewJobIfNeeded();
    }
    const isReleased = Boolean(getIsFeatureReleasedCached(featureName));
    return isReleased;
}
async function checkIsUserConfigFeatureReleased() {
    return checkIsFeatureReleased('user_config_libsession');
}
function isUserConfigFeatureReleasedCached() {
    return !!isUserConfigLibsessionFeatureReleased;
}
exports.ReleasedFeatures = {
    checkIsUserConfigFeatureReleased,
    isUserConfigFeatureReleasedCached,
};
