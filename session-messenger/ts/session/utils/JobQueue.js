"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JobQueue = void 0;
const uuid_1 = require("uuid");
class JobQueue {
    pending = Promise.resolve();
    jobs = new Map();
    has(id) {
        return this.jobs.has(id);
    }
    async add(job) {
        const id = (0, uuid_1.v4)();
        return this.addWithId(id, job);
    }
    async addWithId(id, job) {
        if (this.jobs.has(id)) {
            return this.jobs.get(id);
        }
        const previous = this.pending || Promise.resolve();
        this.pending = previous.then(job, job);
        const current = this.pending;
        void current
            .catch(() => {
        })
            .finally(() => {
            if (this.pending === current) {
                delete this?.pending;
            }
            this.jobs.delete(id);
        });
        this.jobs.set(id, current);
        return current;
    }
}
exports.JobQueue = JobQueue;
