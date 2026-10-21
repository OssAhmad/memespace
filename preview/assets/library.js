const filters = [...document.querySelectorAll("[data-filter]")];
const works = [...document.querySelectorAll("[data-form]")];
const count = document.querySelector("[data-work-count]");

for (const button of filters) {
  button.addEventListener("click", () => {
    const selected = button.dataset.filter;
    for (const filter of filters) {
      filter.setAttribute("aria-pressed", String(filter === button));
    }
    let visible = 0;
    for (const work of works) {
      work.hidden = selected !== "All" && work.dataset.form !== selected;
      if (!work.hidden) visible++;
    }
    count.textContent = `${visible} ${visible === 1 ? "work" : "works"}`;
  });
}

for (const button of document.querySelectorAll("[data-copy-clone]")) {
  button.addEventListener("click", async () => {
    const status = button.parentElement.querySelector("[role='status']");
    try {
      await navigator.clipboard.writeText(button.dataset.copyClone);
      status.textContent = "Clone command copied.";
    } catch {
      status.textContent = "Select and copy the command above.";
    }
  });
}
