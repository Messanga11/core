# ADR 0005: Independent package versions

Status: accepted

Public workspace packages use independent semantic versions managed by Changesets. Internal dependency ranges are updated with patch releases.

Every public API change requires a changeset and migration note. Fixtures are private and unversioned. Releases are published with npm provenance from a protected GitHub environment.
