"use client";

import { InventoryItem, StockMovement } from "./types";
import { movementsToUsageRows, weeklyUsageTotals, UsageSheetRow } from "./usageReport";

// Client-side Google Sheets sync using Google Identity Services (GIS) for
// auth, plus the Google Picker API for letting the customer browse and pick
// one of their *existing* spreadsheets (rather than the app only ever being
// able to create/read a sheet it made itself).
// Mirrors the ISC app's model: each customer connects *their own* Google
// account and *their own* spreadsheet — we never see or store their
// spreadsheet data on our server, it round-trips straight from their
// browser to Google's API using a token scoped only to Sheets + the files
// they explicitly pick (see the drive.file scope note below).
//
// Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID to be set (see README). That
// client ID is a public identifier (safe to ship to the browser), but it
// must have this app's deployed origin listed under "Authorized JavaScript
// origins" in Google Cloud Console > Credentials, or Google will refuse
// the sign-in popup.
//
// The "browse my Drive and pick a sheet" picker additionally requires
// NEXT_PUBLIC_GOOGLE_API_KEY (a separate Google API key, with the "Google
// Picker API" enabled on the same Cloud project — see README). Without it,
// the picker is skipped and the app falls back to its original
// create-a-new-sheet-on-connect / re-import-from-the-linked-sheet behavior,
// so this degrades gracefully rather than breaking for deployments that
// haven't set it up yet.

const SHEET_RANGE = "Inventory!A1:G";
const HEADER_ROW = ["Barcode", "Name", "Quantity", "Unit", "Price Per Unit", "Reorder At", "Location"];

// The Usage tab lives in the same spreadsheet, laid out as two side-by-side
// blocks on one sheet (rather than two separate tabs) so the chart's source
// range and the detail table can be written in a single values.batchUpdate
// call: A:G is the re-importable detail table (same shape as
// downloadUsageTemplate's format, plus Item Name/Type/Note for context,
// plus a Sync ID column), H:I is a compact weekly-total table that exists
// purely to feed the chart.
//
// Sync ID (column G) is what makes pullUsageFromSheet below possible: it's
// each row's source StockMovement id, written on every push. A customer
// can edit or delete a row in their sheet and have that edit or deletion
// reconciled back to the exact movement it came from on the next pull,
// rather than a pull only ever being able to append new rows blindly. It's
// plain, visible text rather than a hidden column — deliberately, so nothing
// about the sheet looks broken if a customer notices it, though editing it
// by hand isn't part of the documented workflow.
const USAGE_SHEET_TITLE = "Usage";
const USAGE_DETAIL_RANGE = `${USAGE_SHEET_TITLE}!A1:G`;
const USAGE_DETAIL_HEADER = ["Barcode", "Item Name", "Date", "Quantity Used", "Type", "Note", "Sync ID"];
const USAGE_SUMMARY_RANGE = `${USAGE_SHEET_TITLE}!H1:I`;
const USAGE_SUMMARY_HEADER = ["Week Starting", "Total Units Used"];
const USAGE_SUMMARY_COLUMN_INDEX = { start: 7, end: 9 }; // H, I (0-based, end exclusive)

// A hidden utility sheet holding nothing but a sync token (see
// getRemoteSyncToken/setRemoteSyncToken) — kept off the visible Usage/
// Inventory tabs entirely rather than tucked in a spare cell on one of
// them, so it can never collide with either tab's real columns or the
// Usage chart's anchor position.
const SYNC_META_SHEET_TITLE = "_sync";
const SYNC_TOKEN_RANGE = `${SYNC_META_SHEET_TITLE}!A1`;

// drive.file (not the broader drive.readonly) is deliberate: it only grants
// this app access to files the customer explicitly selects through the
// Picker UI, not blanket read access to their whole Drive. The Picker's own
// browsing view can still show all of the customer's spreadsheets to choose
// from — that browsing happens under Google's own picker permission, not
// this app's OAuth scope — so drive.file is both the more private option
// and enough to fulfill "let me pick from my existing sheets."
//
// userinfo.email is the newest addition: it's what lets the app silently
// check "does the email on this Google account match an email you booked a
// visit with" right after connect, so a matching customer gets the
// minimal status tab without having to type their email a second time. It
// only ever reveals the address of the account the customer is already
// signing into — nothing about their Drive/Sheets access changes because
// of it.
const OAUTH_SCOPE =
  "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email";

