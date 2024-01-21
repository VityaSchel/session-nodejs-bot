"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationSyncJobDone = exports.configurationMessageReceived = exports.trigger = void 0;
const sessionjs_logger_1 = require("../sessionjs-logger");
function trigger(name, param1, param2) {
    sessionjs_logger_1.console.log('[window.Whisper] trigger', name, param1, param2);
}
exports.trigger = trigger;
exports.configurationMessageReceived = 'configurationMessageReceived';
exports.ConfigurationSyncJobDone = 'ConfigurationSyncJobDone';
