"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.firstTrue = exports.sleepFor = exports.delay = exports.timeout = exports.waitUntil = exports.poll = exports.waitForTask = exports.hasAlreadyOneAtaTimeMatching = exports.allowOnlyOneAtATime = exports.TaskTimedOutError = void 0;
const sessionjs_logger_1 = require("../../sessionjs-logger");
async function toPromise(value) {
    return value instanceof Promise ? value : Promise.resolve(value);
}
class TaskTimedOutError extends Error {
    constructor() {
        super('Task timed out');
        Object.setPrototypeOf(this, TaskTimedOutError.prototype);
    }
}
exports.TaskTimedOutError = TaskTimedOutError;
const oneAtaTimeRecord = {};
async function allowOnlyOneAtATime(name, process, timeoutMs) {
    if (oneAtaTimeRecord[name] === undefined) {
        oneAtaTimeRecord[name] = new Promise(async (resolve, reject) => {
            let timeoutTimer = null;
            if (timeoutMs) {
                timeoutTimer = setTimeout(() => {
                    sessionjs_logger_1.console.warn(`allowOnlyOneAtATime - TIMEDOUT after ${timeoutMs}ms`);
                    delete oneAtaTimeRecord[name];
                    reject();
                }, timeoutMs);
            }
            let innerRetVal;
            try {
                innerRetVal = await process();
            }
            catch (e) {
                if (typeof e === 'string') {
                    sessionjs_logger_1.console.error(`allowOnlyOneAtATime - error ${e}`);
                }
                else {
                    sessionjs_logger_1.console.error(`allowOnlyOneAtATime - error ${e.code} ${e.message}`);
                }
                if (timeoutMs) {
                    if (timeoutTimer !== null) {
                        clearTimeout(timeoutTimer);
                        timeoutTimer = null;
                    }
                }
                delete oneAtaTimeRecord[name];
                reject(e);
            }
            if (timeoutMs) {
                if (timeoutTimer !== null) {
                    clearTimeout(timeoutTimer);
                    timeoutTimer = null;
                }
            }
            delete oneAtaTimeRecord[name];
            resolve(innerRetVal);
        });
    }
    return oneAtaTimeRecord[name];
}
exports.allowOnlyOneAtATime = allowOnlyOneAtATime;
function hasAlreadyOneAtaTimeMatching(text) {
    return Boolean(oneAtaTimeRecord[text]);
}
exports.hasAlreadyOneAtaTimeMatching = hasAlreadyOneAtaTimeMatching;
async function waitForTask(task, timeoutMs = 2000) {
    const timeoutPromise = new Promise((_, rej) => {
        const wait = setTimeout(() => {
            clearTimeout(wait);
            rej(new TaskTimedOutError());
        }, timeoutMs);
    });
    const taskPromise = new Promise(async (res, rej) => {
        try {
            await toPromise(task(res));
        }
        catch (e) {
            rej(e);
        }
    });
    return Promise.race([timeoutPromise, taskPromise]);
}
exports.waitForTask = waitForTask;
async function poll(task, options = {}) {
    const defaults = {
        timeoutMs: 2000,
        interval: 100,
    };
    const { timeoutMs, interval } = {
        ...defaults,
        ...options,
    };
    const endTime = Date.now() + timeoutMs;
    let stop = false;
    const finish = () => {
        stop = true;
    };
    const _poll = async (resolve, reject) => {
        if (stop) {
            resolve();
        }
        else if (Date.now() >= endTime) {
            finish();
            reject(new Error('Periodic check timeout'));
        }
        else {
            try {
                await toPromise(task(finish));
            }
            catch (e) {
                finish();
                reject(e);
                return;
            }
            setTimeout(() => {
                void _poll(resolve, reject);
            }, interval);
        }
    };
    return new Promise((resolve, reject) => {
        void _poll(resolve, reject);
    });
}
exports.poll = poll;
async function waitUntil(check, timeoutMs = 2000) {
    return poll(async (done) => {
        const result = await toPromise(check());
        if (result) {
            done();
        }
    }, {
        timeoutMs,
        interval: timeoutMs / 20,
    });
}
exports.waitUntil = waitUntil;
async function timeout(promise, timeoutMs) {
    const timeoutPromise = new Promise((_, rej) => {
        const wait = setTimeout(() => {
            clearTimeout(wait);
            rej(new TaskTimedOutError());
        }, timeoutMs);
    });
    return Promise.race([timeoutPromise, promise]);
}
exports.timeout = timeout;
async function delay(timeoutMs = 2000) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(true);
        }, timeoutMs);
    });
}
exports.delay = delay;
const sleepFor = async (ms, showLog = false) => {
    if (showLog) {
        sessionjs_logger_1.console.info(`sleeping for ${ms}ms...`);
    }
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
};
exports.sleepFor = sleepFor;
const firstTrue = async (ps) => {
    const newPs = ps.map(async (p) => new Promise((resolve, reject) => p.then(v => v && resolve(v), reject)));
    newPs.push(Promise.all(ps).then(() => false));
    return Promise.race(newPs);
};
exports.firstTrue = firstTrue;
