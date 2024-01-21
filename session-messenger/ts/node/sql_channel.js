"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeSqlChannel = void 0;
const sql_1 = require("./sql");
const sessionjs_logger_1 = require("../sessionjs-logger");
function initializeSqlChannel() {
    global.SBOT.SqlChannelKey = (event, jobId, callName, ...args) => {
        try {
            const fn = sql_1.sqlNode[callName];
            if (!fn) {
                throw new Error(`sql channel: ${callName} is not an available function`);
            }
            const result = fn(...args);
            return result;
        }
        catch (error) {
            const errorForDisplay = error && error.stack ? error.stack : error;
            sessionjs_logger_1.console.log(`sql channel error with call ${callName}: ${errorForDisplay}`);
        }
    };
}
exports.initializeSqlChannel = initializeSqlChannel;
