import { spawn } from 'child_process';
import Inquirer from 'inquirer';
import program from 'commander';
import { loadContainers, containers, getContainerInfo, convertLabelsToObject } from './containers';
import { loadConfig, programOptions, writeServer, writeLocal } from './config';

interface Answers {
    container: string;
    ssl: boolean;
    sslredirect: boolean;
    port: number;
    hosts: string;
    sticky: boolean;
    priority: number;
    executeOnFinish: boolean;
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
    // TODO: adicionar a opção para colocar usuarios e senhas
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
        const labelRm: string[] = [];
        const hosts = answers.hosts.split('\n').filter(l => l.length > 0);
        const hostConfig = hosts.reduce(
            (acc, cur, idx) => `${acc}Host(\\\`${cur}\\\`)${idx < hosts.length - 1 ? '||' : ''}`,
            '',
        );
        const dupadd = (lbl: string): number => labelAdd.push(`--label-add "${lbl}"`);
        const duprm = (lbl: string): number => labelRm.push(`--label-rm "${lbl}"`);

        // Prepara os comandos
        labels.forEach(v => duprm(v.key));
        dupadd('traefik.enable=true');
        dupadd('traefik.docker.network=proxy');
        dupadd(`traefik.http.services.${containerNameDashed}.loadbalancer.server.port=${answers.port}`);
        if (answers.ssl) {
            dupadd(`traefik.http.routers.${containerNameDashed}-secure.entrypoints=https`);
            dupadd(`traefik.http.routers.${containerNameDashed}-secure.rule=${hostConfig}`);
            dupadd(`traefik.http.routers.${containerNameDashed}-secure.service=${containerNameDashed}`);
            dupadd(`traefik.http.routers.${containerNameDashed}-secure.tls=true`);
            dupadd(`traefik.http.routers.${containerNameDashed}-secure.tls.certresolver=mySSL`);
            dupadd(`traefik.http.routers.${containerNameDashed}-secure.priority=${answers.priority}`);
        }

        dupadd(`traefik.http.routers.${containerNameDashed}.entrypoints=http`);
        dupadd(`traefik.http.routers.${containerNameDashed}.rule=${hostConfig}`);
        dupadd(`traefik.http.routers.${containerNameDashed}.priority=${answers.priority}`);

        if (answers.ssl && answers.sslredirect) {
            dupadd(`traefik.http.routers.${containerNameDashed}.middlewares=${containerNameDashed}-https-redirect`);
            dupadd(`traefik.http.middlewares.${containerNameDashed}-https-redirect.redirectscheme.scheme=https`);
        }

        if (answers.sticky) {
            dupadd(`traefik.http.services.${containerNameDashed}.loadbalancer.sticky=true`);
        }

        // Adiciona o comando das labels
        cmds.push(`docker service update \\\n${labelRm.join(' \\\n')} \\\n${containerName}`);
        cmds.push(`docker service update \\\n${labelAdd.join(' \\\n')} \\\n${containerName}`);

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
