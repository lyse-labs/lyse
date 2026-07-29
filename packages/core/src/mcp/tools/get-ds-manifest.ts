import { resolve } from "node:path";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { VERSION } from "../../index.js";
import { buildManifest } from "../../manifest/build.js";
import type { DsManifest } from "../../manifest/types.js";
import { getProjectContext } from "../context-cache.js";

export const getDsManifestTool: Tool = {
  name: "get_ds_manifest",
  description:
    "Return the DS Machine Manifest for a project: the versioned, graph-derived contract " +
    "describing the design system's tokens, component contracts, zone summary and extraction " +
    "status. This is the stable surface to read before writing code (get_design_system_graph " +
    "returns the unstable internal graph instead).",
  inputSchema: {
    type: "object",
    properties: {
      project_root: {
        type: "string",
        description: "Absolute path to the project root",
      },
    },
    required: ["project_root"],
  },
  outputSchema: {
    type: "object",
    properties: {
      manifest: {
        type: "object",
        description: "The DS Machine Manifest (schemaVersion 1)",
      },
    },
    required: ["manifest"],
  },
};

interface GetDsManifestInput {
  project_root?: unknown;
}

export async function runGetDsManifest(
  input: GetDsManifestInput,
): Promise<{ manifest: DsManifest }> {
  if (typeof input.project_root !== "string") {
    throw new Error("`project_root` argument is required and must be a string");
  }
  const { graph } = await getProjectContext(resolve(input.project_root));
  return { manifest: buildManifest(graph, { version: VERSION }) };
}
