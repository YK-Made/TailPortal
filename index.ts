import * as pulumi from "@pulumi/pulumi";
import { LocalWorkspace } from "@pulumi/pulumi/automation";
import * as vultr from "@ediri/vultr";
import dotenv from "dotenv";
import { cloudConfigString } from "./cloud-config";
import { nanoid } from "nanoid"

dotenv.config();

const args = process.argv.slice(2);
let destroy = false;
if (args.length > 0 && args[0]) {
  destroy = args[0] === "destroy";
}

let create = false
if (args.length > 0 && args[0]) {
  create = args[0] === "create";
}

const userData = cloudConfigString.replace(
  /\$TS_AUTH_KEY/,
  process.env.TS_AUTH_KEY!,
);

// const regionsResult = (await fetch("https://api.vultr.com/v2/regions").then(
//   (r) => r.json(),
// )) as { regions: vultr.GetRegionResult[] };

let stack: pulumi.automation.Stack;

let instancesInfo: InstanceInfo[] = [];

type InstanceInfo = {
  name: string;
  id: string;
  hostname: string;
  ip: string;
};
type StackOutput = {
  [key: number]: {
    value: InstanceInfo;
  };
};

function mapStackOutputToArray(output: StackOutput): InstanceInfo[] {
  return Object.values(output).map((v) => v.value);
}

const getProgram = () => async () => {
  const existing = instancesInfo.map((info) => {
    const instance = vultr.Instance.get(info.name, info.id);

    return {
      name: pulumi.Output.create(info.name),
      id: instance.id,
      hostname: instance.hostname,
      mainIp: instance.mainIp,
    };
  });

  const newInstances = []
  // create new ones
  if (create) {
    const name = `vultrInstance-${nanoid(5)}`
    const instance = new vultr.Instance(name, {
      // alpine
      osId: 2136,
      plan: "vc2-1c-1gb",
      region: "sgp",
      backups: "disabled",
      userData,
      activationEmail: false,
      label: "tailportal",
      tags: ["tailportal"],
    });
    newInstances.push({
      name: pulumi.Output.create(name),
      id: instance.id,
      hostname: instance.hostname,
      mainIp: instance.mainIp,
    })
  }

  return [...existing, ...newInstances];
};

async function main() {
  stack = await LocalWorkspace.createOrSelectStack({
    program: getProgram(),
    projectName: "tail-portal",
    stackName: "dev",
  });

  // setup config
  await stack.setConfig("vultr:apiKey", { value: process.env.VULTR_API_KEY! });

  if (destroy) {
    console.info("destroying stack...");
    await stack.destroy({ onOutput: console.info });
    console.info("stack destroy complete");
    process.exit(0);
  }

  // set existing outputs
  instancesInfo = mapStackOutputToArray(await stack.outputs());

  await stack.up({ onOutput: console.log });
}

main().then((err) => console.error(err));
