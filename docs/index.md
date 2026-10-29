# Fileslop documentation

This is the start page of the documentation. Read this page first.
Then open only the document that answers your question. Each index links to more detail.

## Find the right document

| Question                                              | Read                                                |
| ----------------------------------------------------- | --------------------------------------------------- |
| What is Fileslop and why does it exist?               | [README](../README.md)                              |
| How do I run the server or issue tokens?              | [Operations](operations.md#run-the-server)          |
| How do I upload a file with the client?               | [Operations](operations.md#use-the-client)          |
| How do I install the agent skill?                     | [Operations](operations.md#install-the-agent-skill) |
| How do I develop, test or release Fileslop?           | [Operations](operations.md#develop)                 |
| What must the product do?                             | [Product requirements](prds/prds.md)                |
| Which components are there, and why is the design so? | [Architecture](architecture/architecture.md)        |
| What changed in each version?                         | [Changelog](../CHANGELOG.md)                        |
| How do I report a security problem?                   | [Security policy](../SECURITY.md)                   |

## Documents in this folder

- [operations.md](operations.md): procedures to run, use, develop and release Fileslop.
- [prds/](prds/prds.md): product requirements. Each PRD describes one feature area.
- [architecture/](architecture/architecture.md): the component overview and the architecture decision records (ADRs).

## Component documents

- [Server](../server/README.md): the HTTP server that stores and delivers files.
- [Client](../client/README.md): the `fileslop` command line client.
- [Skill](../skills/README.md): the agent skill for uploads and pull request artifacts.

## Rules for this documentation

- Write all text in Simplified Technical English. See [ADR-018](architecture/ADR-018.md).
- When you add a document, add a link to it in the applicable index.
