# Native OAuth integration and evidence plan

Status: reference adapters and the evidence gate are implemented. Both required platform rows are
`not-run`; this document does not claim production-ready native OAuth yet.

## Boundary

`@mcp-native/mcp/oauth` owns protocol validation and now includes two dependency-neutral native
integration helpers:

- `createMcpNativeOAuthPlatformSecureStore()` maps the OAuth persistence contract onto five fixed,
  app-namespaced secret slots. Values are bounded, credentials retain their exact issuer, and OAuth
  state operations are serialized across store objects using the same fixed namespace in one JS
  runtime.
- `createMcpNativeOAuthAuthorizationSession()` accepts only `success`, `cancel`, or `dismiss` from an
  app-owned OS authentication-session bridge. It rejects overlapping sessions, callback-location
  substitution, oversized callbacks, malformed results, and callback reuse.

The package deliberately does not import React Native or choose a native dependency. The host must
wire the secret backend to iOS Keychain / Android Keystore-backed encryption and the session opener
to `ASWebAuthenticationSession` / an Android Custom Tab. AsyncStorage, plain files, embedded
application WebViews, remote secret services, and server-derived storage namespaces are outside the
supported profile.

Apple documents `ASWebAuthenticationSession` as the OS authentication flow that returns the
callback only to the calling app. Android recommends Custom Tabs for third-party authentication
instead of a WebView. A tested React Native bridge may be used, but it remains an app dependency and
must be pinned in the evidence record:

