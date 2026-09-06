# A2UI schema provenance

| Field | Value |
| --- | --- |
| Upstream | https://github.com/a2ui-project/a2ui |
| Commit | `8ff4651232ab0e02b0123730b502711170637a3a` |
| Paths | `specification/v1_0/json/*`, `specification/v1_0/catalogs/basic/catalog.json` |
| Fetched | 2026-09-06 |

These files are an exact pin of the A2UI v1.0 Candidate revision used by MCP Native's project-owned binding (`A2UI_MCP_SCHEMA_REVISION`). `CHECKSUMS.sha256` records every pinned JSON file. `npm run schemas:verify` checks those hashes, rejects untracked JSON, verifies the exported revision, and requires the runtime copies to remain byte-for-byte identical.

Runtime validation embeds copies of `common_types.json`, `agent_to_renderer.json`, `renderer_to_agent.json`, and `catalogs/basic/catalog.json` under `packages/a2ui/src/v1/vendor/` for static import. Do not silently retarget a moving branch; bump the pin, checksums, runtime copies, and documentation through a reviewed protocol change.

This pin includes upstream PR #2486 (commit `676a8999936b17070195230d396c18d14a22d64d`),
which composes `FunctionCommon` in the `FunctionCall` envelope and flattens the 14 basic catalog
function definitions. All 13 JSON files were verified against Git blob hashes from the complete
upstream tree at this revision; 10 files are byte-identical to the previous pin.
