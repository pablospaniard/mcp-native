# Releasing packages

MCP Native publishes with npm trusted publishing. GitHub Actions exchanges its short-lived OIDC
identity for package-specific npm credentials, and npm attaches provenance to the published
artifacts. The repository does not use long-lived npm write tokens.

## Coordinated releases

Before creating a release:

1. Confirm every public package has the same version and that internal dependency ranges target
   that version.
2. Confirm every package has `pablospaniard/mcp-native` and `release.yml` configured as its npm
   trusted publisher, with the `npm-release` environment and `npm publish` allowed.
3. Run `npm run release:verify` and verify the release tag with
   `GITHUB_REF_NAME=v<version> node scripts/verify-release-version.mjs`.
4. Merge the release pull request and publish the matching GitHub Release.

`npm run release:verify` includes the strict native accessibility evidence gate. For `0.4.0` and
later releases, all required rows in `docs/evidence/native-accessibility-0.4.0.json` must pass with
reviewable simulator or emulator evidence as required by the matrix. The `0.4.0` matrix deliberately
requires Android 17 TalkBack emulator coverage and iOS 26.5 XCUITest accessibility inspection. It
does not establish VoiceOver, physical-device, minimum-OS, or previous-React-Native accessibility
coverage; release notes and compatibility claims must preserve those exclusions.

The release workflow publishes packages in dependency order. It first checks whether each exact
version already exists, so an interrupted release can be resumed without attempting to overwrite
immutable npm versions. A maintainer can manually dispatch the same workflow with the existing
release tag to resume publication.

The `npm-release` GitHub environment is a release trust boundary. Configure required reviewers and
allow deployments only from `main` and stable `v*` tags. The workflow resolves a published GitHub
Release to its tag's immutable commit before it installs or executes release-package code.

## Onboarding a new package

npm trusted-publisher configuration is package-specific, and npm requires a package to exist in
the registry before a trusted publisher can be configured. npm does not currently provide an
organization-wide trust rule for future package names.

Before including a new package in a coordinated release:

1. Perform a one-time bootstrap publish interactively with 2FA. Use a non-release version and a
   non-default dist-tag so the bootstrap artifact does not become `latest`.
2. In the new package's npm settings, configure GitHub Actions trusted publishing with:
   - organization or user: `pablospaniard`
   - repository: `mcp-native`
   - workflow filename: `release.yml`
   - environment: `npm-release`
   - allowed action: `npm publish`
3. Disable token-based publishing for the package after verifying the trust configuration.
4. Publish the first real package version only through the coordinated GitHub Release workflow.

This interactive bootstrap is an npm registry limitation, not a recurring release credential.
Every real release remains tokenless, workflow-bound, and provenance-attested.

See npm's documentation for
[trusted publishing](https://docs.npmjs.com/trusted-publishers/) and the
[`npm trust` package-existence requirement](https://docs.npmjs.com/cli/v11/commands/npm-trust/).
