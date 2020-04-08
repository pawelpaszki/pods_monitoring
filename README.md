# Downtime measure

Downtime measure script for pods from RHMI namespaces

## Prerequisites
You need to be logged in to a cluster to run this script

## Environment variables
If you want to run this script against namespaces not prefixed with `redhat-rhmi`, you need to export the desired namesapces names, e.g.:

```
export NAMESPACES=webapp,user-sso,sso,nexus,mobile-unifiedpush,middleware-monitoring,launcher,fuse,enmasse,codeready,apicurito,3scale
```

## Running the script
**IMPORTANT** this script has to be started while the cluster is fully operational - in order to get all pods for the namespaces that will contribute to the list of expected pods per namespace

Run this script with: 

```
node measure-downtime.js
```

## Stopping the script
To stop the script run:

```
Ctrl + C
```

This will stop the monitoring loop and allow to persist current state of the cluster. After 20 seconds the script will stop completely

## Results
Results will be generated into `downtime.json` file
