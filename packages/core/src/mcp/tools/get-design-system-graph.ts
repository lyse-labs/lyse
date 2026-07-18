import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { resolve } from "node:path";
import { getProjectContext } from "../context-cache.js";
import type { DesignSystemGraph } from "../../graph/types.js";

export const getDesignSystemGraphTool: Tool = {
  name: "get_design_system_graph",
  description:
    "Return the reified Design System Graph (tokens, components, stories, zones, extraction report) for a project. The machine-consumable surface an agent reads before writing code.",
  inputSchema: {
    type: "object",
    properties: {
      project_root: {
        type: "string",
        description: "Absolute path to the project root to build the graph for.",
      },
    },
    required: ["project_root"],
  },
  outputSchema: {
    type: "object",
    properties: {
      schema_version: { type: "string", const: "1.0.0" },
      graph: { type: "object", description: "The DesignSystemGraph (schemaVersion 1)." },
    },
    required: ["schema_version", "graph"],
  },
};

interface GetGraphInput {
  project_root?: unknown;
}

export async function runGetDesignSystemGraph(
  input: GetGraphInput,
): Promise<{ schema_version: "1.0.0"; graph: DesignSystemGraph }> {
  if (typeof input.project_root !== "string") {
    throw new Error("`project_root` argument is required and must be a string");
  }
  const { graph } = await getProjectContext(resolve(input.project_root));
  return { schema_version: "1.0.0", graph };
}
