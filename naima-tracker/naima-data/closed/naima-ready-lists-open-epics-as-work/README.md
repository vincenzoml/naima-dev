# naima ready lists open epics as work, though an epic is done by its items and nobody works on it directly

## What happens

In a project with nine epics and fifty open todos linked by `blocked-by`,
`naima ready` printed "23 ready of 56 open": the fourteen todos that really
had nothing left to wait for, and the nine epics. An epic's status follows
its items (setting it by hand is refused), so it is never something an agent
picks up; listed among the ready work it is noise, and it inflates the count.

## Expected

`ready` and `order` list only items that can be worked on: an item of a type
that groups others (an epic) is left out, or shown apart as "epics with ready
work". The count says the same.

## Where

`naima/src/plugins/gates/dependencies.ts`, `readyCommand` and `dependencyOrder`.
