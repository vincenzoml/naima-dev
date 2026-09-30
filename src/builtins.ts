// The first-party plugins. Every one is always loaded, in this order, with
// defaults it infers from the repository: there is no list to switch them on.
// This file and cli.ts are the composition root: the only modules that see
// both the core and the plugins.

import type { Config, Plugin } from "./core/index.ts"
import betaMarkers from "./plugins/beta-markers/index.ts"
import docs from "./plugins/docs/index.ts"
import coordination from "./plugins/coordination/index.ts"
import gates from "./plugins/gates/index.ts"
import trackers from "./plugins/trackers/index.ts"
import triage from "./plugins/triage/index.ts"
import verifier from "./plugins/verifier/index.ts"

/** Every first-party plugin, for a project with this config. */
export function firstParty(config: Pick<Config, "gates">): Plugin[] {
  return [trackers(), coordination(), triage(), gates({ gates: config.gates }), betaMarkers(), verifier(), docs()]
}
