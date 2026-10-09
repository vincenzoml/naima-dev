# Windows install docs: Deno by hand skips the checksum and adds to PATH on every run; the git advice is a system install

Followed exactly on 2026-10-09 on sleipnir (Windows 11 26100, Italian locale),
over ssh in a non-interactive PowerShell: it works — Deno 2.9.7 in
`%USERPROFILE%\.deno\bin`, `deno --version` answers.

Gaps:
- Deno publishes `deno-x86_64-pc-windows-msvc.zip.sha256sum` beside the zip
  (in `Get-FileHash` output format); the steps never check it (checked by hand:
  it matched). Same for the macOS/Linux steps.
- The User PATH line appends `$BinDir` unconditionally: run twice, it is there
  twice. Guard it (`if ($Path -notlike "*$BinDir*")`).
- Run as a script rather than pasted, it needs `-ExecutionPolicy Bypass`;
  worth one line.
- The root README tells an agent to install git on Windows with `winget
  install Git.Git`, a system install. PortableGit from git-for-windows'
  releases (sha256 in the release metadata), unpacked under the user's home,
  works without administrator rights and matches the "for your user only"
  stance of Deno by hand.
