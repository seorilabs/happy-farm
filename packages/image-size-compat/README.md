# image-size compatibility boundary

Granite and Metro still depend on the callable CommonJS API from `image-size`,
whose published releases contain unpatched infinite-loop advisories. pnpm maps
that dependency to this private compatibility package, which delegates parsing
to exact `image-size-next@2.1.1` and preserves the legacy callable export.

The repository security contract exercises malformed ICNS, JXL, and HEIF
headers in a timeout-bounded child process. Remove this package only after the
upstream dependency graph provides an audited release with the same regression
coverage.
