# The cross-check runs the standard route and the LTS route and gives a verdict only when both reach the same one; a disagreement is an error

Specification: specs/verifier-mcrl2-lts-route-cross-check, section 6.

Checked by: agreeing holds and violated verdicts give that verdict, the counterexample from the standard route; disagreeing ones give an error beginning 'the routes disagree:'; an error or unknown on either side gives error or unknown with both logs.

Why: the route is trusted on large instances because it agreed with the standard route on small ones; the cross-check is that agreement, recorded.