declare global {
  interface Window {
    google?: any;
    gapi?: any;
  }
}

let gisLoaded: Promise<void> | null = null;
let pickerApiLoaded: Promise<void> | null = null;
let cachedToken: { token: string; expiresAt: number } | null = null;

function loadGis(): Promise<void> {
  if (gisLoaded) return gisLoaded;
  gisLoaded = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    if (window.google?.accounts?.oauth2) return resolve();
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
  return gisLoaded;
}

// Loads the classic Google API loader (gapi) and its "picker" module. This
// is a separate script/library from GIS above — GIS handles sign-in/tokens,
// gapi.picker renders the actual file-browser popup.
function loadPickerApi(): Promise<void> {
  if (pickerApiLoaded) return pickerApiLoaded;
  pickerApiLoaded = new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    const onGapiReady = () => {
      window.gapi.load("picker", { callback: () => resolve(), onerror: () => reject(new Error("Failed to load Google Picker")) });
    };
    if (window.gapi?.load) return onGapiReady();
    const script = document.createElement("script");
    script.src = "https://apis.google.com/js/api.js";
    script.async = true;
    script.defer = true;
    script.onload = onGapiReady;
    script.onerror = () => reject(new Error("Failed to load Google API loader"));
    document.head.appendChild(script);
  });
  return pickerApiLoaded;
}

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
}

// Separate from isGoogleSheetsConfigured — sign-in works without this, it
// just means the "pick an existing sheet" picker isn't available yet and
// callers should fall back to the original single-sheet behavior.
export function isPickerConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_API_KEY);
}

export async function requestAccessToken(forcePrompt = false): Promise<string> {
  if (!forcePrompt && cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error(
      "Google Sheets isn't configured yet. Set NEXT_PUBLIC_GOOGLE_CLIENT_ID in your environment (see README)."
    );
  }
  await loadGis();

  return new Promise((resolve, reject) => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: OAUTH_SCOPE,
      callback: (resp: any) => {
        if (resp.error) {
          reject(new Error(resp.error));
          return;
        }
        cachedToken = {
          token: resp.access_token,
          expiresAt: Date.now() + Number(resp.expires_in ?? 3500) * 1000,
        };
        resolve(resp.access_token);
      },
    });
    tokenClient.requestAccessToken({ prompt: forcePrompt ? "consent" : "" });
  });
}

export function signOutGoogle(): void {
  cachedToken = null;
}

// Best-effort lookup of the signed-in Google account's email, used only to
// silently check for a matching booking (see AccountTab's connectGoogle).
// Returns null rather than throwing on any failure — this is a nice-to-have
// side check, never something that should block or error out the sign-in
// flow itself.
export async function getGoogleEmail(token: string): Promise<string | null> {
  try {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.email === "string" ? data.email : null;
  } catch {
    return null;
  }
}

// How long to wait for the picker to actually call back before giving up.
// Exists purely as a safety net (see the timeout race below) — 25s is
// generous for someone actively browsing their Drive, short enough that a
// picker that's silently failed to connect doesn't leave the customer
// staring at a stuck "Connecting…"/"Pulling…" button indefinitely.
const PICKER_CALLBACK_TIMEOUT_MS = 25_000;

