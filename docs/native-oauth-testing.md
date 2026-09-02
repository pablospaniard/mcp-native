# Native OAuth host integration

Status: the package-level reference adapters are implemented. The app-level demonstration track is
open for additional platform evidence.

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

`McpNativeOAuthScopeStore` is a separate bounded persistence seam for non-token scope history. Pass
it as `scopeStore` when reauthorization decisions must compare an exact protected resource and
issuer across provider instances or token invalidation. Treat returned records as untrusted, keep
the storage partition app-owned, and clear it through full credential invalidation/logout. It must
never contain tokens, account data, authorization URLs, or callback values.

`McpNativeOAuthSecureStore` separately persists one pending-authorization record containing only
the exact protected resource, issuer when known, and requested scopes. It is secret-store material
because it is bound to the live state/verifier attempt. Both `verifier` and `all` invalidation must
remove it. A recovery callback may use it when a successful token response omits `scope`; refreshes
outside callback completion must use the previously granted token/scope history instead.

Apple documents `ASWebAuthenticationSession` as the OS authentication flow that returns the
callback only to the calling app. Android recommends Custom Tabs for third-party authentication
instead of a WebView. The reference Expo Go wiring below uses Expo's secure-store and browser
modules; a future demonstration should pin them to its Expo SDK version:

- [Apple ASWebAuthenticationSession](https://developer.apple.com/documentation/authenticationservices/aswebauthenticationsession)
- [Android Custom Tabs](https://developer.android.com/develop/ui/views/layout/webapps/overview-of-android-custom-tabs)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo WebBrowser](https://docs.expo.dev/versions/latest/sdk/webbrowser/)

## Reference Expo Go wiring

The following app-owned wrapper illustrates the narrow bridge. Keep all native module options
literal and reviewed; do not derive a service name, accessibility option, browser option, or redirect
URL from MCP server data.

```ts
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import {
  createMcpNativeOAuthAuthorizationSession,
  createMcpNativeOAuthPlatformSecureStore,
  createMcpNativeOAuthProvider,
} from "@mcp-native/mcp/oauth";

const redirectUrl = Linking.createURL("oauth/callback");

const storage = createMcpNativeOAuthPlatformSecureStore({
  // App/environment-owned and constant. Never use the server URL or issuer here.
  namespace: "com.example.myapp.production",
  backend: {
    async read(service) {
      return (await SecureStore.getItemAsync(service)) ?? undefined;
    },
    async write(service, value) {
      await SecureStore.setItemAsync(service, value);
    },
    async remove(service) {
      await SecureStore.deleteItemAsync(service);
    },
  },
});

const authorizationSession = createMcpNativeOAuthAuthorizationSession({
  redirectUrl,
  async open(authorizationUrl, callbackUrl) {
    const result = await WebBrowser.openAuthSessionAsync(authorizationUrl.href, callbackUrl.href);
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
  scopeStore: durableResourceBoundScopeStore,
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

## Expo Go demonstration scope

An Expo Go app can provide additional integration evidence. Pin the Expo SDK and module versions in
the app and exercise storage persistence and deletion, issuer and namespace
isolation, single-use callback handling, cancellation, malformed callbacks, background/resume, and
credential-safe logging. Keep secrets, authorization codes, PKCE verifiers, OAuth state, account
identifiers, and screenshots or logs containing them out of the repository.

Expo Go uses a development URL whose shape can change between sessions, which is suitable for a
controlled demonstration. For production OAuth redirect registration, use a development or
production build with a stable app-owned scheme or universal/app link and validate the chosen
secure-storage and browser-session modules in that host. Report those app-specific results
alongside the MCP Native package release evidence.
