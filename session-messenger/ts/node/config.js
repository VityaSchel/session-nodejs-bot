"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const path_1 = __importDefault(require("path"));
const sessionjs_logger_1 = require("../sessionjs-logger");
let environment = 'development';
process.env.NODE_ENV = environment;
process.env.NODE_CONFIG_DIR = path_1.default.join(__dirname, '..', '..', 'config');
if (environment === 'production') {
    process.env.NODE_CONFIG = '';
    process.env.NODE_CONFIG_STRICT_MODE = '0';
    process.env.HOSTNAME = '';
    process.env.ALLOW_CONFIG_MUTATIONS = '';
    process.env.SUPPRESS_NO_CONFIG_WARNING = '';
}
const c = require('config');
c.environment = environment;
['NODE_ENV', 'NODE_APP_INSTANCE', 'NODE_CONFIG_DIR', 'NODE_CONFIG'].forEach(s => {
    sessionjs_logger_1.console.log(`${s} ${c.util.getEnv(s)}`);
});
exports.config = c;
