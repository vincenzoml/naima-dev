#!/usr/bin/env node
import { runCli } from "./core/index.ts"
import { builtins, defaultPlugins } from "./builtins.ts"

process.exitCode = await runCli(process.argv.slice(2), { cwd: process.cwd(), builtins, defaultPlugins })
