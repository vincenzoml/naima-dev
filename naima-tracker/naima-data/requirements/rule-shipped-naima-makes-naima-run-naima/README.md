# A rule shipped with Naima makes naima run and naima wait mandatory for long work, and naima check flags hand-written wait loops

Specification: specs/long-work-naima-run-wait-run-list, section 5.

Checked by: in a project with no rules items, `naima rules --audience agents` prints the long-work rule with its acknowledgement phrase; the rules plugin's retire option removes it; `naima check` reports pgrep -f and a while/until loop with sleep in a tracked shell script as a problem, the same in a session note as a note, and nothing for a line marked naima: allow-wait-loop.
