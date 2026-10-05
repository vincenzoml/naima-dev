# events carry their moment, the timeline orders a day by it, and the diary tells decisions, records and session notes in order (test/plugins/coordination/diary.test.ts, on Deno, Node and Bun)

An event of today records its moment; an earlier day records none unless given
`--at`, which must be of that day. Two events written in reverse order come out
in the order of their moments. `naima diary` prints a decision with the first
paragraph of its reasons, two diary records and a session note in time order,
and leaves out a record of another kind.
