# MCP conformance coverage

This report records the passing official conformance scenarios exercised by MCP Native's current
client boundary.

## Pinned baseline

| Item                    | Pin                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Protocol revision       | `2026-07-28`                                                                                                                                                     |
| Package                 | `@modelcontextprotocol/conformance@0.2.0-alpha.11`                                                                                                               |
| Published source commit | [`c321dd32035556e6769d3724a8ee97d87c3faaac`](https://github.com/modelcontextprotocol/conformance/tree/c321dd32035556e6769d3724a8ee97d87c3faaac)                  |
| Requirements fixture    | [`requirements/2026-07-28.yaml`](https://github.com/modelcontextprotocol/conformance/blob/c321dd32035556e6769d3724a8ee97d87c3faaac/requirements/2026-07-28.yaml) |
| Expected failures       | None                                                                                                                                                             |

The package is exact-pinned in `package-lock.json`. The executable manifest in [`tests/conformance/client-scenarios.json`](../tests/conformance/client-scenarios.json) repeats the package version, source commit, protocol revision, requirements fixture, scenario names, and explained exclusions so a dependency or suite change cannot silently widen the claim.

Before running a scenario, the gate parses the frozen official requirements fixture from the pinned package. Every scored client requirement must be selected or match an explicit exclusion with a reason. Selected scenarios may also come from the fixture's `not_scored` client list, which records scenarios added after the scored release baseline. Unknown selections, stale exclusions, or an unaccounted scored requirement fail the gate.

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

These seven non-authorization scenarios report 51 successful checks.

## Authorization scenarios

| Scenarios                                                                                                   | MCP Native behavior exercised                                                         | Result |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------ |
| `auth/metadata-default`, `auth/metadata-var1`, `auth/metadata-var2`, `auth/metadata-var3`                   | Protected-resource and authorization-server metadata discovery variants               | Pass   |
| `auth/basic-cimd`                                                                                           | URL-based client ID metadata document selection without unnecessary DCR               | Pass   |
| `auth/scope-from-www-authenticate`, `auth/scope-from-scopes-supported`, `auth/scope-omitted-when-undefined` | Least-privilege scope source selection and correct omission                           | Pass   |
| `auth/scope-step-up`, `auth/scope-retry-limit`                                                              | Host-approved scope union, reauthorization, and bounded repeated challenges           | Pass   |
| `auth/token-endpoint-auth-basic`, `auth/token-endpoint-auth-post`, `auth/token-endpoint-auth-none`          | Negotiated token-endpoint client authentication modes                                 | Pass   |
| `auth/pre-registration`                                                                                     | Issuer-bound pre-registered credentials when DCR is unavailable                       | Pass   |
| `auth/resource-mismatch`                                                                                    | Rejection of protected-resource substitution before authorization                     | Pass   |
| `auth/offline-access-scope`, `auth/offline-access-not-supported`                                            | Refresh-token metadata and conditional `offline_access` behavior                      | Pass   |
| `auth/authorization-server-migration`                                                                       | Fresh PRM discovery and no client/token credential reuse across authorization servers | Pass   |
| `auth/iss-supported`, `auth/iss-not-advertised`                                                             | Accepted RFC 9207 callback issuer cases                                               | Pass   |
| `auth/iss-supported-missing`, `auth/iss-wrong-issuer`, `auth/iss-unexpected`, `auth/iss-normalized`         | Fail-closed callback issuer validation without URL normalization                      | Pass   |
| `auth/metadata-issuer-mismatch`                                                                             | Rejection of authorization-server metadata with a mismatched issuer                   | Pass   |

All 25 scored authorization client scenarios in the frozen `2026-07-28` requirements fixture now
run through the same executable gate with no expected failures. Together with the seven scenarios
above, the pinned run reports 386 successful checks, zero failures, and zero warnings across 32
selected scenarios. This verifies the package-level protected Streamable HTTP OAuth boundary.
The runnable [Expo Go todo app](../examples/expo-go-todolist/README.md) provides separate
application-level native evidence, while this conformance gate verifies the package-level protocol
boundary.

## Cache-scope isolation

Cache behavior is tested separately from the official wire scenarios by using the official SDK's `InMemoryResponseCacheStore` as a shared store for multiple clients with the same server identity:

- private `tools/list` and `resources/read` entries are partitioned by the host-provided principal cache partition and never cross between principals;
- public entries may be reused by another principal only when the server identity and request key match;
- repeated private reads remain cache hits within the originating principal's partition.

Together these tests verify principal isolation and safe public reuse at the SDK integration
boundary for the supported `tools/list` and `resources/read` operations.

## Updating the pin

Treat a conformance package, source commit, scenario list, or protocol revision change as a reviewed compatibility change:

1. inspect the official release and exact source diff;
2. update the exact dependency and executable manifest together;
3. review newly applicable scenarios and requirement changes;
4. run the full repository check with no hidden expected failures;
5. update this report, the compatibility matrix, and release notes.

The upstream integration contract is documented by the official [MCP conformance repository](https://github.com/modelcontextprotocol/conformance) and its [SDK integration guide](https://github.com/modelcontextprotocol/conformance/blob/c321dd32035556e6769d3724a8ee97d87c3faaac/SDK_INTEGRATION.md).
