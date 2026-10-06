# naima ready lists every stated requirement as work, so in a project with 322 requirements it is unreadable

## What happens

After the requirements analysis of a project filed 322 requirements, `naima
ready` printed "336 ready of 361 open": every requirement still `stated`,
then the fourteen pieces of work. A requirement is not work: it is what the
work is held to, met when a test or property that verifies it passes. Listed
as ready it buries the work, and `order` the same.

## Expected

`ready` and `order` list work only; a type whose items are standards the
work is held to (requirements) is left out, as a group is. A `blocked-by`
pointing at such an item is a note of `naima check`: wait on the work that
delivers or proves it instead.

## Where

`naima/src/plugins/gates/dependencies.ts`; the trait goes on the
requirements type in `naima/src/plugins/planning/index.ts`.
