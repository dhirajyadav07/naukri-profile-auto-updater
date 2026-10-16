const ALARM_NAME = "naukri-profile-check";
const PROFILE_URL = "https://www.naukri.com/mnjuser/profile";

async function getData() {
  return chrome.storage.local.get({
    enabled: false, intervalHours: 6, autoClickSave: true, activityLog: []
  });
}
async function log(message) {
  const data = await getData();
  const entries = [{ at: new Date().toLocaleString(), message }, ...data.activityLog].slice(0, 60);
  await chrome.storage.local.set({ activityLog: entries, latestStatus: message });
}
async function scheduleAlarm() {
  const data = await getData();
  await chrome.alarms.clear(ALARM_NAME);
  if (data.enabled) {
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: data.intervalHours * 60,
      periodInMinutes: data.intervalHours * 60
    });
    await log(`Schedule enabled every ${data.intervalHours} hour(s); first run after this interval.`);
  } else await log("Schedule disabled.");
}
async function openProfile(active, source) {
  await log(`${source}: starting profile navigation.`);
  try {
    // Create an initial blank tab so pendingRun is stored before content.js can run.
    const tab = await chrome.tabs.create({ url: "about:blank", active });
    const data = await getData();
    await chrome.storage.local.set({
      pendingRun: { requestedAt: Date.now(), autoClickSave: data.autoClickSave },
      lastTabId: tab.id
    });
    await chrome.tabs.update(tab.id, { url: PROFILE_URL });
    await log(`Profile tab created (ID ${tab.id}); navigating to Naukri.`);
    return { ok: true, tabId: tab.id };
  } catch (e) {
    await log(`Failed to open profile: ${e.message}`);
    return { ok: false, error: e.message };
  }
}
chrome.runtime.onInstalled.addListener(async () => {
  await chrome.storage.local.set({ enabled: false, intervalHours: 6, autoClickSave: true, activityLog: [] });
  await log("Extension installed/updated.");
  await scheduleAlarm();
});
chrome.runtime.onStartup.addListener(() => { scheduleAlarm(); });
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url.includes("naukri.com")) {
    await log(`Naukri page loaded: ${tab.url}`);
  }
});
chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name !== ALARM_NAME) return;
  await log("Scheduled run triggered.");
  const result = await openProfile(false, "Scheduled run");
  if (result.ok) chrome.notifications.create({
    type: "basic", title: "Naukri Profile Helper",
    message: "Naukri profile opened. Check the activity log for the edit/save result."
  });
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message.type === "PING") {
      await log("Popup connected to background service worker.");
      sendResponse({ ok: true, message: "Connected." });
    } else if (message.type === "RUN_NOW") {
      sendResponse(await openProfile(true, "Run Now"));
    } else if (message.type === "SAVE_SETTINGS") {
      const hours = Number(message.intervalHours);
      if (![1, 3, 6, 12, 24].includes(hours)) {
        sendResponse({ ok: false, error: "Choose 1, 3, 6, 12, or 24 hours." }); return;
      }
      await chrome.storage.local.set({
        enabled: Boolean(message.enabled), intervalHours: hours,
        autoClickSave: Boolean(message.autoClickSave)
      });
      await scheduleAlarm();
      sendResponse({ ok: true });
    } else if (message.type === "GET_DATA") {
      sendResponse(await getData());
    } else if (message.type === "PAGE_STATUS") {
      await log(message.message);
      sendResponse({ ok: true });
    }
  })().catch(async e => {
    try { await log(`Background error: ${e.message}`); } catch (_) {}
    sendResponse({ ok: false, error: e.message });
  });
  return true;
});