// Opens Google's own "pick a file from your Drive" popup, scoped to
// spreadsheets. Resolves with the picked spreadsheet's ID, or null if the
// customer closes the picker without choosing anything (a normal, expected
// outcome — callers should treat null as "cancelled," not an error).
export async function openSpreadsheetPicker(token: string): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Picking an existing sheet isn't configured yet. Set NEXT_PUBLIC_GOOGLE_API_KEY in your environment (see README)."
    );
  }
  await loadPickerApi();

  const pickerPromise = new Promise<string | null>((resolve, reject) => {
    try {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);

      const picker = new window.google.picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        // Mobile Safari (iOS) enforces stricter postMessage-origin checks
        // between the picker's iframe and this page than desktop browsers
        // do. Without an explicit origin, the picker can render fully open
        // but never actually connect back to this window — every tap
        // inside it silently does nothing, which is exactly what reads as
        // the picker (and the page behind it, since it's a full-screen
        // overlay) being "frozen." This is Google's own documented fix.
        .setOrigin(window.location.origin)
        .setTitle("Choose your inventory spreadsheet")
        .addView(view)
        .setCallback((data: any) => {
          if (data.action === window.google.picker.Action.PICKED) {
            resolve(data.docs?.[0]?.id ?? null);
          } else if (data.action === window.google.picker.Action.CANCEL) {
            resolve(null);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      reject(e as Error);
    }
  });

  // Belt-and-suspenders against the freeze bug above (or any other reason
  // the picker's callback never fires — a flaky network mid-load, a popup
  // blocked without an obvious error, etc.): every caller of this function
  // awaits it while a button shows "Connecting…"/"Pulling…" and is
  // disabled. Without a timeout, a picker that never calls back leaves
  // that button stuck in its busy state forever, with no way for the
  // customer to retry short of reloading the page. Racing against a clear,
  // actionable timeout turns that dead end into a normal, recoverable error.
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(
      () => reject(new Error("The file picker didn't respond. Try again, or reload the page if it doesn't open.")),
      PICKER_CALLBACK_TIMEOUT_MS
    );
  });

  return Promise.race([pickerPromise, timeout]);
}

async function sheetsFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Sheets API error (${res.status}): ${body}`);
  }
  return res.json();
}

export async function createInventorySpreadsheet(title = "WS Inventory Management Data"): Promise<string> {
  const token = await requestAccessToken();
  const created = await sheetsFetch("", token, {
    method: "POST",
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: "Inventory" } }],
    }),
  });
  const spreadsheetId: string = created.spreadsheetId;
  await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(SHEET_RANGE)}?valueInputOption=RAW`, token, {
    method: "PUT",
    body: JSON.stringify({ values: [HEADER_ROW] }),
  });
  return spreadsheetId;
}

export async function pushItemsToSheet(spreadsheetId: string, items: InventoryItem[]): Promise<void> {
  const token = await requestAccessToken();
  const rows = [
    HEADER_ROW,
    ...items.map((it) => [it.barcode, it.name, it.quantity, it.unit, it.pricePerUnit, it.reorderAt, it.location || ""]),
  ];
  await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(SHEET_RANGE)}?valueInputOption=RAW`, token, {
    method: "PUT",
    body: JSON.stringify({ values: rows }),
  });
}

// Finds the Usage tab if it already exists (returning its numeric grid
// sheetId and, if present, the chartId of the chart already on it — so a
// repeat sync updates that chart in place instead of stacking a new one on
// top every time), or creates the tab if this is the first sync to ever
// include usage data.
async function ensureUsageSheet(
  spreadsheetId: string,
  token: string
): Promise<{ sheetId: number; existingChartId: number | null }> {
  const meta = await sheetsFetch(`/${spreadsheetId}?fields=sheets(properties,charts)`, token, { method: "GET" });
  const existing = (meta.sheets ?? []).find((s: any) => s.properties?.title === USAGE_SHEET_TITLE);
  if (existing) {
    const chart = (existing.charts ?? [])[0];
    return { sheetId: existing.properties.sheetId, existingChartId: chart?.chartId ?? null };
  }
  const created = await sheetsFetch(`/${spreadsheetId}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title: USAGE_SHEET_TITLE } } }] }),
  });
  return { sheetId: created.replies[0].addSheet.properties.sheetId, existingChartId: null };
}

