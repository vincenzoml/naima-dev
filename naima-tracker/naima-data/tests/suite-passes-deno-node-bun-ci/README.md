# The suite passes on Deno, Node and Bun in CI

## Gesture

Push to GitHub and read the `ci` workflow run: `deno task verify` on Deno, `node --test "src/**/*.test.ts"` on Node, `bun test ./src/` on Bun.

Pass: the three jobs succeed.

## Result

Not yet performed: the workflow runs on the first push of `.github/workflows/ci.yml`. The same commands pass locally — see the feature's attachments.
