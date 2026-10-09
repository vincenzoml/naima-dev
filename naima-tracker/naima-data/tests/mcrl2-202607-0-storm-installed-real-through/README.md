# mCRL2 202607.0 and Storm installed for real through the launcher on macOS arm64 into a scratch tools directory, then a property verified with that mCRL2 with PATH stripped

The gesture that proves it, step by step, and what a pass looks like.

## Result

What was seen, when, and by whom.

## Notes

### 2026-10-09 — Claude, on agent/tool-install, on agent/tool-install

Passed, 2026-10-09, macOS arm64, product 4832ee7 through the real launcher in a scratch project (verifier-mcrl2 and storm enabled), NAIMA_TOOLS a scratch directory: naima tools install mcrl2 downloaded the 42971769-byte dmg, sha256 as declared, mounted it (its BSL-1.0 licence prompt answered after the consent), copied mCRL2.app out with ditto, verified 'mcrl22lps mCRL2 toolset 202607.0 (Release)'; naima tools install storm installed CPython 3.13.16 (25246115 bytes, verified 'Python 3.13.16') then stormpy 1.14.0 through pip in hash-checked mode, verified 'stormpy 1.14.0'. With PATH stripped to Deno's folder, /usr/bin and /bin (mCRL2 is otherwise on this machine's PATH through ~/.local/bin), naima runs listed the installed absolute paths and naima verify of '<a>true' on 'act a; init a.delta;' held, toolVersion 'mcrl22lps mCRL2 toolset 202607.0 (Release)'. A first attempt failed with 'Requires read access' on the directory above the tools directory: Deno cannot make a symlink inside the launcher's fence, which copying the app bundle needs; fixed in 4832ee7 by copying with ditto. Not run here: the Linux .deb, the Windows zip, the Linux and x86_64 macOS wheels.
