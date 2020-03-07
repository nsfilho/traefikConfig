# Introduction

This software helps to build a `service labels` on Docker Swarm for Traefik `v2.x` by asking
questions in a interactive way.

-   You can execute locally (on your machine) to run commands remote (via ssh)
-   You can execute only locally (if the machine you are running on is the docker swarm manager)
-   After the first execution, the software generate a local cache of container list

# Installation

```sh
npm install -g git+https://github.com/nsfilho/traefikConfig
```

# Executing

Local execution (if you are running in a swarm manager):

```sh
traefikConfig
```

Remote execution (first time):

```sh
traefikConfig -r server.mydomain.com -p 22 -u root
```

> After you pass this parameters, the software will generate `~/.traefikConfig` file to save this options.

**Tips:** you can pass as `-f <search>` to filter list of containers.
