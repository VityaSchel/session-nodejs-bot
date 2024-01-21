"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RingBuffer = void 0;
class RingBuffer {
    newest = -1;
    oldest = 0;
    buffer = [];
    capacity;
    constructor(capacity) {
        this.capacity = capacity;
    }
    getCapacity() {
        return this.capacity;
    }
    getLength() {
        if (this.isEmpty()) {
            return 0;
        }
        if (this.newest >= this.oldest) {
            return this.newest + 1;
        }
        const firstPart = this.capacity - this.oldest;
        const secondPart = this.newest + 1;
        return firstPart + secondPart;
    }
    insert(item) {
        this.newest = (this.newest + 1) % this.capacity;
        if (this.buffer.length >= this.capacity) {
            this.oldest = (this.oldest + 1) % this.capacity;
        }
        this.buffer[this.newest] = item;
    }
    has(item) {
        if (this.isEmpty()) {
            return false;
        }
        return this.toArray().includes(item);
    }
    isEmpty() {
        return this.newest === -1;
    }
    clear() {
        this.buffer = [];
        this.newest = -1;
        this.oldest = 0;
    }
    toArray() {
        if (this.isEmpty()) {
            return [];
        }
        if (this.newest >= this.oldest) {
            return this.buffer.slice(0, this.newest + 1);
        }
        const firstPart = this.buffer.slice(this.oldest, this.capacity);
        const secondPart = this.buffer.slice(0, this.newest + 1);
        return [...firstPart, ...secondPart];
    }
}
exports.RingBuffer = RingBuffer;
