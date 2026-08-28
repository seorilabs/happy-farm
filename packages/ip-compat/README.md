# ip compatibility boundary

The AppsInToss React Native toolchain still pulls `ip`, whose published
versions misclassify loopback and private-address shorthand as public. pnpm
maps that dependency to this private compatibility package backed by exact
`@bybrave/ip2@3.0.0`.

The repository security contract covers the advisory's shorthand, octal,
IPv4-mapped IPv6, and loopback examples. Remove this package only after the
upstream toolchain no longer depends on vulnerable `ip` releases.
