const util = require('util');
const exec = util.promisify(require('child_process').exec);
let projects = [];
let response;
let keepRunning = true;
const start = getCurrentEpochTimestamp();
const NAMESPACE_PREFIX = 'redhat-rhmi-'

monitorDowntime();

async function monitorDowntime() {
  // await getProjects();
  await getProjects();
  await monitorDowntimePerNs();
  // calculateDowntimes(true);
  // writeJSONtoFile();
}

/*
NAMESPACE                       NAME                              REVISION   DESIRED   CURRENT   TRIGGERED BY
redhat-rhmi-3scale              apicast-production                1          2         2         config,image(amp-apicast:latest)
redhat-rhmi-3scale              apicast-staging                   1          2         2         config,image(amp-apicast:latest)
redhat-rhmi-3scale              backend-cron                      1          2         2         config,image(amp-backend:latest)
*/
async function getDcs() {
  try {
    let dcsOutput = await exec(`oc get dc --all-namespaces | awk '{print $1,$2,$4,$5}'`);
    if (!dcsOutput.stdout.toString().toLocaleLowerCase().includes("no resources") && // else - ns is considered down
      dcsOutput.stdout.toString().length !== 0) {
      let outputLines = dcsOutput.stdout.split("\n");
      const [_, ...rest] = outputLines; // remove the heading (NAME READY)
      const dcsLines = rest.filter(e => e !== ''); // remove last empty element
      const dcs = [];
      dcsLines.forEach(line => {
        let splitLines = line.split(/[ ]/);
        if (splitLines.length === 4 && splitLines[0].toString().startsWith(NAMESPACE_PREFIX) && splitLines[2] !== '0') {
          // if (splitLines[1] === splitLines[2]) { // if ready not the same as number of containers - report the pod as not ready
            dcs.push({
              "name": splitLines[1],
              "namespace": splitLines[0],
              "ready": splitLines[3],
              "expected": splitLines[2],
              "downtimes": []
            });
          // }
        }
      });
      return dcs;
    } else {
      return [];
    }
  } catch (error) {
    console.log(`Unable to get deployment configs: ${error}`);
    return [];
  }
  
}

/*
NAMESPACE                                               NAME                                                    READY   UP-TO-DATE   AVAILABLE   AGE
redhat-rhmi-3scale-operator                             3scale-operator                                         1/1     1            1           17h
redhat-rhmi-amq-online                                  address-space-controller                                1/1     1            1           17h
redhat-rhmi-amq-online                                  api-server                                              1/1     1            1           17h
*/
async function getDeployments() {
  try {
    let deploymentsOutput = await exec(`oc get deployment --all-namespaces | awk '{print $1,$2,$3}'`);
    if (!deploymentsOutput.stdout.toString().toLocaleLowerCase().includes("no resources") &&
      deploymentsOutput.stdout.toString().length !== 0) {
      let outputLines = deploymentsOutput.stdout.split("\n");
      const [_, ...rest] = outputLines; // remove the heading (NAME READY)
      const deploymentLines = rest.filter(e => e !== ''); // remove last empty element
      const deployments = [];
      deploymentLines.forEach(line => {
        let splitLines = line.split(/[ ,/]/);
        if (splitLines.length === 4 && splitLines[0].toString().startsWith(NAMESPACE_PREFIX)) {
          // if (splitLines[2] === splitLines[3]) { 
            deployments.push({
              "name": splitLines[1],
              "namespace": splitLines[0],
              "ready": splitLines[2],
              "expected": splitLines[3],
              "downtimes": [] 
            });
          // }
        }
      });
      return deployments;
    } else {
      return [];
    }
  } catch (error) {
    console.log(`Unable to get deployments: ${error}`);
    return [];
  }
}

/*
NAMESPACE                                    NAME                                  READY   AGE
redhat-rhmi-middleware-monitoring-operator   alertmanager-application-monitoring   1/1     17h
redhat-rhmi-middleware-monitoring-operator   prometheus-application-monitoring     1/1     17h
redhat-rhmi-rhsso                            keycloak                              2/2     17h
redhat-rhmi-user-sso                         keycloak                              2/2     17h
*/
async function getStatefulSets() {
  try {
    let statefulSetsOutput = await exec(`oc get statefulset --all-namespaces | awk '{print $1,$2,$3}'`);
    if (!statefulSetsOutput.stdout.toString().toLocaleLowerCase().includes("no resources") &&
    statefulSetsOutput.stdout.toString().length !== 0) {
      let outputLines = statefulSetsOutput.stdout.split("\n");
      const [_, ...rest] = outputLines; // remove the heading (NAME READY)
      const statefulSetLines = rest.filter(e => e !== ''); // remove last empty element
      const statefulSets = [];
      statefulSetLines.forEach(line => {
        let splitLines = line.split(/[ ,/]/);
        if (splitLines.length === 4 && splitLines[0].toString().startsWith(NAMESPACE_PREFIX)) {
          // if (splitLines[2] === splitLines[3]) { 
            statefulSets.push({
              "name": splitLines[1],
              "namespace": splitLines[0],
              "ready": splitLines[2],
              "expected": splitLines[3],
              "downtimes": []
            });
          // }
        }
      });
      return statefulSets;
    } else {
      return [];
    }
  } catch (error) {
    console.log(`Unable to get deployments: ${error}`);
    return [];
  }
}

