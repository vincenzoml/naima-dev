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

export type FieldKind = "string" | "strings" | "date" | "enum" | "boolean" | "number"

export interface FieldDef {
  name: string
  kind: FieldKind
  says: string
  /** For `enum`: value -> meaning. Declaration order is rank order. */
  values?: Record<string, string>
  /** Type ids the field belongs to; omitted means every type. */
  appliesTo?: string[]
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
}

export type PluginOptions = Record<string, unknown>
export type PluginFactory = (options: PluginOptions) => Plugin

export interface PluginEntry {
  name: string
  options: PluginOptions
}

/** How a project carries its program: a gitignored clone, plain committed files, or a git submodule. */
export type Carry = "clone" | "vendored" | "submodule"

/** `naima-data/naima.json`: the data format, the lock, and only what the tool cannot infer. */
export interface Config {
  /** The data format (docs/format.md). */
  format: number
  /** The git URL (or path) of the Naima this project runs: Naima's own, or a fork. */
  source: string
  /** The commit of `source` this project runs: the lock. */
  commit: string
  carry: Carry
  /** The program directory, relative to the data directory. */
  program: string
  /** The project's gates, by name; read by the gates plugin. */
  gates: Record<string, unknown>
  /** Third-party plugins to add, as paths inside the program; every first-party plugin is always loaded. */
  plugins: PluginEntry[]
}

export interface Registry {
  plugins: Plugin[]
  types: Map<string, TypeDef>
  fields: Map<string, FieldDef>
  relations: Map<string, RelationDef>
  dirs: Set<string>
  checks: Check[]
  commands: Map<string, Command>
  views: Map<string, View>
  summary: SummarySection[]
  rank: RankTerm[]
  gates: Map<string, GateDef>
  verifiers: Map<string, Verifier>
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
  config: Config
  registry: Registry
  /** The items, read on first access and after `reload()`. */
  readonly repo: Repo
  reload(): void
  out(line?: string): void
  err(line: string): void
  now(): Date
}
