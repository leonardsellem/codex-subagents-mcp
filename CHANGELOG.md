# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project adheres to SemVer.

## [0.1.0] - 2025-08-27
### Added
- Minimal MCP server with `delegate` tool for review/debugger/security sub-agents.
- Zod-validated parameters and isolated temp workdir with persona injection.
- Build scripts, linting, tests, and e2e demo script.
- Documentation: README, INTEGRATION, SECURITY, OPERATIONS, ROADMAP.
## [Unreleased]
### Fixed
- `list_agents` now reliably includes custom agents when Codex launches the MCP server from a different CWD by adding a fallback search to `dist/../agents` (alongside the installed binary). This prevents mismatches between `tools.call name=list_agents` and the `agents/` directory contents.