function calculateDowntimes(completeDowntimes) {
  for (let projIndex = 0; projIndex < projects.length; projIndex++) {
    if (projects[projIndex].downtimes.length !== 0) {
      if (projects[projIndex].downtimes[projects[projIndex].downtimes.length - 1].end === 0) { // if there are some downtimes already and the last downtime does not have 'end' timestamp
        if (completeDowntimes) {
          projects[projIndex].downtimes[projects[projIndex].downtimes.length - 1].end = getCurrentEpochTimestamp();
        }
      }
      projects[projIndex].downtimeInSeconds = getTotalDowntime(projects[projIndex].downtimes);
    }
  }
}

function writeJSONtoFile() {
  process.stdout.write('\nPersisting current JSON data to downtime.json file... ');
  const fs = require('fs');
  const results = {"projects": projects, "start": start, "end": getCurrentEpochTimestamp()};
  fs.writeFile("downtime.json", JSON.stringify(results), function(err) {
    if (err) {
      console.log(err);
    }
  });
}

function getTotalDowntime(downtimes) {
  let downtimeInSeconds = 0;
  try {
    downtimes.forEach(downtime => {
      if (downtime.end !== 0) {
        downtimeInSeconds += (downtime.end - downtime.start);
      }
    });
    return downtimeInSeconds;
  } catch (_) {
    return 0;
  }
}

function findByNameAndNamespace(item, array) {
  try {
    return array.find(
      element => 
        element.name === item.name &&
        element.namespace === item.namespace
      );
  } catch (error) {
    console.log(`Unable to find an item: ${array}` );
    return undefined;
  }
}

function updateDowntime(isDown, namespaceIndex, resourceIndex, resource, timestamp, downtimeIndex) {
  if (isDown) {
    if (keepRunning) {
      switch(resource) {
        case "dc":
          projects[namespaceIndex].dcs[resourceIndex].downtimes.push({"start": timestamp, "end": 0});
          break;
        case "deployment":
          projects[namespaceIndex].deployments[resourceIndex].downtimes.push({"start": timestamp, "end": 0});
          break;
        case "statefulset":
          projects[namespaceIndex].statefulsets[resourceIndex].downtimes.push({"start": timestamp, "end": 0});
          break;
        case "namespace":
          projects[namespaceIndex].downtimes.push({"start": timestamp, "end": 0});
          break;
      }
    }
  } else {
    switch(resource) {
      case "dc":
        projects[namespaceIndex].dcs[resourceIndex].downtimes[downtimeIndex].end = timestamp;
        break;
      case "deployment":
        projects[namespaceIndex].deployments[resourceIndex].downtimes[downtimeIndex].end = timestamp
        break;
      case "statefulset":
        projects[namespaceIndex].statefulsets[resourceIndex].downtimes[downtimeIndex].end = timestamp
        break;
      case "namespace":
        projects[namespaceIndex].downtimes[downtimeIndex].end = timestamp;
        break;
    }
  }
}

