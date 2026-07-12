# Repository setup

The managed implementation environment could read but not update the workspace's `.git` directory, and direct GitHub shell traffic was blocked. The working tree was therefore reconstructed from the connected GitHub repository at `ahcarter/floor3d-card:master`.

To finish normal Git metadata in an unrestricted shell:

```powershell
git clone --branch master https://github.com/ahcarter/floor3d-card.git C:\Users\Andrew\floor3d-card
cd C:\Users\Andrew\floor3d-card
git remote add upstream https://github.com/adizanni/floor3d-card.git
git fetch --all --prune
git rev-list --left-right --count upstream/master...origin/master
```

Keep `origin` writable and treat `upstream` as read-only by convention. Record the divergence count and SHAs in the first implementation commit or PR.

Observed divergence through the GitHub repository integration on 2026-07-11: the fork was **134 commits ahead and 0 behind** `adizanni/master`; merge base `00b911eb8eb258faa4dbe13d64f23d10f0c4dc7a`.
