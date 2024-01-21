"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SnodeNamespace = exports.SnodeNamespaces = void 0;
const lodash_1 = require("lodash");
const sqlSharedTypes_1 = require("../../../types/sqlSharedTypes");
const sessionjs_logger_1 = require("../../../sessionjs-logger");
var SnodeNamespaces;
(function (SnodeNamespaces) {
    SnodeNamespaces[SnodeNamespaces["UserMessages"] = 0] = "UserMessages";
    SnodeNamespaces[SnodeNamespaces["UserProfile"] = 2] = "UserProfile";
    SnodeNamespaces[SnodeNamespaces["UserContacts"] = 3] = "UserContacts";
    SnodeNamespaces[SnodeNamespaces["ConvoInfoVolatile"] = 4] = "ConvoInfoVolatile";
    SnodeNamespaces[SnodeNamespaces["UserGroups"] = 5] = "UserGroups";
    SnodeNamespaces[SnodeNamespaces["ClosedGroupMessage"] = -10] = "ClosedGroupMessage";
})(SnodeNamespaces || (exports.SnodeNamespaces = SnodeNamespaces = {}));
function isUserConfigNamespace(namespace) {
    switch (namespace) {
        case SnodeNamespaces.UserMessages:
            return false;
        case SnodeNamespaces.UserContacts:
        case SnodeNamespaces.UserProfile:
        case SnodeNamespaces.UserGroups:
        case SnodeNamespaces.ConvoInfoVolatile:
            return true;
        case SnodeNamespaces.ClosedGroupMessage:
            return false;
        default:
            try {
                (0, sqlSharedTypes_1.assertUnreachable)(namespace, `isUserConfigNamespace case not handled: ${namespace}`);
            }
            catch (e) {
                sessionjs_logger_1.console.warn(`isUserConfigNamespace case not handled: ${namespace}: ${e.message}`);
                return false;
            }
    }
}
function namespacePriority(namespace) {
    switch (namespace) {
        case SnodeNamespaces.UserMessages:
            return 10;
        case SnodeNamespaces.UserContacts:
            return 1;
        case SnodeNamespaces.UserProfile:
            return 1;
        case SnodeNamespaces.UserGroups:
            return 1;
        case SnodeNamespaces.ConvoInfoVolatile:
            return 1;
        case SnodeNamespaces.ClosedGroupMessage:
            return 10;
        default:
            try {
                (0, sqlSharedTypes_1.assertUnreachable)(namespace, `namespacePriority case not handled: ${namespace}`);
            }
            catch (e) {
                sessionjs_logger_1.console.warn(`namespacePriority case not handled: ${namespace}: ${e.message}`);
                return 1;
            }
    }
}
function maxSizeMap(namespaces) {
    let lastSplit = 1;
    const withPriorities = namespaces.map(namespace => {
        return { namespace, priority: namespacePriority(namespace) };
    });
    const groupedByPriorities = [];
    withPriorities.forEach(item => {
        if (!groupedByPriorities.find(p => p.priority === item.priority)) {
            groupedByPriorities.push({ priority: item.priority, namespaces: [] });
        }
        groupedByPriorities.find(p => p.priority === item.priority)?.namespaces.push(item.namespace);
    });
    const sortedDescPriorities = (0, lodash_1.orderBy)(groupedByPriorities, ['priority'], ['desc']);
    const lowestPriority = (0, lodash_1.last)(sortedDescPriorities)?.priority || 1;
    const sizeMap = sortedDescPriorities.flatMap(m => {
        const paddingForLowerPriority = m.priority === lowestPriority ? 0 : 1;
        const splitsForPriority = paddingForLowerPriority + m.namespaces.length;
        lastSplit *= splitsForPriority;
        return m.namespaces.map(namespace => ({ namespace, maxSize: -lastSplit }));
    });
    return sizeMap;
}
exports.SnodeNamespace = {
    isUserConfigNamespace,
    maxSizeMap,
};