// Writes the Usage tab (detail table + weekly-total table) and keeps a
// native embedded chart in sync with it. Runs on every sync alongside
// pushItemsToSheet, same as the Inventory tab — so "Sync now" always
// reflects current usage, not just current stock levels.
//
// This is deliberately a plain REST call against the Sheets API rather
// than a charting library — unlike the xlsx export (see xlsxTools.ts's
// note on the free SheetJS build not supporting chart writes), the Sheets
// API's batchUpdate/addChart request lets us insert a real, interactive
// chart with no extra dependency at all.
export async function pushUsageToSheet(
  spreadsheetId: string,
  movements: StockMovement[],
  items: InventoryItem[]
): Promise<void> {
  const token = await requestAccessToken();
  const { sheetId, existingChartId } = await ensureUsageSheet(spreadsheetId, token);

  const detailRows = movementsToUsageRows(movements, items).map((r) => [
    r.barcode,
    r.itemName,
    r.date,
    r.quantityUsed,
    r.type,
    r.note,
    r.id,
  ]);
  const weekly = weeklyUsageTotals(movements);

  // values:batchUpdate only overwrites the cells within the exact
  // dimensions of what's written — it does NOT clear rows beyond that,
  // which the ranges above are open-ended on. Without this clear first, a
  // sync that has *fewer* rows than the previous one (an item got deleted,
  // usage got backed out, etc.) would leave stale rows from the last sync
  // sitting below the new data forever.
  await sheetsFetch(`/${spreadsheetId}/values:batchClear`, token, {
    method: "POST",
    body: JSON.stringify({ ranges: [USAGE_DETAIL_RANGE, USAGE_SUMMARY_RANGE] }),
  });

  await sheetsFetch(`/${spreadsheetId}/values:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({
      valueInputOption: "RAW",
      data: [
        { range: USAGE_DETAIL_RANGE, values: [USAGE_DETAIL_HEADER, ...detailRows] },
        { range: USAGE_SUMMARY_RANGE, values: [USAGE_SUMMARY_HEADER, ...weekly.map((w) => [w.weekStart, w.total])] },
      ],
    }),
  });

  // Nothing to chart (either a brand-new customer with no logged usage
  // yet, or usage that's since been backed out). A zero-row source range
  // isn't a valid chart request, so there's nothing to add/update — but if
  // an old chart from a *previous* sync is still sitting there, it would
  // otherwise keep showing stale numbers forever, so remove it.
  if (!weekly.length) {
    if (existingChartId) {
      await sheetsFetch(`/${spreadsheetId}:batchUpdate`, token, {
        method: "POST",
        body: JSON.stringify({ requests: [{ deleteEmbeddedObject: { objectId: existingChartId } }] }),
      });
    }
    return;
  }

  const chartSpec = {
    title: "Weekly usage (all items)",
    basicChart: {
      chartType: "COLUMN",
      legendPosition: "NO_LEGEND",
      axis: [
        { position: "BOTTOM_AXIS", title: "Week starting" },
        { position: "LEFT_AXIS", title: "Units used" },
      ],
      domains: [
        {
          domain: {
            sourceRange: {
              sources: [
                {
                  sheetId,
                  startRowIndex: 1,
                  endRowIndex: 1 + weekly.length,
                  startColumnIndex: USAGE_SUMMARY_COLUMN_INDEX.start,
                  endColumnIndex: USAGE_SUMMARY_COLUMN_INDEX.start + 1,
                },
              ],
            },
          },
        },
      ],
      series: [
        {
          series: {
            sourceRange: {
              sources: [
                {
                  sheetId,
                  startRowIndex: 1,
                  endRowIndex: 1 + weekly.length,
                  startColumnIndex: USAGE_SUMMARY_COLUMN_INDEX.start + 1,
                  endColumnIndex: USAGE_SUMMARY_COLUMN_INDEX.end,
                },
              ],
            },
          },
        },
      ],
    },
  };

  const chartRequest = existingChartId
    ? { updateChartSpec: { chartId: existingChartId, spec: chartSpec } }
    : {
        addChart: {
          chart: {
            spec: chartSpec,
            position: {
              overlayPosition: {
                anchorCell: { sheetId, rowIndex: 0, columnIndex: 10 },
                widthPixels: 600,
                heightPixels: 340,
              },
            },
          },
        },
      };

  await sheetsFetch(`/${spreadsheetId}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({ requests: [chartRequest] }),
  });
}

