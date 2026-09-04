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
3. Run `npm run release:verify` and verify the stable or prerelease tag with
   `GITHUB_REF_NAME=v<version> node scripts/verify-release-version.mjs`.
4. Merge the release pull request and publish the matching GitHub Release.

`npm run release:verify` covers repository checks, exact version verification, and package smoke
installation. Package smoke verifies every declared export, runtime and declaration source map,
README, and exact MIT license in the packed artifacts. It installs the latest coordinated published
`0.9.x` packages into a clean consumer and runs the documented migration-ready imports. It then
replaces all seven packages with local candidate tarballs through an offline install before running
the consumer again. The maintained Expo Go todo app remains an optional application-level example;
it is not a package release gate.

Use the [`1.0.0` readiness checklist](1.0-readiness.md) to distinguish automated repository checks
from the independent reviews and registry checks required for the stable release. Summarize the
result in the pull request or release. Do not commit raw logs, screenshots, generated applications,
review reports, matrices, or transcripts solely to serve as release evidence.

The release workflow publishes packages in dependency order. Stable versions use the explicit npm
`latest` dist-tag. The recognized `alpha`, `beta`, and `rc` prerelease channels use their matching
tag; every other prerelease uses `next`, so prereleases never replace `latest`. The workflow first
checks whether each exact version already exists, so an interrupted release can be resumed without
attempting to overwrite immutable npm versions. A maintainer can manually dispatch the same
workflow with the existing release tag to resume publication.

The `npm-release` GitHub environment is a release trust boundary. Configure required reviewers and
allow deployments only from `main` and reviewed `v*` release tags. The workflow resolves a
published GitHub Release to its tag's immutable commit before it installs or executes
release-package code.

## Onboarding a new package

npm trusted-publisher configuration is package-specific, and `npm trust` requires the package to
exist in the registry before it can create the relationship.

Before including a new package in a coordinated release:

1. Perform a one-time bootstrap publish interactively with 2FA. Use a non-release version and a
   non-default dist-tag so the bootstrap artifact does not become `latest`.
2. With npm `>=11.15.0`, account-level 2FA, and package write access, configure the exact GitHub
   Actions relationship:

   ```bash
   npm trust github <package-name> \
     --file release.yml \
     --repo pablospaniard/mcp-native \
     --env npm-release \
     --allow-publish
   ```

3. Verify the relationship with `npm trust list <package-name>`. The npm website's package settings
   provide the equivalent management path.
4. Disable token-based publishing for the package after verifying the trust configuration.
5. Publish the first real package version only through the coordinated GitHub Release workflow.

This interactive bootstrap is an npm registry limitation, not a recurring release credential.
Every real release remains tokenless, workflow-bound, and provenance-attested.

See npm's documentation for
[trusted publishing](https://docs.npmjs.com/trusted-publishers/) and the
[`npm trust` package-existence requirement](https://docs.npmjs.com/cli/v11/commands/npm-trust/).
