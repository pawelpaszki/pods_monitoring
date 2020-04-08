# Downtime measure

Downtime measure script for deployments, deployment configs and statefulsets for RHMI namespaces

## Prerequisites
You need to be logged in to a cluster to run this script

## Running the script
**IMPORTANT** this script has to be started while the cluster is fully operational - in order to get all pods for the namespaces that will contribute to the list of expected pods per namespace

Run this script with: 

```
node measure_downtime.js
```

## Stopping the script
To stop the script run:

```
Ctrl + C
```

This will stop the monitoring loop and allow to persist current state of the cluster. After 20 seconds the script will stop completely

## Results
Results will be generated into `downtime.json` file
