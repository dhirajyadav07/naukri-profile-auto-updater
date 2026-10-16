(async function () {
  if (!/naukri\.com\/mnjuser\/profile/i.test(location.href)) return;

  const data = await chrome.storage.local.get({ pendingRun: null });
  if (!data.pendingRun) return;

  const report = async message => {
    try { await chrome.runtime.sendMessage({ type: "PAGE_STATUS", message }); } catch (_) {}
  };
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
  };
  const labelOf = el => [
    el.innerText, el.value, el.getAttribute("aria-label"),
    el.getAttribute("title"), el.getAttribute("data-testid")
  ].filter(Boolean).join(" ").trim().replace(/\s+/g, " ");

  await report("Profile page detected by content script.");
  await wait(1800);

  // Find the profile-name heading, then prefer an edit/pencil control near that heading.
  const nameNode = [...document.querySelectorAll("h1,h2,h3,[role='heading'],div,span")]
    .filter(el => visible(el) && (el.innerText || "").trim().toLowerCase() === "dhiraj kumar")
    .sort((a,b) => (a.innerText || "").length - (b.innerText || "").length)[0];

  const editCandidates = [...document.querySelectorAll("button,[role='button'],a")]
    .filter(el => visible(el) && !el.disabled);

  let editButton = editCandidates.find(el => /\b(edit|update)\b/i.test(labelOf(el)));
  if (!editButton && nameNode) {
    // Nearby edit buttons often sit beside the name heading. Avoid clicking arbitrary page-wide icons.
    const containers = [nameNode.parentElement, nameNode.parentElement?.parentElement, nameNode.parentElement?.parentElement?.parentElement].filter(Boolean);
    for (const container of containers) {
      editButton = [...container.querySelectorAll("button,[role='button'],a")]
        .find(el => visible(el) && (
          /\b(edit|update)\b/i.test(labelOf(el)) ||
          el.querySelector("svg,[class*='edit'],[class*='pencil'],[class*='pen']")
        ));
      if (editButton) break;
    }
  }

  if (!editButton) {
    await report("Could not safely identify the edit/pencil control beside the profile name. No click was made.");
    await chrome.storage.local.remove("pendingRun");
    return;
  }

  editButton.click();
  await report("Clicked the edit/pencil control. Waiting for the basic-details popup.");

  // Wait for a visible Save button to appear after opening the editor.
  let saveButton = null;
  for (let attempt = 0; attempt < 15; attempt++) {
    await wait(700);
    saveButton = [...document.querySelectorAll("button,input[type='submit'],input[type='button'],[role='button']")]
      .find(el => visible(el) && !el.disabled && /^save$/i.test(labelOf(el)));
    if (saveButton) break;
  }

  if (!saveButton) {
    await report("Edit control was clicked, but no visible button labelled exactly 'Save' appeared. Popup may differ; no Save click was made.");
    await chrome.storage.local.remove("pendingRun");
    return;
  }

  saveButton.click();
  await report("Clicked the visible Save button. Waiting to see whether the popup closes or a confirmation appears.");
  await wait(1800);

  const stillVisibleSave = [...document.querySelectorAll("button,input[type='submit'],input[type='button'],[role='button']")]
    .some(el => visible(el) && /^save$/i.test(labelOf(el)));
  const confirmation = [...document.querySelectorAll("body *")]
    .some(el => visible(el) && el.children.length === 0 &&
      /profile updated|updated successfully|saved successfully|successfully updated/i.test((el.innerText || "").trim()));

  if (confirmation) {
    await report("Naukri displayed a success-like confirmation after Save. Verify the profile timestamp to confirm.");
  } else if (!stillVisibleSave) {
    await report("Save button disappeared after click. This may indicate the popup closed, but the site update is not independently confirmed.");
  } else {
    await report("Save was clicked, but no success confirmation was detected. Verify the profile timestamp manually.");
  }
  await chrome.storage.local.remove("pendingRun");
})();
