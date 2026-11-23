async function showRelease() {
  try {
    const response = await fetch(new URL("../release.json", window.location.href));
    if (!response.ok) return;
    const release = await response.json();
    if (!release.version || !release.published || !release.url) return;

    document.querySelector("[data-version]").textContent = release.version;
    const publication = document.querySelector("[data-published]");
    publication.dateTime = release.published;
    publication.textContent = new Intl.DateTimeFormat(document.documentElement.lang, {
      dateStyle: "medium",
      timeZone: "UTC",
    }).format(new Date(release.published));

    document.querySelector("[data-release-link]").href = release.url;
    for (const link of document.querySelectorAll("[data-platform]")) {
      const url = release.assets[link.dataset.platform];
      if (url) link.href = url;
    }
    document.querySelector("[data-release]").hidden = false;
  } catch {
    // 静的な GitHub Releases リンクから引き続き取得できる。
  }
}
void showRelease();
