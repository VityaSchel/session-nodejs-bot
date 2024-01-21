"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetch = exports.getLogger = exports.initializeLogger = void 0;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const bunyan_1 = __importDefault(require("bunyan"));
const lodash_1 = __importDefault(require("lodash"));
const firstline_1 = __importDefault(require("firstline"));
const read_last_lines_ts_1 = require("read-last-lines-ts");
const rimraf_1 = __importDefault(require("rimraf"));
const privacy_1 = require("../util/privacy");
const sessionjs_logger_1 = require("../sessionjs-logger");
const LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace'];
let logger;
async function initializeLogger() {
    if (logger) {
        throw new Error('Already called initialize!');
    }
    const logPath = path_1.default.join(global.SBOT.profileDataPath, 'logs');
    fs_1.default.mkdirSync(logPath, { recursive: true });
    return cleanupLogs(logPath).then(() => {
        if (logger) {
            return;
        }
        const logFile = path_1.default.join(logPath, 'log.log');
        logger = bunyan_1.default.createLogger({
            name: 'log',
            streams: [
                {
                    level: 'debug',
                    stream: process.stdout,
                },
                {
                    type: 'rotating-file',
                    path: logFile,
                    period: '1d',
                    count: 1,
                },
            ],
        });
    });
}
exports.initializeLogger = initializeLogger;
async function deleteAllLogs(logPath) {
    return new Promise((resolve, reject) => {
        (0, rimraf_1.default)(logPath, {
            disableGlob: true,
        }, error => {
            if (error) {
                reject(error);
                return;
            }
            resolve(undefined);
        });
    });
}
async function cleanupLogs(logPath) {
    const now = new Date();
    const earliestDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 6));
    try {
        const remaining = await eliminateOutOfDateFiles(logPath, earliestDate);
        const files = lodash_1.default.filter(remaining, file => !file.start && file.end);
        if (!files.length) {
            return;
        }
        await eliminateOldEntries(files, earliestDate);
    }
    catch (error) {
        sessionjs_logger_1.console.error('Error cleaning logs; deleting and starting over from scratch.', error.stack);
        await deleteAllLogs(logPath);
        fs_1.default.mkdirSync(logPath, { recursive: true });
    }
}
function isLineAfterDate(line, date) {
    if (!line) {
        return false;
    }
    try {
        const data = JSON.parse(line);
        return new Date(data.time).getTime() > date.getTime();
    }
    catch (e) {
        sessionjs_logger_1.console.log('error parsing log line', e.stack, line);
        return false;
    }
}
async function eliminateOutOfDateFiles(logPath, date) {
    const files = fs_1.default.readdirSync(logPath);
    const paths = files.map(file => path_1.default.join(logPath, file));
    return Promise.all(lodash_1.default.map(paths, target => Promise.all([(0, firstline_1.default)(target), (0, read_last_lines_ts_1.readLastLinesEnc)('utf8')(target, 2)]).then(results => {
        const start = results[0];
        const end = results[1].split('\n');
        const file = {
            path: target,
            start: isLineAfterDate(start, date),
            end: isLineAfterDate(end[end.length - 1], date) ||
                isLineAfterDate(end[end.length - 2], date),
        };
        if (!file.start && !file.end) {
            fs_1.default.unlinkSync(file.path);
        }
        return file;
    })));
}
async function eliminateOldEntries(files, date) {
    const earliest = date.getTime();
    return Promise.all(lodash_1.default.map(files, file => fetchLog(file.path).then((lines) => {
        const recent = lodash_1.default.filter(lines, line => new Date(line.time).getTime() >= earliest);
        const text = lodash_1.default.map(recent, line => JSON.stringify(line)).join('\n');
        fs_1.default.writeFileSync(file.path, `${text}\n`);
    })));
}
function getLogger() {
    if (!logger) {
        throw new Error("Logger hasn't been initialized yet!");
    }
    return logger;
}
exports.getLogger = getLogger;
async function fetchLog(logFile) {
    return new Promise((resolve, reject) => {
        fs_1.default.readFile(logFile, { encoding: 'utf8' }, (err, text) => {
            if (err) {
                reject(err);
                return;
            }
            const lines = lodash_1.default.compact(text.split('\n'));
            const data = lodash_1.default.compact(lines.map(line => {
                try {
                    return lodash_1.default.pick(JSON.parse(line), ['level', 'time', 'msg']);
                }
                catch (e) {
                    return null;
                }
            }));
            resolve(data);
        });
    });
}
async function fetch(logPath) {
    if (!fs_1.default.existsSync(logPath)) {
        sessionjs_logger_1.console._log('Log folder not found while fetching its content. Quick! Creating it.');
        fs_1.default.mkdirSync(logPath, { recursive: true });
    }
    const files = fs_1.default.readdirSync(logPath);
    const paths = files.map(file => path_1.default.join(logPath, file));
    const now = new Date();
    const fileListEntry = {
        level: 30,
        time: now.toJSON(),
        msg: `Loaded this list of log files from logPath: ${files.join(', ')}`,
    };
    return Promise.all(paths.map(fetchLog)).then(results => {
        const data = lodash_1.default.flatten(results);
        data.push(fileListEntry);
        return lodash_1.default.sortBy(data, 'time');
    });
}
exports.fetch = fetch;
function logAtLevel(level, ...args) {
    if (logger) {
        const str = args.map((item) => {
            if (typeof item !== 'string') {
                try {
                    return JSON.stringify(item);
                }
                catch (e) {
                    return item;
                }
            }
            return item;
        });
        logger[level]((0, privacy_1.redactAll)(str.join(' ')));
    }
    else {
        sessionjs_logger_1.console._log(...args);
    }
}
