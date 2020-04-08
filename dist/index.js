#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const inquirer_1 = __importDefault(require("inquirer"));
const commander_1 = __importDefault(require("commander"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const containers_1 = require("./containers");
const config_1 = require("./config");
const buildQuestions = () => [
    {
        type: 'list',
        name: 'container',
        message: 'Container name:',
        choices: containers_1.containers.map(container => {
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
        when: (answers) => answers.ssl,
    },
    {
        type: 'number',
        name: 'portSSL',
        message: 'Porta do Scheme SSL',
        default: 443,
        when: (answers) => answers.ssl,
    },
    {
        type: 'string',
        name: 'entrypointHttps',
        message: 'Nome do entrypoint do SSL',
        default: 'https',
        when: (answers) => answers.ssl,
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
        when: (answers) => answers.ssl,
    },
    {
        type: 'string',
        name: 'certResolverName',
        message: 'Nome do seu certResolver (ACME)',
        default: 'mySSL',
        when: (answers) => answers.certResolver,
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
        when: (answers) => answers.auth,
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
        name: 'executeOnFinish',
        message: 'Deseja executar ao finalizar?',
        choices: [
            { name: 'Sim', value: true, checked: false },
            { name: 'Não', value: false, checked: true },
        ],
        default: true,
        when: () => !commander_1.default.showCompose,
    },
];
const execute = () => {
    const questions = buildQuestions();
    const { config } = config_1.programOptions;
    inquirer_1.default.prompt(questions).then(answers => {
        // Prepara o ambiente
        const containerInfo = JSON.parse(containers_1.getContainerInfo(answers.container));
        const containerName = containerInfo[0].Spec.Name;
        const containerNameDashed = containerName.replace('_', '-');
        const labels = containers_1.convertLabelsToObject(containerInfo[0].Spec.Labels).filter(f => f.key.match(/traefik/));
        const cmds = [];
        const labelAdd = [];
        const labelCompose = [];
        const labelRm = [];
        const hosts = answers.hosts.split('\n').filter(l => l.length > 0);
        const hostConfig = hosts.reduce((acc, cur, idx) => `${acc}Host(\\\`${cur}\\\`)${idx < hosts.length - 1 ? '||' : ''}`, '');
        const dupadd = (lbl) => {
            labelAdd.push(`--label-add "${lbl}"`);
            labelCompose.push(`- "${lbl}"`);
            return labelAdd.length;
        };
        const duprm = (lbl) => labelRm.push(`--label-rm "${lbl}"`);
        const middlewaresHttp = [];
        const middlewaresHttps = [];
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
            if (answers.certResolver)
                dupadd(`${sRoute}-secure.tls.certresolver=${answers.certResolverName}`);
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
            const encryptedUsers = answers.authUsers
                .split('\n')
                .filter(l => l.trim().length > 0)
                .map(value => {
                const [user, password] = value.split(':');
                dupadd(`traefikConfig.clearPassword.${user}=${password}`);
                return `${user}:${bcryptjs_1.default.hashSync(password).replace(/\$/g, '\\$')}`;
            });
            dupadd(`${sMiddle}-auth.basicauth.users=${encryptedUsers.join(',')}`);
            if (!answers.sslredirect)
                middlewaresHttp.push(`${containerNameDashed}-auth`);
            if (answers.ssl)
                middlewaresHttps.push(`${containerNameDashed}-auth`);
        }
        if (answers.securityPolicy) {
            const dominios = hosts.map(v => `http://${v} https://${v}`).join(' ');
            dupadd(`${sMiddle}-secPolicy.headers.customresponseheaders.Content-Security-Policy=connect-src ${dominios} 'self'`);
            if (answers.ssl)
                middlewaresHttps.push(`${containerNameDashed}-secPolicy`);
            middlewaresHttp.push(`${containerNameDashed}-secPolicy`);
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
        if (!commander_1.default.showCompose) {
            // Exibie as respostas em tela
            const shellCmds = cmds.map(cmd => (config.remote ? config.shell.replace('%%cmd%%', cmd) : cmd)).join('\n');
            console.log(shellCmds);
            if (answers.executeOnFinish) {
                console.log('\n\n# Executing commands...');
                const shell = config.remote
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
                const shellCmd = child_process_1.spawn(shell.shell, shell.args);
                shellCmd.stdout.on('data', data => {
                    dataOut += data.toString();
                });
                shellCmd.stderr.on('data', data => {
                    dataOut += data.toString();
                });
                shellCmd.on('close', code => {
                    if (code !== 0)
                        dataOut += `\n${config.server}: exit with code ${code}`;
                    console.log(`# ${dataOut.split('\n').join('\n# ')}`);
                });
                cmds.forEach(cmd => shellCmd.stdin.write(`${cmd}\n`));
                shellCmd.stdin.end();
            }
        }
    });
};
config_1.loadConfig();
commander_1.default
    .helpOption('-h, --help', 'show options')
    .option('-l, --local', 'execute on local docker')
    .option('-r, --remote <server>', 'execute on remote server')
    .option('-p, --port <port>', 'ssh port on remote server')
    .option('-u, --username <username>', 'ssh username on remote server')
    .option('-n, --no-cache', 'No cache for containers')
    .option('-s, --show-compose', 'output informations as in compose file')
    .option('-f, --filter <containerName>');
commander_1.default.parse(process.argv);
if (commander_1.default.local) {
    config_1.writeLocal();
}
else if (commander_1.default.remote) {
    config_1.writeServer(commander_1.default.remote, commander_1.default.username, commander_1.default.port);
}
config_1.programOptions.noCache = !commander_1.default.cache;
containers_1.loadContainers(commander_1.default.filter);
execute();
