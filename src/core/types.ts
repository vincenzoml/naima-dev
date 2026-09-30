// The contract. Everything a plugin can contribute, and everything the core
// hands back to it, is declared here and nowhere else.

/** A typed cross-reference. `id` is always a permanent item id, never a slug. */
export interface Link {
  rel: string
  id: string
}

/** A link as read: stored on the item, or implied by the inverse of one stored elsewhere. */
export interface ResolvedLink extends Link {
  implied: boolean
}

/** The fields of an item (`meta.json`). `id`, `title` and `status` are checked on read; unknown fields are preserved untouched. */
export interface Meta {
  id: string
  title: string
  status: string
  links?: Link[]
  [field: string]: unknown
}

/** An item is a directory: `README.md` (prose), `meta.json` (fields), `attachments/`. */
export interface Item {
  type: string
  slug: string
  dir: string
  meta: Meta
}

export type StatusCategory = "open" | "done"

export interface StatusDef {
  category: StatusCategory
  /** A status that counts as evidence for whatever this item `verifies`. */
  proves?: boolean
  says: string
}

export interface TypeDef {
  id: string
  /** Directory under the tracker root that holds this type's items. */
  dir: string
  title: string
  says: string
  statuses: Record<string, StatusDef>
  initialStatus: string
  /** False for archives: items arrive by being moved, never by being opened. */
  creatable?: boolean
  /** The README a new item starts with. */
  template?: (title: string) => string
}

export type FieldKind = "string" | "strings" | "date" | "enum" | "boolean" | "number" | "object"

export interface FieldDef {
  name: string
  kind: FieldKind
  says: string
  /** For `enum`: value -> meaning. Declaration order is rank order. */
  values?: Record<string, string>
  /** Type ids the field belongs to; omitted means every type. */
  appliesTo?: string[]
  /** Its enum `values` come from the project's configuration, not the program: the program's reference does not list them. */
  configured?: boolean
}

export interface RelationDef {
  name: string
  inverse: string
  says: string
}

export interface Finding {
  level: "problem" | "note"
  message: string
  item?: Item
}

export interface Check {
  name: string
  says: string
  run(ctx: Context): Finding[]
}

/** One documented option: a command's `--flag`, or a plugin's configuration key. */
export interface OptionDoc {
  /** `--flag` for a command; the key under `options` for a plugin. */
  name: string
  says: string
  /** The value used when the option is absent, as written in the config or on the command line. */
  default?: string
}

export interface Command {
  name: string
  says: string
  usage: string
  /** Every `--flag` the usage names. */
  options?: OptionDoc[]
  /** Complete invocations, without the leading `naima`. */
  examples?: string[]
  run(args: string[], ctx: Context): number | Promise<number>
}

/** A named rendering of derived state, printed by `naima view <name>`. */
export interface View {
  name: string
  says: string
  render(args: string[], ctx: Context): string[]
}

/** A block of `naima summary`. */
export interface SummarySection {
  name: string
  render(ctx: Context): string[]
}

/** One additive term of an item's urgency. Lower is more urgent. */
export interface RankTerm {
  name: string
  score(item: Item, ctx: Context): number
}

export interface GateResult {
  holds: boolean
  /** What stops the gate. */
  blocking: Item[]
  /** What is still owed but does not stop it. */
  owed: Item[]
}

/** A named release or merge condition, backed by items. */
export interface GateDef {
  name: string
  title: string
  says: string
  /** How `evaluate` decides: what blocks the gate and what is only owed. */
  decides?: string
  /** Declared by the project's configuration, not the program: the program's reference leaves it out. */
  configured?: boolean
  evaluate(ctx: Context): GateResult
}

export interface VerifyRequest {
  /** Absolute path of the model or specification file. */
  model: string
  property: string
  options: Record<string, unknown>
}

export type Verdict = "holds" | "violated" | "error" | "unknown"

export interface VerifyResult {
  verdict: Verdict
  output: string
  counterexample?: string
}

/** An adapter to a formal-methods tool. */
export interface Verifier {
  id: string
  says: string
  verify(request: VerifyRequest, ctx: Context): Promise<VerifyResult>
}

/** What a plugin declares. Every contribution is optional. */
export interface Plugin {
  name: string
  says: string
  /** Longer documentation, in markdown: the concepts a reader needs before the reference. */
  about?: string
  /** The keys the plugin reads from its `options`, each with the default it infers. */
  options?: OptionDoc[]
  types?: TypeDef[]
  fields?: FieldDef[]
  relations?: RelationDef[]
  /** Directories under the tracker root the plugin owns that are not item types. */
  dirs?: string[]
  checks?: Check[]
  commands?: Command[]
  views?: View[]
  summary?: SummarySection[]
  rank?: RankTerm[]
  gates?: GateDef[]
  verifiers?: Verifier[]
  /** Its own data migrations, in order from its format 1: its format is 1 + their number (docs/format.md#migrations). */
  migrations?: Migration[]
}

type Json = Record<string, unknown>

/** One step of a data format: the core's, or one plugin's own. Pure, deterministic, forward only. */
export interface Migration {
  /** The format it reads; it writes `from + 1`. */
  from: number
  says: string
  /** The new naima.json from the old one, without `format` or `formats`. Pure. */
  config?(raw: Json): Json
  /** The new meta.json of one item from the old one. Pure. */
  item?(meta: Json): Json
  /** True when an item still has the shape this migration replaces: `check` reports it. */
  stale?(meta: Json): boolean
}

