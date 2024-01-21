"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTPError = exports.NotFoundError = exports.EmptySwarmError = void 0;
class EmptySwarmError extends Error {
    error;
    pubkey;
    constructor(pubkey, message) {
        super(message);
        this.pubkey = pubkey.split('.')[0];
        this.name = 'EmptySwarmError';
        const actualProto = new.target.prototype;
        if (Object.setPrototypeOf) {
            Object.setPrototypeOf(this, actualProto);
        }
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this);
        }
    }
}
exports.EmptySwarmError = EmptySwarmError;
class NotFoundError extends Error {
    error;
    constructor(message, error) {
        super(message);
        this.error = error;
        this.name = 'NotFoundError';
        const actualProto = new.target.prototype;
        if (Object.setPrototypeOf) {
            Object.setPrototypeOf(this, actualProto);
        }
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this);
        }
    }
}
exports.NotFoundError = NotFoundError;
class HTTPError extends Error {
    response;
    constructor(message, response) {
        super(`${response.status} Error: ${message}`);
        this.response = response;
        this.name = 'HTTPError';
        const actualProto = new.target.prototype;
        if (Object.setPrototypeOf) {
            Object.setPrototypeOf(this, actualProto);
        }
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this);
        }
    }
}
exports.HTTPError = HTTPError;
