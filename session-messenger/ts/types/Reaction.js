"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Action = exports.RecentReactions = exports.reactionLimit = void 0;
exports.reactionLimit = 6;
class RecentReactions {
    items = [];
    constructor(items) {
        this.items = items;
    }
    size() {
        return this.items.length;
    }
    push(item) {
        if (this.size() === exports.reactionLimit) {
            this.items.pop();
        }
        this.items.unshift(item);
    }
    pop() {
        return this.items.pop();
    }
    swap(index) {
        const temp = this.items.splice(index, 1);
        this.push(temp[0]);
    }
}
exports.RecentReactions = RecentReactions;
var Action;
(function (Action) {
    Action[Action["REACT"] = 0] = "REACT";
    Action[Action["REMOVE"] = 1] = "REMOVE";
})(Action || (exports.Action = Action = {}));