- [Apple ASWebAuthenticationSession](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession)
- [Android Custom Tabs](https://developer.android.com/develop/ui/views/layout/webapps/overview-of-android-custom-tabs)
- [react-native-keychain](https://oblador.github.io/react-native-keychain/docs/)
- [react-native-inappbrowser](https://github.com/proyecto26/react-native-inappbrowser)

## Reference React Native wiring

The following app-owned wrapper illustrates the narrow bridge. Keep all native module options
literal and reviewed; do not derive a service name, accessibility option, browser option, or redirect
URL from MCP server data.

```ts
import * as Keychain from "react-native-keychain";
import { InAppBrowser } from "react-native-inappbrowser-reborn";
import {
  createMcpNativeOAuthAuthorizationSession,
  createMcpNativeOAuthPlatformSecureStore,
  createMcpNativeOAuthProvider,
} from "@mcp-native/mcp/oauth";

const redirectUrl = "my-app://oauth/callback";
const username = "mcp-native-oauth";

const storage = createMcpNativeOAuthPlatformSecureStore({
  // App/environment-owned and constant. Never use the server URL or issuer here.
  namespace: "com.example.myapp.production",
  backend: {
    async read(service) {
      const result = await Keychain.getGenericPassword({ service });
      if (result === false) return undefined;
      if (result.username !== username) throw new Error("Unexpected Keychain record owner");
      return result.password;
    },
    async write(service, value) {
      const result = await Keychain.setGenericPassword(username, value, {
        service,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      if (result === false) throw new Error("Keychain write failed");
    },
    async remove(service) {
      await Keychain.resetGenericPassword({ service });
    },
  },
});

const authorizationSession = createMcpNativeOAuthAuthorizationSession({
  redirectUrl,
  async open(authorizationUrl, callbackUrl) {
    const result = await InAppBrowser.openAuth(authorizationUrl.href, callbackUrl.href, {
      ephemeralWebSession: false,
    });
    if (result.type === "success") return { type: "success", url: result.url };
    if (result.type === "cancel") return { type: "cancel" };
    if (result.type === "dismiss") return { type: "dismiss" };
    throw new Error("Unsupported native authentication-session result");
  },
});

const provider = createMcpNativeOAuthProvider({
  serverUrl: "https://mcp.example.com/mcp",
  redirectUrl,
  clientMetadata: { client_name: "My app", redirect_uris: [redirectUrl] },
  storage,
  createState: createCryptographicallyRandomState,
  openAuthorization: authorizationSession.openAuthorization,
});

// After client.connect() yields for interactive authorization:
await authorizationSession.finishAuthorization(provider, transport);
```

`finishAuthorization()` consumes its in-memory callback before token exchange. If the application
process is recreated and receives the registered deep link directly, call
`provider.finishAuthorization(transport, callbackUrl)` instead; durable state, PKCE, and discovery
material remain in the platform store for that recovery path. Both paths enforce the same total,
parameter-count, parameter-name, and parameter-value callback budgets before code redemption. One
provider reserves one interactive attempt before persisting state; a concurrent attempt fails
without replacing the first attempt's state or verifier. The store reservation is exclusive per
namespace, so duplicate providers or store objects sharing one backend cannot overwrite each other's
redirect state. Process recovery makes the same reservation before claiming persisted state. The
claim prevents replay without releasing the slot until verifier cleanup succeeds, so a concurrent
new flow cannot replace the verifier during old-flow token exchange or cleanup. A reported platform
cancellation is fail-closed and clears the pending state and verifier without deleting registrations
or tokens. Call `provider.cancelAuthorization()` only to abandon an attempt after the platform
handoff has settled; it is rejected while state setup, the opener, or callback completion is active
so cleanup cannot race the attempt's state and verifier. Because a namespace is one authorization
context, the live provider owns its reservation: another provider sharing that namespace cannot
cancel the handoff, invalidate all credentials or the verifier, or clear its verifier. The owning
provider also cannot invalidate all credentials or the verifier while setup, handoff, or completion
is active. When the process is recreated and no live owner remains, a new provider may claim and
release the stale reservation without deleting registrations or tokens.

## Required matrix

| Required row             | React Native | Secret backend                        | Authorization UI             |
| ------------------------ | ------------ | ------------------------------------- | ---------------------------- |
| iOS current simulator    | `0.87.1`     | iOS Keychain                          | `ASWebAuthenticationSession` |
| Android current emulator | `0.87.1`     | Android Keystore-backed native module | Android Custom Tab           |

Record the exact OS, device/runtime, native bridge and version, tested commit, operator, date,
artifacts, and issues. A row may declare `pass` only when every required case is `pass`. A bundle or
TypeScript test is not platform evidence.

## Required cases

1. Verify through native tooling or module diagnostics that every fixed service is backed by the
   declared platform secret facility; inspect application storage to ensure no OAuth value appears
   in AsyncStorage, preferences, databases, files, logs, screenshots, or crash output.
2. Save registration, tokens, verifier, state, and discovery data; terminate and relaunch the app;
   confirm the intended values survive and remain schema-valid.
3. Attempt to load credentials under a different issuer and a different app namespace. Both must
   fail without exposing or deleting the valid record.
4. Deliver the same valid-state callback twice concurrently through distinct provider/store objects
   sharing the app namespace. Exactly one exchange may proceed. While that exchange and verifier
   cleanup are active, a new provider must not reserve state or replace the verifier.
5. Invalidate verifier, token, client, discovery, and all scopes; confirm the corresponding native
   records are gone and unrelated issuer records are not removed.
6. Inspect the presented authorization UI and platform hierarchy to prove it is the required OS
   session, not a React Native WebView.
7. Complete authorization and verify the exact registered callback, PKCE exchange, reconnect, and
   issuer-bound token use.
8. Cancel and dismiss the browser. The app must show a safe denied/cancelled state, make no token
   request, and remove pending state and verifier material.
9. Deliver wrong-state, duplicate-parameter, wrong-location, oversized, and replayed callbacks. Each
   must fail before token exchange.
10. Background and resume the app during authorization. Complete once, then repeat with process
    recreation and direct deep-link completion.
11. Inspect application, Metro, native, network-debug, and crash logs for credential, token, PKCE,
    state, callback-code, server-data, and user-data leakage.

## Evidence commands

The checked-in record starts incomplete at `docs/evidence/native-oauth-m6.json`:

```sh
npm run oauth:evidence:check
npm run oauth:evidence:verify
```

The ordinary check validates the exact rows, cases, bounds, and safe evidence references while
allowing `not-run` only for rows that do not claim to pass. Any row marked `pass` must already have
every required case passing. The strict command additionally requires both rows to pass with a full
commit SHA and at least one reviewable artifact. It is part of `npm run release:verify`, so a
Milestone 6 release candidate cannot pass until real platform evidence replaces the placeholders.

Never commit access tokens, refresh tokens, client secrets, authorization codes, PKCE verifiers,
OAuth state, account identifiers, or screenshots/logs containing them as evidence.
