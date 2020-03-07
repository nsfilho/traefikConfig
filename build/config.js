"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var fs_1 = require("fs");
var LocalConfig = process.env.TRAEFIK_LOCAL_CONFIG || process.env.HOME + "/.traefikConfig";
var configPaths = [LocalConfig];
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
exports.checkExistsConfig = function () {
    var resultPath;
    configPaths.forEach(function (path) {
        if (fs_1.existsSync(path))
            resultPath = path;
    });
    return resultPath;
};
/**
 * Load configuration file
 */
exports.loadConfig = function () {
    var path = exports.checkExistsConfig();
    if (path) {
        var configRaw = fs_1.readFileSync(path).toString();
        exports.programOptions.config = JSON.parse(configRaw);
    }
    else {
        console.warn('::warn:: using default configuration!');
    }
};
exports.writeServer = function (server, username, port) {
    if (username === void 0) { username = 'root'; }
    if (port === void 0) { port = 22; }
    var config = exports.programOptions.config;
    config.shell = "ssh -p " + port + " " + username + "@" + server + " '%%cmd%%'";
    config.server = server;
    config.port = port;
    config.username = username;
    config.remote = true;
    fs_1.writeFileSync(LocalConfig, JSON.stringify(exports.programOptions.config));
    return true;
};
exports.writeLocal = function () {
    var config = exports.programOptions.config;
    config.remote = false;
    config.shell = '%%cmd%%';
    fs_1.writeFileSync(LocalConfig, JSON.stringify(exports.programOptions.config));
    return true;
};
//# sourceMappingURL=config.js.map