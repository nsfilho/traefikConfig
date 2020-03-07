"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var child_process_1 = require("child_process");
var fs_1 = require("fs");
var config_1 = require("./config");
var LocalCache = process.env.TRAEFIK_LOCAL_CACHE || process.env.HOME + "/.traefikConfigCache";
exports.containers = [];
exports.readCacheContainers = function () { return fs_1.readFileSync(LocalCache).toString(); };
exports.queryContainers = function () {
    var result = child_process_1.execSync(config_1.programOptions.config.shell.replace('%%cmd%%', "docker service ls --format \"{{.ID}},{{.Name}}\"")).toString();
    fs_1.writeFileSync(LocalCache, result);
    return result;
};
exports.parseContainers = function (data) {
    return data
        .split('\n')
        .map(function (value) {
        var _a = value.split(','), id = _a[0], name = _a[1];
        return {
            id: id,
            name: name,
        };
    })
        .filter(function (value) { return typeof value.name !== 'undefined'; });
};
exports.loadContainers = function (filterName) {
    exports.containers.push.apply(exports.containers, exports.parseContainers(fs_1.existsSync(LocalCache) && !config_1.programOptions.noCache ? exports.readCacheContainers() : exports.queryContainers()).filter(function (v) {
        if (filterName)
            return v.name.includes(filterName);
        return true;
    }));
};
exports.getContainerInfo = function (id) {
    return child_process_1.execSync(config_1.programOptions.config.shell.replace('%%cmd%%', "docker service inspect " + id)).toString();
};
exports.convertLabelsToObject = function (labels) {
    return Object.entries(labels).map(function (_a) {
        var key = _a[0], value = _a[1];
        return ({
            key: key,
            value: value,
        });
    });
};
//# sourceMappingURL=containers.js.map