"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var child_process_1 = require("child_process");
var inquirer_1 = __importDefault(require("inquirer"));
var commander_1 = __importDefault(require("commander"));
var containers_1 = require("./containers");
var config_1 = require("./config");
var buildQuestions = function () { return [
    {
        type: 'list',
        name: 'container',
        message: 'Container name:',
        choices: containers_1.containers.map(function (container) {
            return {
                name: container.name,
                value: container.id,
            };
        }),
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
    },
    {
        type: 'number',
        name: 'port',
        message: 'Porta do serviço',
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
        name: 'executeOnFinish',
        message: 'Deseja executar ao finalizar?',
        choices: [
            { name: 'Sim', value: true, checked: false },
            { name: 'Não', value: false, checked: true },
        ],
        default: true,
    },
]; };
var execute = function () {
    var questions = buildQuestions();
    var config = config_1.programOptions.config;
    inquirer_1.default.prompt(questions).then(function (answers) {
        // Prepara o ambiente
        var containerInfo = JSON.parse(containers_1.getContainerInfo(answers.container));
        var containerName = containerInfo[0].Spec.Name;
        var containerNameDashed = containerName.replace('_', '-');
        var labels = containers_1.convertLabelsToObject(containerInfo[0].Spec.Labels).filter(function (f) { return f.key.match(/traefik/); });
        var cmds = [];
        var labelAdd = [];
        var labelRm = [];
        var hosts = answers.hosts.split('\n').filter(function (l) { return l.length > 0; });
        var hostConfig = hosts.reduce(function (acc, cur, idx) { return acc + "Host(\\`" + cur + "\\`)" + (idx < hosts.length - 1 ? '||' : ''); }, '');
        var dupadd = function (lbl) { return labelAdd.push("--label-add \"" + lbl + "\""); };
        var duprm = function (lbl) { return labelRm.push("--label-rm \"" + lbl + "\""); };
        // Prepara os comandos
        labels.forEach(function (v) { return duprm(v.key); });
        dupadd('traefik.enable=true');
        dupadd('traefik.docker.network=proxy');
        dupadd("traefik.http.services." + containerNameDashed + ".loadbalancer.server.port=" + answers.port);
        if (answers.ssl) {
            dupadd("traefik.http.routers." + containerNameDashed + "-secure.entrypoints=https");
            dupadd("traefik.http.routers." + containerNameDashed + "-secure.rule=" + hostConfig);
            dupadd("traefik.http.routers." + containerNameDashed + "-secure.service=" + containerNameDashed);
            dupadd("traefik.http.routers." + containerNameDashed + "-secure.tls=true");
            dupadd("traefik.http.routers." + containerNameDashed + "-secure.tls.certresolver=mySSL");
            dupadd("traefik.http.routers." + containerNameDashed + "-secure.priority=" + answers.priority);
        }
        dupadd("traefik.http.routers." + containerNameDashed + ".entrypoints=http");
        dupadd("traefik.http.routers." + containerNameDashed + ".rule=" + hostConfig);
        dupadd("traefik.http.routers." + containerNameDashed + ".priority=" + answers.priority);
        if (answers.ssl && answers.sslredirect) {
            dupadd("traefik.http.routers." + containerNameDashed + ".middlewares=" + containerNameDashed + "-https-redirect");
            dupadd("traefik.http.middlewares." + containerNameDashed + "-https-redirect.redirectscheme.scheme=https");
        }
        if (answers.sticky) {
            dupadd("traefik.http.services." + containerNameDashed + ".loadbalancer.sticky=true");
        }
        // Adiciona o comando das labels
        cmds.push("docker service update \\\n" + labelRm.join(' \\\n') + " \\\n" + containerName);
        cmds.push("docker service update \\\n" + labelAdd.join(' \\\n') + " \\\n" + containerName);
        // Exibie as respostas em tela
        var shellCmds = cmds.map(function (cmd) { return (config.remote ? config.shell.replace('%%cmd%%', cmd) : cmd); }).join('\n');
        console.log(shellCmds);
        if (answers.executeOnFinish) {
            console.log('\n\n# Executing commands...');
            var shell = config.remote
                ? {
                    shell: 'ssh',
                    args: [
                        //   '-t',
                        "-p " + config.port,
                        config.username + "@" + config.server,
                        '/bin/sh',
                    ],
                }
                : { shell: '/bin/sh', args: [] };
            var dataOut_1 = '';
            var shellCmd_1 = child_process_1.spawn(shell.shell, shell.args);
            shellCmd_1.stdout.on('data', function (data) {
                dataOut_1 += data.toString();
            });
            shellCmd_1.stderr.on('data', function (data) {
                dataOut_1 += data.toString();
            });
            shellCmd_1.on('close', function (code) {
                if (code !== 0)
                    dataOut_1 += "\n" + config.server + ": exit with code " + code;
                console.log("# " + dataOut_1.split('\n').join('\n# '));
            });
            cmds.forEach(function (cmd) { return shellCmd_1.stdin.write(cmd + "\n"); });
            shellCmd_1.stdin.end();
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
//# sourceMappingURL=index.js.map