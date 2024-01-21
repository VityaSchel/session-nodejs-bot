"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.persistedJobFromData = void 0;
const lodash_1 = require("lodash");
const AvatarDownloadJob_1 = require("./jobs/AvatarDownloadJob");
const ConfigurationSyncJob_1 = require("./jobs/ConfigurationSyncJob");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
function persistedJobFromData(data) {
    if (!data || (0, lodash_1.isEmpty)(data.jobType) || !(0, lodash_1.isString)(data?.jobType)) {
        return null;
    }
    switch (data.jobType) {
        case 'ConfigurationSyncJobType':
            return new ConfigurationSyncJob_1.ConfigurationSync.ConfigurationSyncJob(data);
        case 'AvatarDownloadJobType':
            return new AvatarDownloadJob_1.AvatarDownload.AvatarDownloadJob(data);
        case 'FakeSleepForJobType':
        case 'FakeSleepForJobMultiType':
        default:
            sessionjs_logger_1.console.error('unknown persisted job type:', data.jobType);
            return null;
    }
}
exports.persistedJobFromData = persistedJobFromData;
