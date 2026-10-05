# ready lists what waits on nothing open, order respects every wait with its depth, a cycle fails the check (test/plugins/gates/dependencies.test.ts, on Deno, Node and Bun)

Three tests on a plan of five items, one settled: `ready` lists only the item
whose every blocker is settled; `order` places each item after what it waits on,
depth 0 for the first and 2 for the end of the chain; adding a link that closes
a loop makes `naima check` report one problem naming the three items on the
cycle and not the fourth, which only waits on it.
