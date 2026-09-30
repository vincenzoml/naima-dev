// The public API of the core. Plugins import from this file and nothing else
// in the core; tests may also import ./testing.ts.

export type * from "./types.ts"
export { parse, str, strs, bool, pairs, type Flags, type Parsed } from "./args.ts"
export { fieldError, parseFieldValue, fieldsOf, appliesTo, enumRank } from "./fields.ts"
export { slugify, uniqueSlug, isUuid, today, writeJson, readReadme, saveMeta, createItem, moveItem, listDirs, META, README, ATTACHMENTS } from "./item.ts"
export { storedLinks } from "./repo.ts"
export { statusDef, isOpen, proves, isEvidenceType, linked, urgency, byUrgency, label } from "./lifecycle.ts"
export { setFields, addLink, renderBoard, typeOrThrow } from "./base.ts"
export { runChecks, type CheckReport } from "./check.ts"
export { currentBranch, allRefNames, projectFiles, refsWorthReading, readAcrossBranches, isGitRepo, trunk, type BranchFile } from "./git.ts"
export { findRoot, readConfig, parseConfig, loadPlugins, pinRefusal, CONFIG_FILE, NAIMA_DIR } from "./config.ts"
export { satisfies, maxSatisfying, parseVersion, isRange } from "./semver.ts"
export { createContext, consoleIO, type IO } from "./context.ts"
export { buildRegistry } from "./registry.ts"
export { runCli, openProject, cliCommands, type CliOptions } from "./cli.ts"
