#!/usr/bin/env node

import { spawn } from 'child_process';
import Inquirer from 'inquirer';
import program from 'commander';
import bcrypt from 'bcryptjs';
import { loadContainers, containers, getContainerInfo, convertLabelsToObject } from './containers';
import { loadConfig, programOptions, writeServer, writeLocal } from './config';

interface Answers {
    entrypointHttp: string;
    entrypointHttps: string;
    container: string;
    ssl: boolean;
    sslredirect: boolean;
    certResolver: boolean;
    certResolverName: string;
    port: number;
    portSSL: number;
    hosts: string;
    sticky: boolean;
    priority: number;
    executeOnFinish: boolean;
    auth: boolean;
    authUsers: string;
    securityPolicy: boolean;
    cors: boolean;
}

interface ShellConfig {
    shell: string;
    args: string[];
}

const buildQuestions = (): Inquirer.QuestionCollection => [
    {
        type: 'list',
        name: 'container',
        message: 'Container name:',
        choices: containers.map(container => {
            return {
                name: container.name,
                value: container.id,
            };
        }),
    },
    {
        type: 'string',
        name: 'entrypointHttp',
        message: 'Nome do entrypoint http (não ssl)',
        default: 'http',
    },
    {
        type: 'list',
        name: 'ssl',
        message: 'Habilitar SSL',
        choices: [
            { name: 'Sim', value: true, checked: true },
            { name: 'Não', value: false },
        ],
        default: true,
    },
    {
        type: 'list',
        name: 'sslredirect',
        message: 'Redirecionar SSL',
        choices: [
            { name: 'Sim', value: true, checked: true },
            { name: 'Não', value: false },
        ],
        default: true,
        when: (answers: Answers): boolean => answers.ssl,
    },
    {
        type: 'number',
        name: 'portSSL',
        message: 'Porta do Scheme SSL',
        default: 443,
        when: (answers: Answers): boolean => answers.ssl,
    },
    {
        type: 'string',
        name: 'entrypointHttps',
        message: 'Nome do entrypoint do SSL',
        default: 'https',
        when: (answers: Answers): boolean => answers.ssl,
    },
    {
        type: 'list',
        name: 'certResolver',
        message: 'Utiliza certResolver (ACME)',
        default: true,
        choices: [
            { name: 'Sim', value: true, checked: true },
            { name: 'Não', value: false, checked: false },
        ],
        when: (answers: Answers): boolean => answers.ssl,
    },
    {
        type: 'string',
        name: 'certResolverName',
        message: 'Nome do seu certResolver (ACME)',
        default: 'mySSL',
        when: (answers: Answers): boolean => answers.certResolver,
    },
    {
        type: 'number',
        name: 'port',
        message: 'Porta do serviço na container',
        default: 80,
    },
    {
        type: 'list',
        name: 'sticky',
        message: 'Deseja habilitar o sticker no Load Balance?',
        choices: [
            { name: 'Sim', value: true, checked: false },
            { name: 'Não', value: false, checked: true },
        ],
        default: false,
    },
    {
        type: 'number',
        name: 'priority',
        message: 'Qual a prioridade?',
        default: 0,
    },
    {
        type: 'editor',
        name: 'hosts',
        message: 'Digite os hosts (um por linha)',
        default: '',
    },
    {
        type: 'list',
        name: 'auth',
        message: 'Deseja habilitar autenticação (basic)',
        choices: [
            { name: 'Sim', value: true, checked: false },
            { name: 'Não', value: false, checked: true },
        ],
        default: false,
    },
    {
        type: 'editor',
        name: 'authUsers',
        message: 'Digite em cada linha <usuario>:<senha>',
        default: 'admin:password',
        when: (answers: Answers): boolean => answers.auth,
    },
    {
        type: 'list',
        name: 'securityPolicy',
        message: 'Deseja habilitar uma custom Security-Policy',
        default: false,
        choices: [
            { name: 'Sim', value: true, checked: false },
            { name: 'Não', value: false, checked: true },
        ],
    },
    {
        type: 'list',
        name: 'cors',
        message: 'Deseja habilitar Access-Control-Allow-Origin',
        default: false,
        choices: [
            { name: 'Sim', value: true, checked: false },
            { name: 'Não', value: false, checked: true },
        ],
    },
    {
        type: 'list',
        name: 'executeOnFinish',
        message: 'Deseja executar ao finalizar?',
        choices: [
            { name: 'Sim', value: true, checked: false },
            { name: 'Não', value: false, checked: true },
        ],
        default: true,
        when: (): boolean => !program.showCompose,
    },
];