export async function pullItemsFromSheet(spreadsheetId: string): Promise<InventoryItem[]> {
  const token = await requestAccessToken();
  const data = await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(SHEET_RANGE)}`, token, {
    method: "GET",
  });
  const rows: string[][] = data.values ?? [];
  const [, ...dataRows] = rows; // drop header
  return dataRows
    .filter((r) => r.length && r[0])
    .map((r, idx) => ({
      id: `sheet-${idx}-${r[0]}`,
      barcode: r[0] ?? "",
      name: r[1] ?? "",
      quantity: Number(r[2] ?? 0),
      unit: r[3] ?? "ea",
      pricePerUnit: Number(r[4] ?? 0),
      reorderAt: Number(r[5] ?? 0),
      updatedAt: new Date().toISOString(),
      location: r[6] || undefined,
    }));
}

// Reads the Usage tab's detail table back out as raw rows — see
// usageReport.ts's reconcileUsageFromSheetRows for what turns this into
// actual local movement changes. Deliberately does no reconciliation
// itself, same division of labor as pullItemsFromSheet above: this
// function's job is "get the sheet's current data," not "decide what to
// do with it."
export async function pullUsageFromSheet(spreadsheetId: string): Promise<UsageSheetRow[]> {
  const token = await requestAccessToken();
  const data = await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(USAGE_DETAIL_RANGE)}`, token, {
    method: "GET",
  });
  const rows: string[][] = data.values ?? [];
  const [, ...dataRows] = rows; // drop header
  return dataRows
    .filter((r) => r.length && r[0]) // must at least have a barcode
    .map((r) => ({
      barcode: r[0] ?? "",
      itemName: r[1] ?? "",
      date: r[2] ?? "",
      quantityUsed: Number(r[3] ?? 0),
      type: r[4] ?? "",
      note: r[5] ?? "",
      syncId: r[6] ?? "",
    }));
}

// Finds (or lazily creates) the hidden _sync sheet that holds the sync
// token. Failures here are swallowed and treated as "no token sheet yet" —
// a spreadsheet from before this feature shipped, or a transient API
// error, should degrade to "no conflict detected" rather than blocking
// every push/pull with an error about a sheet the customer never asked
// for.
async function ensureSyncMetaSheet(spreadsheetId: string, token: string): Promise<void> {
  const meta = await sheetsFetch(`/${spreadsheetId}?fields=sheets(properties)`, token, { method: "GET" });
  const existing = (meta.sheets ?? []).find((s: any) => s.properties?.title === SYNC_META_SHEET_TITLE);
  if (existing) return;
  await sheetsFetch(`/${spreadsheetId}:batchUpdate`, token, {
    method: "POST",
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title: SYNC_META_SHEET_TITLE, hidden: true } } }],
    }),
  });
}

// The current sync token written to the spreadsheet, or null if none has
// ever been written — either a brand-new spreadsheet, or one that's only
// ever been touched by a version of this app from before conflict
// detection existed. Both cases are treated as "nothing to conflict with
// yet" by callers (see AccountTab's pushAll), never as an error.
export async function getRemoteSyncToken(spreadsheetId: string): Promise<string | null> {
  const token = await requestAccessToken();
  try {
    const data = await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(SYNC_TOKEN_RANGE)}`, token, {
      method: "GET",
    });
    const value = data.values?.[0]?.[0];
    return typeof value === "string" && value ? value : null;
  } catch {
    return null;
  }
}

// Stamps the spreadsheet with a fresh token — called once per push, after
// both Inventory and Usage have been written. A device compares this
// against the token it remembers from its own last sync (see
// storage.ts's getLastSyncToken) before its *next* push: a mismatch means
// some other device pushed in between, which is the actual signal behind
// the "this sheet has changes from another device" warning.
export async function setRemoteSyncToken(spreadsheetId: string, newToken: string): Promise<void> {
  const token = await requestAccessToken();
  await ensureSyncMetaSheet(spreadsheetId, token);
  await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(SYNC_TOKEN_RANGE)}?valueInputOption=RAW`, token, {
    method: "PUT",
    body: JSON.stringify({ values: [[newToken]] }),
  });
}

// Not a cryptographic identifier — just needs to be different from the
// last one and unique enough that two devices never coincidentally
// generate the same value in the same millisecond.
export function newSyncToken(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function sheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
