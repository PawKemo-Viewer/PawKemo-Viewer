const releaseMetadataUrl = new URL("../release.json", document.currentScript.src);

async function showRelease() {
  try {
    const response = await fetch(releaseMetadataUrl);
    if (!response.ok) return;
    const release = await response.json();
    const repository = release.repository_url ?? release.url?.split("/releases/")[0];
    if (repository) {
      for (const link of document.querySelectorAll("[data-repository-path]")) {
        link.href = repository + link.dataset.repositoryPath;
      }
    }
    if (!release.assets || !release.version) return;

    const versionElement = document.querySelector("[data-version]");
    if (versionElement && release.version) versionElement.textContent = release.version;

    const publication = document.querySelector("[data-published]");
    if (publication && release.published) {
      publication.dateTime = release.published;
      publication.textContent = new Intl.DateTimeFormat(document.documentElement.lang, {
        dateStyle: "medium",
        timeZone: "UTC",
      }).format(new Date(release.published));
    }

    const releaseLink = document.querySelector("[data-release-link]");
    if (releaseLink && release.url) releaseLink.href = release.url;

    const releaseBlock = document.querySelector("[data-release]");
    if (releaseBlock) releaseBlock.hidden = false;

    for (const link of document.querySelectorAll("[data-platform]")) {
      const asset = release.assets[link.dataset.platform];
      if (!asset) continue;
      if (asset.url) link.href = asset.url;
      const assetVersion = link.querySelector("[data-asset-version]");
      if (assetVersion && asset.version) assetVersion.textContent = asset.version;
      if (asset.name || asset.version) {
        link.title = [asset.name, asset.version].filter(Boolean).join(" / ");
      }
    }
  } catch {
    // メタデータが取得できなくてもギャラリーは表示できる。
  }
}
void showRelease();
