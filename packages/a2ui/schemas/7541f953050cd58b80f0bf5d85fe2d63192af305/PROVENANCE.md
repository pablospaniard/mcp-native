# A2UI schema provenance

| Field | Value |
| --- | --- |
| Upstream | https://github.com/a2ui-project/a2ui |
| Commit | `7541f953050cd58b80f0bf5d85fe2d63192af305` |
| Paths | `specification/v1_0/json/*`, `specification/v1_0/catalogs/basic/catalog.json` |
| Fetched | 2026-08-26 |

These files are an exact pin of the A2UI v1.0 Candidate revision used by MCP Native's project-owned binding (`A2UI_MCP_SCHEMA_REVISION`). `CHECKSUMS.sha256` records every pinned JSON file. `npm run schemas:verify` checks those hashes, rejects untracked JSON, verifies the exported revision, and requires the runtime copies to remain byte-for-byte identical.

Runtime validation embeds copies of `common_types.json`, `agent_to_renderer.json`, `renderer_to_agent.json`, and `catalogs/basic/catalog.json` under `packages/a2ui/src/v1/vendor/` for static import. Do not silently retarget a moving branch; bump the pin, checksums, runtime copies, and documentation through a reviewed protocol change.
