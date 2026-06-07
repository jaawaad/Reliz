## **[1.2.0] - 04/22/2026**
- feat: enhance tag prefix resolution for releases

## **[1.1.1] - 03/28/2026**
- chore: update yarn.lock to reflect changes in dependencies and remove unnecessary metadata
- chore: update CI workflow to allow write permissions for contents and add GitHub release creation step
- refactor: improve getLatestTag function to handle unreachable tags and prioritize global tags

## **[1.1.0] - 03/11/2026**
- feat: Improve tag retrieval logic in getLatestTag function to support git-flow
- feat: Enhance release summary output in CLI with formatted details
- fix: Improve error handling for non-fast-forward pushes in gitFlow
- feat: Enhance branch synchronization and error handling in gitFlow

## **[1.0.3] - 02/23/2026**
- chore: remove .pnp.* from .gitignore to streamline ignored files
- chore: update .gitignore, add .pnp.cjs, and yarn.lock for improved dependency management
- fix: env vars RELIZ_YES/RELIZ_NO_GIT_FLOW, pre-release version bump, plugin loading, defaults

## **[1.0.2] - 02/17/2026**
- fix: update getLatestTag and add resolveToCommit function for improved tag resolution
- delete: remove reset-to-first-commit.sh script
- refactor: rename easy-release to reliz and update package scripts
- chore: Update allowReleaseFrom to main in reliz configuration
- chore: Disable gitFlow in reliz configuration
- Remove reset-to-first-commit.sh script, which was used to reset the repository to a single initial commit.
- release: update version to 1.0.1 and changelog
- chore: Update changelog date locale from fa-IR to en-US in reliz configuration
- chore: Enable GitHub releases in reliz configuration
- chore: Update GitHub Actions workflow to trigger on version tag pushes
- Fix: add id-token permission for provenance
- Add GitHub Actions workflow for publishing to npm
- Initial commit: reliz — release automation CLI

## **[1.0.1] - 02/11/2026**
- chore: Update changelog date locale from fa-IR to en-US in reliz configuration
- chore: Enable GitHub releases in reliz configuration
- chore: Update GitHub Actions workflow to trigger on version tag pushes
- Fix: add id-token permission for provenance
- Add GitHub Actions workflow for publishing to npm
- Initial commit: reliz — release automation CLI

