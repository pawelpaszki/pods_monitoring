const util = require('util');
const exec = util.promisify(require('child_process').exec);
let projects = [];
let response;
let readyPods = [];
const start = getCurrentEpochTimestamp();

monitorDowntime();

async function monitorDowntime() {
  await getProjects();
  await monitorDowntimePerNs();
  await persistResults();
}

async function getPods(namespace) {
  try {
    let podsOutput = await exec(`oc get pods -n ${namespace} | awk '{print $1,$2}'`);
    if (!podsOutput.stdout.toString().toLocaleLowerCase().includes("no resources") && // else - ns is considered down
        podsOutput.stdout.toString().length !== 0) {
      let outputLines = podsOutput.stdout.split("\n");
      const [_, ...rest] = outputLines; // remove the heading (NAME READY)
      const podsLines = rest.filter(e => e !== ''); // remove last empty element
      const pods = [];
      podsLines.forEach(line => {
        let splitLines = line.split(/[ ,/]/);
        if (splitLines.length === 3 && !splitLines[0].toString().includes("registry")) {
          if (splitLines[1] === splitLines[2]) { // if ready not the same as number of containers - report the pod as not ready
            pods.push(podShortName(namespace, splitLines[0])); // pod name
          }
        }
      });
      return pods;
    } else {
      return [];
    }
  } catch (error) {
    console.log(`Unable to get pods for ${namespace} at this time: ${error}`);
    return [];
  }
}

async function persistResults() {
  for (let projIndex = 0; projIndex < projects.length; projIndex++) {
    if (projects[projIndex].downtimes.length !== 0) {
      if (projects[projIndex].downtimes[projects[projIndex].downtimes.length - 1].end === 0) { // if there are some downtimes already and the last downtime does not have 'end' timestamp
        projects[projIndex].downtimes[projects[projIndex].downtimes.length - 1].end = getCurrentEpochTimestamp();
      }
      projects[projIndex].downtimeInSeconds = getTotalDowntime(projects[projIndex].downtimes);
    }
  }
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
      downtimeInSeconds += (downtime.end - downtime.start);
    });
    return downtimeInSeconds;
  } catch (_) {
    return 0;
  }
}

function isSuperset(target, array) {
  return target.every(v => array.includes(v));
}

async function monitorDowntimePerNs() {
  while (process.env.KEEP_RUNNING === "run") {
    for (let projIndex = 0; projIndex < projects.length; projIndex++) {
      process.stdout.write(`\nChecking ready pods for ${projects[projIndex].name}... `);
      readyPods = await getPods(projects[projIndex].name);
      if (isSuperset(projects[projIndex].pods, readyPods)) { // if at least single replica of all required pods is ready for given namespace
        if (projects[projIndex].downtimes.length !== 0 && projects[projIndex].downtimes[projects[projIndex].downtimes.length - 1].end === 0) { // if there are some downtimes already and the last downtime does not have 'end' timestamp
          projects[projIndex].downtimes[projects[projIndex].downtimes.length - 1].end = getCurrentEpochTimestamp();
        }
        process.stdout.write('available');
      } else {
        process.stdout.write(' not fully available');
        if (projects[projIndex].downtimes.length !== 0 && projects[projIndex].downtimes[projects[projIndex].downtimes.length - 1].end !== 0) { // only adding new downtime start timestamp, if there isn't one available
          projects[projIndex].downtimes.push({"start": getCurrentEpochTimestamp(), "end": 0});
        }
      }
    }
  }
}

async function getProjects() {
  console.log("Getting all available RHMI projects' names");
  projects = [];
  response = await exec("oc get projects -o json | jq '.items[] | select(.metadata.name | startswith(\"redhat-rhmi\")) |.metadata.name'"); // TODO remove 3scale
  let projectNames = response.stdout.split(/\r?\n/).filter(e => e !== '');
  projectNames.forEach(project => {
    const namespaceName = (project.startsWith('"') && project.endsWith('"')) ? project.slice(1, -1) : project;
    projects.push({"name": namespaceName, "pods":  [], "downtimes": [], "downtimeInSeconds" : 0}); // slice - remove the quotes
  });
  for (let index = 0; index < projects.length; index++) {
    response = await exec(`oc get pods -o json -n ${projects[index].name} | jq -r .items[].metadata.name`);
    projects[index].pods = filterPods(response.stdout.split(/\r?\n/), projects[index].name);
  }
}

function filterPods(pods, namespace) {
  if (pods.length === 0) {
    return [];
  } else {
    let filteredPods = pods.filter(e => 
      e !== '' && !e.includes("deploy") && !e.includes("registry") && !e.includes("hook-pre") && !e.includes("hook-post")
    );
    let shortNamePods = [];
    filteredPods.forEach(pod => {
      shortNamePods.push(podShortName(namespace, pod));
    });
    const podSet = new Set(shortNamePods);
    return Array.from(podSet);
  }
}

function podShortName(namespace, podName) {
  if (namespace.includes("ups") && !namespace.includes("operator")) {
    return "ups";
  } else if (namespace.includes("3scale") && namespace.includes("operator")) {
    return "3scale-operator";
  } else {
    return podName.substring(0, getFirstInteger(podName) - 1);
  }
}

function getCurrentEpochTimestamp() {
  return Math.floor(Date.now() / 1000);
}

function getFirstInteger(name) {
  return name.toString().match('[0-9]').index;
}

process.on('SIGINT', async function() {
  console.log("Caught interrupt signal");
  await exec('export KEEP_RUNNING=stop');
});