export type PluginOptions = Record<string, unknown>
/** What a plugin's factory is told of the project it runs in: the name the project gives it, and the names its contributions go by. */
export interface PluginScope {
  readonly plugin: string
  /**
   * The short name this plugin's contribution of `kind`, declared as
   * `declared`, goes by: the project's rename of it, else `declared`. A plugin
   * whose names may be renamed reads its own fields, types and relations by
   * these names, never by the literal it declared.
   */
  name(kind: string, declared: string): string
}

export type PluginFactory = (options: PluginOptions, scope: PluginScope) => Plugin

/** A first-party plugin: its name and its factory, loaded unless the project switches it off or replaces it. */
export interface FirstParty {
  name: string
  factory: PluginFactory
}

/** How much a check's finding weighs in this project: off, a note, or a problem that fails `naima check`. */
export type Severity = "off" | "note" | "problem"

/** One entry of naima.json's `plugins` table: how the project configures the plugin of that name. */
export interface PluginConfig {
  /** False switches the plugin off: it is not loaded. */
  enabled: boolean
  /** The plugin's own options, as it documents them. */
  options: PluginOptions
  /** A third-party plugin's code: a path inside the program. */
  source?: string
  /** A first-party plugin's replacement: the code that runs under its name instead. */
  replacedBy?: string
  /** The severity of the plugin's checks, by check name, as the project weighs them. */
  checks: Record<string, Severity>
}

/** How a project carries its program: a gitignored clone, plain committed files, or a git submodule. */
export type Carry = "clone" | "vendored" | "submodule"

/** `naima-data/naima.json`: the data format, the lock, and only what the tool cannot infer. */
export interface Config {
  /** The data format (docs/format.md). */
  format: number
  /** Each plugin's own data format, by plugin name; a plugin absent from it is at format 1. */
  formats: Record<string, number>
  /** The git URL (or path) of the Naima this project runs: Naima's own, or a fork. */
  source: string
  /** The commit of `source` this project runs: the lock. */
  commit: string
  carry: Carry
  /** The program directory, relative to the data directory. */
  program: string
  /** Every plugin the project configures, first-party or third-party, by name. A first-party plugin it does not name is loaded as it is. */
  plugins: Record<string, PluginConfig>
  /** The project's renames: kind → qualified id → the short name that contribution goes by, for names two plugins would both store. */
  rename: Record<string, Record<string, string>>
}

/** One contribution as the registry holds it: whose it is, the name it goes by, and its qualified id. */
export interface Contribution<T = unknown> {
  /** `<plugin>/<declared name>`: unique among its kind, whatever other plugins declare. */
  readonly id: string
  /** The short name it goes by: its declared name, or the project's rename of it. */
  readonly name: string
  readonly plugin: string
  readonly value: T
}

/**
 * Every loaded contribution, merged. Read-only: frozen once built, so no
 * plugin can change another's. A kind whose names are stored in the data is a
 * map by name; commands and views, which only run, may share a short name,
 * and are then keyed by qualified id — `find` takes either.
 */
export interface Registry {
  readonly plugins: readonly Plugin[]
  readonly types: ReadonlyMap<string, TypeDef>
  readonly fields: ReadonlyMap<string, FieldDef>
  readonly relations: ReadonlyMap<string, RelationDef>
  readonly dirs: ReadonlySet<string>
  readonly checks: readonly Check[]
  /** By the name it is invoked by: its short name, or its qualified id while another plugin's command shares the short name. */
  readonly commands: ReadonlyMap<string, Command>
  /** By the name it is invoked by, as commands are. */
  readonly views: ReadonlyMap<string, View>
  readonly summary: readonly SummarySection[]
  readonly rank: readonly RankTerm[]
  readonly gates: ReadonlyMap<string, GateDef>
  readonly verifiers: ReadonlyMap<string, Verifier>
  /** Every contribution of a kind (`types`, `fields`, `commands`, …), in load order, with its qualified id. */
  contributions(kind: string): readonly Contribution[]
  /** The contribution of `kind` that `ref` names — its qualified id, or its short name while no other shares it; undefined when none does. Throws when `ref` is ambiguous, naming each qualified id. */
  find<T = unknown>(kind: string, ref: string): Contribution<T> | undefined
}

export interface Repo {
  /** Every readable item: a meta.json that is a JSON object whose id, title and status are strings. */
  items: Item[]
  /** Items that could not be read, as findings. */
  unreadable: Finding[]
  byId: Map<string, Item>
  /** Find one item by id, `type/slug`, slug, or a unique slug fragment. Throws when none or several match. */
  resolve(ref: string): Item
  /** Stored links plus the inverses of links pointing here. */
  linksOf(item: Item): ResolvedLink[]
}

export interface Context {
  /** Absolute project root: the git repository that holds the data. */
  root: string
  /** Absolute data directory: `<root>/naima-tracker/naima-data` unless moved. */
  trackerRoot: string
  /** The data directory from the project root, with forward slashes: what paths are printed from. */
  trackerDir: string
  /** Absolute program directory: the Naima that runs. Never part of the project's own files. */
  program: string
  /** Frozen, like the registry. */
  readonly config: Config
  readonly registry: Registry
  /** The items, read on first access, again after any write through the core's helpers, and after `reload()`. */
  readonly repo: Repo
  /** Forget the items read, for a change made on disk without the helpers (by hand, by git). */
  reload(): void
  out(line?: string): void
  err(line: string): void
  now(): Date
}
