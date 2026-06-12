# Release Versioning

Happy Farm uses release git tags as the source of truth for Google Play, Apple App Store, and AppsInToss versions.

## Release Tag

Release tags use numeric SemVer:

```text
v<major>.<minor>.<patch>
```

Example:

```text
v1.27.0
```

The deploy workflows ship release-tagged source. If a non-tag build needs to ship, create a release or hotfix tag first.

For AppsInToss manual deploys, run the `Deploy AppsInToss` workflow from the default branch and set `release_tag` to the tag you want to deploy. The workflow file comes from the selected branch, while the app source is checked out from `release_tag`.

## Version Formula

For tag `v<major>.<minor>.<patch>`:

```text
versionName = <major>.<minor>.<patch>
buildNumber = major * 1_000_000 + minor * 1_000 + patch
```

Examples:

| Tag       | versionName | buildNumber |
| --------- | ----------- | ----------- |
| `v1.27.0` | `1.27.0`    | `1027000`   |
| `v1.27.1` | `1.27.1`    | `1027001`   |
| `v1.28.0` | `1.28.0`    | `1028000`   |

`minor` and `patch` must each be below `1000` so the computed build number stays monotonic and compatible with Google Play's `versionCode` integer limit.

## Market Mapping

| Target          | Field                         | Value                                      |
| --------------- | ----------------------------- | ------------------------------------------ |
| Google Play     | `versionName`                 | `<major>.<minor>.<patch>`                  |
| Google Play     | `versionCode`                 | `buildNumber`                              |
| Apple App Store | `CFBundleShortVersionString`  | `<major>.<minor>.<patch>`                  |
| Apple App Store | `CFBundleVersion`             | `buildNumber`                              |
| AppsInToss      | `.ait` artifact / deploy memo | `v<major>.<minor>.<patch>`                 |
| Runtime policy  | release identity              | `releaseTag`, `versionName`, `buildNumber` |

`scripts/resolve-release-version.mjs` is the shared source for these computed values. During deploy it also writes `packages/farm-core/src/releaseInfo.ts`, so the runtime can identify its own release.

## Release Tag Creation

Use the `Create Release Tag` GitHub Actions workflow, or run locally:

```bash
pnpm release:next-tag -- --bump minor
pnpm release:next-tag -- --bump patch
pnpm release:next-tag -- --tag v1.27.1
```

## Local Check

```bash
pnpm release:version -- --tag v1.27.0
```

To generate runtime release info locally:

```bash
pnpm release:version -- --tag v1.27.0 --write-release-info
```
