# SprintDeck Enterprise — Documentation

Reference documentation for SprintDeck Enterprise (V2), the real-time agile-ceremonies
platform served at **https://sprintdeck.in**.

Start here and follow the document that matches what you need to do.

| Document | Read it when you need to |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Understand how the system is put together — components, request flow, hosting |
| [DATA-MODEL.md](DATA-MODEL.md) | Work with Cosmos DB: containers, document shapes, keys, queries |
| [SCOPE.md](SCOPE.md) | Know what the product does, what it deliberately does not do, and who it is for |
| [RELEASES.md](RELEASES.md) | Check the current version, the versioning rules, and what shipped when |
| [OPERATIONS.md](OPERATIONS.md) | Deploy, configure an environment, grant a plan, or work through an incident |
| [SECURITY.md](SECURITY.md) | Review the security posture, known gaps, or report a vulnerability |

Documents outside this folder, kept for continuity:

| Document | Purpose |
|---|---|
| [`../README.md`](../README.md) | Developer setup and local workflow |
| [`../PRD.md`](../PRD.md) | Product direction and requirements |
| [`../CHANGELOG.md`](../CHANGELOG.md) | Dated change log |
| [`../CONTEXT.md`](../CONTEXT.md) | Working context for contributors |

## Conventions

- **Accuracy over completeness.** Every statement here describes code that exists in this
  repository. Where something is planned rather than built, it is marked *Planned*.
- **One owner per document.** Update the document in the same pull request as the change it
  describes; a document that disagrees with the code is a defect.
- **No secrets.** Configuration names appear here; values live in Azure application settings
  and GitHub secrets, never in the repository.

_Last reviewed: 2026-09-21._
