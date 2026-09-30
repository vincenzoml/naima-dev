// The public API of the core. Plugins import from this file and nothing else
// in the core; tests may also import ./testing.ts.

export type * from "./types.ts"
export { bool, type Flags, pairs, parse, type Parsed, positiveInt, str, strs, usageError } from "./args.ts"
export { appliesTo, enumRank, fieldError, type FieldRef, fieldsOf, fieldValue, parseFieldValue, setFieldValue, type ValueOf } from "./fields.ts"
export {
  ATTACHMENTS,
  createItem,
  isUuid,
  listDirs,
  META,
  moveItem,
  README,
  readReadme,
  saveMeta,
  slugify,
  today,
  uniqueSlug,
  writeJson,
  type WriteOptions,
} from "./item.ts"
export { storedLinks } from "./repo.ts"
export { groupBy } from "./collections.ts"
export { EXIT, isInternal, message, NaimaError } from "./errors.ts"
export { isRegularFile, NEVER_SOURCE, walkFiles, writeFileAtomic } from "./files.ts"
export { byUrgency, isEvidenceType, isOpen, label, linked, proves, statusDef, urgency } from "./lifecycle.ts"
export { addLink, renderBoard, setFields, typeOrThrow } from "./base.ts"
export { type CheckReport, runChecks } from "./check.ts"
export {
  type AcrossOptions,
  allRefNames,
  type BranchFile,
  currentBranch,
  filesAt,
  gitPath,
  isGitRepo,
  projectFiles,
  readAcrossBranches,
  refsWorthReading,
  toplevel,
  trunk,
} from "./git.ts"
export { CARRY_MODES, loadPlugins, type Lock, parseConfig, parseLock, programOf, readConfig } from "./config.ts"
export { EXCLUDE_FILES, type Exclusion, exclusions } from "./excludes.ts"
export { FORMAT, formatCheck, formatRefusal, migrate, type Migration, MIGRATIONS } from "./format.ts"
export {
  ABOUT,
  DATA_DIR,
  DATA_FILE,
  DEFAULT_DATA,
  DEFAULT_PROGRAM,
  DIST_BRANCH,
  findData,
  globalOptions,
  HOME,
  PROGRAM_DIR,
  real,
  RELAUNCH,
  TRACKER_DIR,
  TRACKER_README,
  trackerOf,
} from "./layout.ts"
export { consoleIO, createContext, type IO, type Place } from "./context.ts"
export { buildRegistry } from "./registry.ts"
export { cliCommands, type CliOptions, openProject, runCli } from "./cli.ts"