async function monitorDowntimePerNs() {
  while (keepRunning) {
    try {
      process.stdout.write(`\nGetting available deployments, dcs and statefulsets... `);
      const currentDcs = await getDcs();
      const currentDeployments = await getDeployments();
      const currentStatefulSets = await getStatefulSets();
      process.stdout.write(`done`);
      const timestamp = getCurrentEpochTimestamp();
      for (let projIndex = 0; projIndex < projects.length; projIndex++) {
        let isNamespaceReady = true;
        if (projects[projIndex].dcs.length > 0) {
          process.stdout.write(`\nChecking readiness of deployment configs in ${projects[projIndex].name} namespace...`);
          for (let dcIndex = 0; dcIndex < projects[projIndex].dcs.length; dcIndex++) {
            const dc = findByNameAndNamespace(projects[projIndex].dcs[dcIndex], currentDcs);
            const downtimesSize = projects[projIndex].dcs[dcIndex].downtimes.length;
            if (dc === undefined || dc.ready === "0") {
              isNamespaceReady = false;
              if (downtimesSize === 0 || projects[projIndex].dcs[dcIndex].downtimes[downtimesSize - 1].end !== 0) {
                updateDowntime(true, projIndex, dcIndex, "dc", timestamp, downtimesSize);
              }
            } else {
              if (downtimesSize !== 0 && projects[projIndex].dcs[dcIndex].downtimes[downtimesSize - 1].end === 0) {
                updateDowntime(false, projIndex, dcIndex, "dc", timestamp, downtimesSize - 1);
              }
            }
          }
        }
        if (projects[projIndex].deployments.length > 0) {
          process.stdout.write(`\nChecking readiness of deployments in ${projects[projIndex].name} namespace...`);
          for (let dIndex = 0; dIndex < projects[projIndex].deployments.length; dIndex++) {
            const deployment = findByNameAndNamespace(projects[projIndex].deployments[dIndex], currentDeployments);
            const downtimesSize = projects[projIndex].deployments[dIndex].downtimes.length;
            if (deployment === undefined || deployment.ready === "0") {
              isNamespaceReady = false;
              if (downtimesSize === 0 || projects[projIndex].deployments[dIndex].downtimes[downtimesSize - 1].end !== 0) {
                updateDowntime(true, projIndex, dIndex, "deployment", timestamp, downtimesSize);
              }
            } else {
              if (downtimesSize !== 0 && projects[projIndex].deployments[dIndex].downtimes[downtimesSize - 1].end === 0) {
                updateDowntime(false, projIndex, dIndex, "deployment", timestamp, downtimesSize - 1);
              }
            }
          }
        }
        if (projects[projIndex].statefulsets.length > 0) {
          process.stdout.write(`\nChecking readiness of statefulsets in ${projects[projIndex].name} namespace...`);
          for (let sIndex = 0; sIndex < projects[projIndex].statefulsets.length; sIndex++) {
            const statefulSet = findByNameAndNamespace(projects[projIndex].statefulsets[sIndex], currentStatefulSets);
            const downtimesSize = projects[projIndex].statefulsets[sIndex].downtimes.length;
            if (statefulSet === undefined || statefulSet.ready === "0") {
              isNamespaceReady = false;
              if (downtimesSize === 0 || projects[projIndex].statefulsets[sIndex].downtimes[downtimesSize - 1].end !== 0) {
                updateDowntime(true, projIndex, sIndex, "statefulset", timestamp, downtimesSize);
              }
            } else {
              if (downtimesSize !== 0 && projects[projIndex].statefulsets[sIndex].downtimes[downtimesSize - 1].end === 0) {
                updateDowntime(false, projIndex, sIndex, "statefulset", timestamp, downtimesSize - 1);
              }
            }
          }
        }
        const downtimesSize = projects[projIndex].downtimes.length;
        if (isNamespaceReady) {
          if (downtimesSize > 0 && projects[projIndex].downtimes[downtimesSize - 1].end === 0) {
            updateDowntime(false, projIndex, -1, "namespace", timestamp, downtimesSize - 1);
          }
        } else {
          if (downtimesSize === 0 || projects[projIndex].downtimes[downtimesSize - 1].end !== 0) {
            updateDowntime(true, projIndex, -1, "namespace", timestamp, downtimesSize - 1);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
    calculateDowntimes(false);
    writeJSONtoFile();
  }
}

async function getProjects() {
  console.log("Getting initial list of RHMI comopnents");
  projects = [];
  response = await exec(`oc get projects -o json | jq '.items[] | select(.metadata.name | startswith(\"${NAMESPACE_PREFIX}\")) |.metadata.name'`); // TODO remove 3scale
  let projectNames = response.stdout.split(/\r?\n/).filter(e => e !== '');
  const dcs = await getDcs();
  const deployments = await getDeployments();
  const statefulsets = await getStatefulSets();
  projectNames.forEach(project => {
    const namespaceName = (project.startsWith('"') && project.endsWith('"')) ? project.slice(1, -1) : project; // remove the quotes (if present)
    projects.push({
      "name": namespaceName,
      "dcs": dcs.filter(dc => dc.namespace === namespaceName),
      "deployments": deployments.filter(d => d.namespace === namespaceName),
      "statefulsets": statefulsets.filter(s => s.namespace === namespaceName),
      "downtimes": [],
      "downtimeInSeconds" : 0});
  });
}

function getCurrentEpochTimestamp() {
  return Math.floor(Date.now() / 1000);
}

process.on('SIGINT', async function() {
  console.log("Caught interrupt signal");
  keepRunning = false;
  calculateDowntimes(true);
  await exec('sleep 10');
  process.exit(0);
});
