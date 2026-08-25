# MCP conformance coverage

This report records the official conformance scenarios exercised by MCP Native's current client boundary. It is a feature-level result, not a claim that MCP Native implements every MCP client, server, or authorization-server requirement.

## Pinned baseline

| Item                    | Pin                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol revision       | `2026-07-28`                                                                                                                                    |
| Package                 | `@modelcontextprotocol/conformance@0.2.0-alpha.11`                                                                                              |
| Published source commit | [`c321dd32035556e6769d3724a8ee97d87c3faaac`](https://github.com/modelcontextprotocol/conformance/tree/c321dd32035556e6769d3724a8ee97d87c3faaac) |
| Expected failures       | None                                                                                                                                            |

The package is exact-pinned in `package-lock.json`. The executable manifest in [`tests/conformance/client-scenarios.json`](../tests/conformance/client-scenarios.json) repeats the package version, source commit, protocol revision, and scenario names so a dependency or suite change cannot silently widen the claim.

Run the same gate locally with:

```bash
npm run test:conformance
```

The root `npm run check` command also runs this gate, so pull requests cannot pass CI when a selected scenario fails.

## Selected client scenarios

| Scenario                           | MCP Native behavior exercised                                                                      | Result |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | ------ |
| `tools_call`                       | `tools/list` and `tools/call` through `McpSdkClientAdapter`                                        | Pass   |
| `request-metadata`                 | Per-request version metadata, HTTP version header, client information, and supported-version retry | Pass   |
| `http-standard-headers`            | `Mcp-Method` for supported operations and `Mcp-Name` for tool calls and resource reads             | Pass   |
| `http-custom-headers`              | Valid `x-mcp-header` parameter mirroring, encoding, and null omission                              | Pass   |
| `http-invalid-tool-headers`        | Exclusion of malformed annotated tools without losing a valid sibling                              | Pass   |
| `json-schema-ref-no-deref`         | Tool-schema processing without fetching a network `$ref`                                           | Pass   |
| `json-schema-2020-12-preservation` | Lossless schema round trip through the public adapter boundary                                     | Pass   |

The pinned run reports 51 successful checks, zero failures, and zero warnings across these scenarios.

## Deliberate exclusions and skips

- Client authorization scenarios are deferred until MCP Native implements the protected HTTP authorization milestone.
- `sep-2322-client-request-state` depends on input-required and elicitation behavior outside RFC-0001's current client contract.
- Server and authorization-server scenarios are inapplicable because MCP Native currently ships a client-side adapter and host runtime, not either kind of server.
- The standard-header scenario skips prompt operations and `resources/list`, which are outside the current adapter API. It also skips the legacy `initialize` exchange because `2026-07-28` uses the modern stateless lifecycle.
- The metadata scenario skips optional roots, sampling, and elicitation declarations because the host does not advertise capabilities it does not implement.

These skips must not be converted to claimed support merely because the official SDK exposes a corresponding API. Adding any excluded operation requires public contracts, host behavior, tests, documentation, and the newly applicable official scenarios.

## Updating the pin

Treat a conformance package, source commit, scenario list, or protocol revision change as a reviewed compatibility change:

1. inspect the official release and exact source diff;
2. update the exact dependency and executable manifest together;
3. review newly applicable scenarios and requirement changes;
4. run the full repository check with no hidden expected failures;
5. update this report, the compatibility matrix, and release notes.

The upstream integration contract is documented by the official [MCP conformance repository](https://github.com/modelcontextprotocol/conformance) and its [SDK integration guide](https://github.com/modelcontextprotocol/conformance/blob/c321dd32035556e6769d3724a8ee97d87c3faaac/SDK_INTEGRATION.md).
