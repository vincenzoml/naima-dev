// The first-party plugins, by the names a config file uses. This file and
// cli.ts are the composition root: the only modules that see both the core
// and the plugins.

import type { PluginFactory } from "./core/index.ts"
import betaMarkers from "./plugins/beta-markers/index.ts"
import coordination from "./plugins/coordination/index.ts"
import gates from "./plugins/gates/index.ts"
import trackers from "./plugins/trackers/index.ts"
import triage from "./plugins/triage/index.ts"
import verifier from "./plugins/verifier/index.ts"

export const builtins: Record<string, PluginFactory> = {
  trackers,
  coordination,
  triage,
  gates,
  "beta-markers": betaMarkers,
  verifier,
}

export const defaultPlugins = ["trackers", "coordination", "triage", "gates"]
