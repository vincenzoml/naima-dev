# A diary: events carry a time, the timeline orders them within a day, and a diary view tells the story

The timeline places events by day only, so events of one day come out in no
particular order: in VoxLogicA-2-clean, five diary events written in sequence on
2026-10-05 were listed with the last one first. A project that keeps a diary --
what happened and why, day after day -- needs the order.

Done:

- `naima event` records the time as well as the date (the time given, or the
  current time); events written before this change keep sorting by day.
- The timeline orders the events of one day by their time.
- `naima diary` prints the diary: events of kind `diary` and session notes, in
  order, as running text, optionally for a range of days.
- Documented, the reference regenerated.

Asked by the owner on 2026-10-05: the history of the project, day by day,
starting from the day the reimplementation of VoxLogicA 2 began.
