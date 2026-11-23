const galleryControls = document.querySelector(".gallery-theme");
const galleryImages = Array.from(document.querySelectorAll(".screens img[data-light]"), (image) => ({
  image,
  light: image.dataset.light,
  dark: image.getAttribute("src"),
}));

if (galleryControls && galleryImages.length > 0) {
  const choices = galleryControls.querySelectorAll("[data-theme-choice]");

  for (const choice of choices) {
    choice.addEventListener("click", () => {
      const theme = choice.dataset.themeChoice;
      for (const item of galleryImages) item.image.src = item[theme];
      for (const button of choices) button.setAttribute("aria-pressed", String(button === choice));
    });
  }

  galleryControls.hidden = false;
}
