# v30.3.99 Constitutional Review

## Scope

This release corrects Shared Match code classification and generation without changing Round facts, identity, roles, participation, or scoring capability.

## Principles protected

- **Principles 1, 2, and 5 — Ownership and Round Roles:** changing code generation does not change Owner, Participant, Viewer, or scoring authority.
- **Principles 3, 4, 16, and 18 — Identity separation:** a Match Code remains a locator and is not an Account, Golfer Identity, Device, or Participant key.
- **Principles 6, 7, and 10 — Historical integrity:** existing records are not silently rewritten, migrated, or deleted.
- **Principles 13 and 19 — Round integrity:** code generation does not alter scores, games, settlements, or Round lifecycle facts.

## Security and compatibility boundaries

- New cloud publication continues through the authenticated server-authoritative publication function.
- Canonical codes are collision-checked before use.
- Existing canonical Shared Matches may retain their code during an authorized edit.
- Legacy records remain untouched but their disposable pre-beta codes cannot be joined or silently reused as newly created Shared Matches.
- Local-only scoring remains available without authentication.

## Conclusion

No constitutional conflict was identified. The hotfix improves locator integrity while preserving historical and local-first boundaries.
