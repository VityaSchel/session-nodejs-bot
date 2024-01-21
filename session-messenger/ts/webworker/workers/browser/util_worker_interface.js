"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.callUtilsWorker = void 0;
const path_1 = require("path");
const getRootPath_1 = require("../../../node/getRootPath");
const worker_interface_1 = require("../../worker_interface");
let utilWorkerInterface;
const internalCallUtilsWorker = async (fnName, ...args) => {
    if (!utilWorkerInterface) {
        const utilWorkerPath = (0, path_1.join)((0, getRootPath_1.getAppRootPath)(), 'ts', 'webworker', 'workers', 'node', 'util', 'util.worker.js');
        utilWorkerInterface = new worker_interface_1.WorkerInterface(utilWorkerPath, 3 * 60 * 1000);
    }
    return utilWorkerInterface?.callWorker(fnName, ...args);
};
const callUtilsWorker = async (fnName, ...args) => {
    return internalCallUtilsWorker(fnName, ...args);
};
exports.callUtilsWorker = callUtilsWorker;
