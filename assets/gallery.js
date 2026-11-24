const controls = document.querySelector(".gallery-controls");
const gallery = document.querySelector("#screen-gallery");

if (controls && gallery) {
  const deviceChoices = controls.querySelectorAll("[data-device-choice]");
  const themeChoices = controls.querySelectorAll("[data-theme-choice]");
  const ua = navigator.userAgent;
  const desktopModeIPad = /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
  const isMobile = desktopModeIPad || navigator.userAgentData?.mobile ||
    /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
  let device = isMobile ? "mobile" : "desktop";
  let theme = "dark";

  function showGallery() {
    const template = document.querySelector(`template[data-gallery-template="${device}"]`);
    if (!template) return;
    const screens = template.content.cloneNode(true);
    if (theme === "light") {
      for (const image of screens.querySelectorAll("img[data-light]")) {
        image.src = image.dataset.light;
        image.closest("a").href = image.dataset.light;
      }
    }
    gallery.dataset.device = device;
    gallery.replaceChildren(screens);
    for (const button of deviceChoices) {
      button.setAttribute("aria-pressed", String(button.dataset.deviceChoice === device));
    }
    for (const button of themeChoices) {
      button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme));
    }
  }

  for (const button of deviceChoices) {
    button.addEventListener("click", () => {
      device = button.dataset.deviceChoice;
      showGallery();
    });
  }
  for (const button of themeChoices) {
    button.addEventListener("click", () => {
      theme = button.dataset.themeChoice;
      showGallery();
    });
  }
  showGallery();
  controls.hidden = false;
}
