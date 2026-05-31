# Release Versioning

Happy Farm uses one SemVer-compatible release version across Google Play, Apple App Store, and AppsInToss.

## Version Formula

```text
<major>.<github_run_number>.<github_run_attempt>
```

Current major version:

```text
1
```

Example:

```text
1.2672.1
```

This format keeps the SemVer numeric core valid: three non-negative integer identifiers with no leading zeroes.

## Market Mapping

| Target          | Field                         | Value                                                                                                                    |
| --------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Google Play     | `versionName`                 | `1.<GITHUB_RUN_NUMBER>.<GITHUB_RUN_ATTEMPT>`                                                                             |
| Google Play     | `versionCode`                 | Uploads use Play max existing `versionCode + 1`; artifact-only builds use `GITHUB_RUN_NUMBER * 100 + GITHUB_RUN_ATTEMPT` |
| Apple App Store | `CFBundleShortVersionString`  | `1.<GITHUB_RUN_NUMBER>.<GITHUB_RUN_ATTEMPT>`                                                                             |
| Apple App Store | `CFBundleVersion`             | `GITHUB_RUN_NUMBER * 100 + GITHUB_RUN_ATTEMPT`                                                                           |
| AppsInToss      | `.ait` artifact / deploy memo | `v1.<GITHUB_RUN_NUMBER>.<GITHUB_RUN_ATTEMPT>`                                                                            |

`scripts/resolve-release-version.mjs` is the shared source for these computed values.

## Local Check

```bash
RELEASE_MAJOR_VERSION=1 GITHUB_RUN_NUMBER=2672 GITHUB_RUN_ATTEMPT=1 pnpm release:version
```