const execute = (): void => {
    const questions = buildQuestions();
    const { config } = programOptions;
    Inquirer.prompt<Answers>(questions).then(answers => {
        // Prepara o ambiente
        const containerInfo = JSON.parse(getContainerInfo(answers.container));
        const containerName = containerInfo[0].Spec.Name;
        const containerNameDashed = containerName.replace('_', '-');
        const labels = convertLabelsToObject(containerInfo[0].Spec.Labels).filter(f => f.key.match(/traefik/));
        const cmds: string[] = [];
        const labelAdd: string[] = [];
        const labelCompose: string[] = [];
        const labelRm: string[] = [];
        const hosts = answers.hosts.split('\n').filter(l => l.length > 0);
        const hostConfig = hosts.reduce(
            (acc, cur, idx) => `${acc}Host(\\\`${cur}\\\`)${idx < hosts.length - 1 ? '||' : ''}`,
            '',
        );
        const dupadd = (lbl: string): number => {
            const composeFmt = lbl.replace(/\\`/g, '`').replace(/\\\$/g, '$$');
            labelAdd.push(`--label-add "${lbl}"`);
            labelCompose.push(`- "${composeFmt}"`);
            return labelAdd.length;
        };
        const duprm = (lbl: string): number => labelRm.push(`--label-rm "${lbl}"`);

        const middlewaresHttp: string[] = [];
        const middlewaresHttps: string[] = [];

        const sMiddle = `traefik.http.middlewares.${containerNameDashed}`;
        const sRoute = `traefik.http.routers.${containerNameDashed}`;

        // Prepara os comandos
        labels.forEach(v => duprm(v.key));
        dupadd('traefik.enable=true');
        dupadd('traefik.docker.network=proxy');
        dupadd(`traefik.http.services.${containerNameDashed}.loadbalancer.server.port=${answers.port}`);
        if (answers.ssl) {
            dupadd(`${sRoute}-secure.entrypoints=${answers.entrypointHttps}`);
            dupadd(`${sRoute}-secure.rule=${hostConfig}`);
            dupadd(`${sRoute}-secure.service=${containerNameDashed}`);
            dupadd(`${sRoute}-secure.tls=true`);
            if (answers.certResolver) dupadd(`${sRoute}-secure.tls.certresolver=${answers.certResolverName}`);
            dupadd(`${sRoute}-secure.priority=${answers.priority}`);
        }

        dupadd(`${sRoute}.entrypoints=${answers.entrypointHttp}`);
        dupadd(`${sRoute}.rule=${hostConfig}`);
        dupadd(`${sRoute}.priority=${answers.priority}`);

        if (answers.ssl && answers.sslredirect) {
            middlewaresHttp.push(`${containerNameDashed}-https-redirect`);
            dupadd(`${sMiddle}-https-redirect.redirectscheme.scheme=https`);
            dupadd(`${sMiddle}-https-redirect.redirectscheme.port=${answers.portSSL}`);
        }

        if (answers.sticky) {
            dupadd(`traefik.http.services.${containerNameDashed}.loadbalancer.sticky=true`);
        }

        if (answers.auth) {
            const encryptedUsers: string[] = answers.authUsers
                .split('\n')
                .filter(l => l.trim().length > 0)
                .map(value => {
                    const [user, password] = value.split(':');
                    dupadd(`traefikConfig.clearPassword.${user}=${password}`);
                    return `${user}:${bcrypt.hashSync(password).replace(/\$/g, '\\$')}`;
                });
            dupadd(`${sMiddle}-auth.basicauth.users=${encryptedUsers.join(',')}`);
            if (!answers.sslredirect) middlewaresHttp.push(`${containerNameDashed}-auth`);
            if (answers.ssl) middlewaresHttps.push(`${containerNameDashed}-auth`);
        }

        if (answers.securityPolicy) {
            const dominios = hosts.map(v => `http://${v} https://${v}`).join(' ');
            dupadd(
                `${sMiddle}-secPolicy.headers.customresponseheaders.Content-Security-Policy=connect-src ${dominios} 'self'`,
            );
            if (answers.ssl) middlewaresHttps.push(`${containerNameDashed}-secPolicy`);
            middlewaresHttp.push(`${containerNameDashed}-secPolicy`);
        }

        if (answers.cors) {
            dupadd(`${sMiddle}-cors.headers.customresponseheaders.Access-Control-Allow-Origin=*`);
            if (answers.ssl) middlewaresHttps.push(`${containerNameDashed}-cors`);
            middlewaresHttp.push(`${containerNameDashed}-cors`);
        }

        if (middlewaresHttp.length > 0) {
            dupadd(`${sMiddle}-chain.chain.middlewares=${middlewaresHttp.join(',')}`);
            dupadd(`${sRoute}.middlewares=${containerNameDashed}-chain`);
        }
        if (middlewaresHttps.length > 0) {
            dupadd(`${sMiddle}-secure-chain.chain.middlewares=${middlewaresHttps.join(',')}`);
            dupadd(`${sRoute}-secure.middlewares=${containerNameDashed}-secure-chain`);
        }

        // Adiciona o comando das labels
        cmds.push(`docker service update \\\n${labelRm.join(' \\\n')} \\\n${containerName}`);
        cmds.push(`docker service update \\\n${labelAdd.join(' \\\n')} \\\n${containerName}`);

        console.log('# Showing in a compose format and as shell comments');
        labelCompose.forEach(lbl => console.log(lbl));

        if (!program.showCompose) {
            // Exibie as respostas em tela
            const shellCmds = cmds.map(cmd => (config.remote ? config.shell.replace('%%cmd%%', cmd) : cmd)).join('\n');
            console.log(shellCmds);

            if (answers.executeOnFinish) {
                console.log('\n\n# Executing commands...');
                const shell: ShellConfig = config.remote
                    ? {
                          shell: 'ssh',
                          args: [
                              //   '-t',
                              `-p ${config.port}`,
                              `${config.username}@${config.server}`,
                              '/bin/sh',
                          ],
                      }
                    : { shell: '/bin/sh', args: [] };

                let dataOut = '';
                const shellCmd = spawn(shell.shell, shell.args);
                shellCmd.stdout.on('data', data => {
                    dataOut += data.toString();
                });
                shellCmd.stderr.on('data', data => {
                    dataOut += data.toString();
                });
                shellCmd.on('close', code => {
                    if (code !== 0) dataOut += `\n${config.server}: exit with code ${code}`;
                    console.log(`# ${dataOut.split('\n').join('\n# ')}`);
                });
                cmds.forEach(cmd => shellCmd.stdin.write(`${cmd}\n`));
                shellCmd.stdin.end();
            }
        }
    });
};

loadConfig();
program
    .helpOption('-h, --help', 'show options')
    .option('-l, --local', 'execute on local docker')
    .option('-r, --remote <server>', 'execute on remote server')
    .option('-p, --port <port>', 'ssh port on remote server')
    .option('-u, --username <username>', 'ssh username on remote server')
    .option('-n, --no-cache', 'No cache for containers')
    .option('-s, --show-compose', 'output informations as in compose file')
    .option('-f, --filter <containerName>');

program.parse(process.argv);

if (program.local) {
    writeLocal();
} else if (program.remote) {
    writeServer(program.remote, program.username, program.port);
}
programOptions.noCache = !program.cache;

loadContainers(program.filter);
execute();
