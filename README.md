# Contributor Issue Context: UI demo

A static design preview of the Contributor Issue Context for Music Blocks
maintainers.

- It uses illustrative example data only (`example-report.json`). Every issue,
  pull request, and person in it is invented.
- It does not fetch live GitHub data. The page loads only `example-report.json`
  from this branch.
- In production, contributor context is not this page: a contributor comments
  `/context` on an open GitHub issue, and a GitHub Action posts or refreshes one
  Issue Context comment on that issue.
- It is informational only. It does not assign or reserve issues, and
  alternative implementations remain welcome.

The production feature is proposed in
[sugarlabs/musicblocks#8999](https://github.com/sugarlabs/musicblocks/pull/8999).
