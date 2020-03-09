"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const config_1 = require("./config");
const LocalCache = process.env.TRAEFIK_LOCAL_CACHE || `${process.env.HOME}/.traefikConfigCache`;
exports.containers = [];
exports.readCacheContainers = () => fs_1.readFileSync(LocalCache).toString();
exports.queryContainers = () => {
    const result = child_process_1.execSync(config_1.programOptions.config.shell.replace('%%cmd%%', `docker service ls --format "{{.ID}},{{.Name}}"`)).toString();
    fs_1.writeFileSync(LocalCache, result);
    return result;
};
exports.parseContainers = (data) => data
    .split('\n')
    .map(value => {
    const [id, name] = value.split(',');
    return {
        id,
        name,
    };
})
    .filter(value => typeof value.name !== 'undefined');
exports.loadContainers = (filterName) => {
    exports.containers.push(...exports.parseContainers(fs_1.existsSync(LocalCache) && !config_1.programOptions.noCache ? exports.readCacheContainers() : exports.queryContainers()).filter(v => {
        if (filterName)
            return v.name.includes(filterName);
        return true;
    }));
};
exports.getContainerInfo = (id) => child_process_1.execSync(config_1.programOptions.config.shell.replace('%%cmd%%', `docker service inspect ${id}`)).toString();
exports.convertLabelsToObject = (labels) => {
    return Object.entries(labels).map(([key, value]) => ({
        key,
        value,
    }));
};
