import { existsSync, writeFileSync, readFileSync } from 'fs';

export interface ConfigFile {
    shell: string;
    remote: boolean;
    server: string;
    port: number;
    username: string;
}

const LocalConfig = process.env.TRAEFIK_LOCAL_CONFIG || `${process.env.HOME}/.traefikConfig`;
const configPaths: string[] = [LocalConfig];

export const programOptions: {
    config: ConfigFile;
    noCache: boolean;
} = {
    config: {
        shell: '%%cmd%%',
        remote: false,
        server: '',
        port: 22,
        username: 'root',
    },
    noCache: false,
};

export const checkExistsConfig = (): string | undefined => {
    let resultPath: string | undefined;
    configPaths.forEach(path => {
        if (existsSync(path)) resultPath = path;
    });
    return resultPath;
};

/**
 * Load configuration file
 */
export const loadConfig = (): void => {
    const path = checkExistsConfig();
    if (path) {
        const configRaw = readFileSync(path).toString();
        programOptions.config = JSON.parse(configRaw);
    } else {
        console.warn('::warn:: using default configuration!');
    }
};

export const writeServer = (server: string, username = 'root', port = 22): boolean => {
    const { config } = programOptions;
    config.shell = `ssh -p ${port} ${username}@${server} '%%cmd%%'`;
    config.server = server;
    config.port = port;
    config.username = username;
    config.remote = true;
    writeFileSync(LocalConfig, JSON.stringify(programOptions.config));
    return true;
};

export const writeLocal = (): boolean => {
    const { config } = programOptions;
    config.remote = false;
    config.shell = '%%cmd%%';
    writeFileSync(LocalConfig, JSON.stringify(programOptions.config));
    return true;
};
