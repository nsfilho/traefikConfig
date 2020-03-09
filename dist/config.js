"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const LocalConfig = process.env.TRAEFIK_LOCAL_CONFIG || `${process.env.HOME}/.traefikConfig`;
const configPaths = [LocalConfig];
exports.programOptions = {
    config: {
        shell: '%%cmd%%',
        remote: false,
        server: '',
        port: 22,
        username: 'root',
    },
    noCache: false,
};
exports.checkExistsConfig = () => {
    let resultPath;
    configPaths.forEach(path => {
        if (fs_1.existsSync(path))
            resultPath = path;
    });
    return resultPath;
};
/**
 * Load configuration file
 */
exports.loadConfig = () => {
    const path = exports.checkExistsConfig();
    if (path) {
        const configRaw = fs_1.readFileSync(path).toString();
        exports.programOptions.config = JSON.parse(configRaw);
    }
    else {
        console.warn('::warn:: using default configuration!');
    }
};
exports.writeServer = (server, username = 'root', port = 22) => {
    const { config } = exports.programOptions;
    config.shell = `ssh -p ${port} ${username}@${server} '%%cmd%%'`;
    config.server = server;
    config.port = port;
    config.username = username;
    config.remote = true;
    fs_1.writeFileSync(LocalConfig, JSON.stringify(exports.programOptions.config));
    return true;
};
exports.writeLocal = () => {
    const { config } = exports.programOptions;
    config.remote = false;
    config.shell = '%%cmd%%';
    fs_1.writeFileSync(LocalConfig, JSON.stringify(exports.programOptions.config));
    return true;
};
