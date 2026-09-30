#!/usr/bin/env node
import { readFileSync } from "node:fs"
import { runCli } from "./core/index.ts"
import { firstParty } from "./builtins.ts"

/** This Naima's version: the package.json beside src/ (or dist/). */
const version = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version

process.exitCode = await runCli(process.argv.slice(2), { cwd: process.cwd(), version, firstParty })
