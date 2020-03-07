import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { programOptions } from './config';

const LocalCache = process.env.TRAEFIK_LOCAL_CACHE || `${process.env.HOME}/.traefikConfigCache`;

export interface ContainersInfo {
    name: string;
    id: string;
}

export interface ContainerLabels {
    [index: string]: string;
}

export interface ContainerLabelsObject {
    key: string;
    value: string;
}

export const containers: ContainersInfo[] = [];

export const readCacheContainers = (): string => readFileSync(LocalCache).toString();

export const queryContainers = (): string => {
    const result = execSync(
        programOptions.config.shell.replace('%%cmd%%', `docker service ls --format "{{.ID}},{{.Name}}"`),
    ).toString();
    writeFileSync(LocalCache, result);
    return result;
};

export const parseContainers = (data: string): ContainersInfo[] =>
    data
        .split('\n')
        .map<ContainersInfo>(value => {
            const [id, name] = value.split(',');
            return {
                id,
                name,
            };
        })
        .filter(value => typeof value.name !== 'undefined');

export const loadContainers = (filterName: string | undefined): void => {
    containers.push(
        ...parseContainers(
            existsSync(LocalCache) && !programOptions.noCache ? readCacheContainers() : queryContainers(),
        ).filter(v => {
            if (filterName) return v.name.includes(filterName);
            return true;
        }),
    );
};

export const getContainerInfo = (id: string): string =>
    execSync(programOptions.config.shell.replace('%%cmd%%', `docker service inspect ${id}`)).toString();

export const convertLabelsToObject = (labels: ContainerLabels): ContainerLabelsObject[] => {
    return Object.entries(labels).map(([key, value]) => ({
        key,
        value,
    }));
};
