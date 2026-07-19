"use client";

import { InventoryItem } from "./types";

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

const SHEET_RANGE = "Inventory!A1:F";
const HEADER_ROW = ["Barcode", "Name", "Quantity", "Unit", "Price Per Unit", "Reorder At"];

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

  return new Promise((resolve, reject) => {
    try {
      const view = new window.google.picker.DocsView(window.google.picker.ViewId.SPREADSHEETS)
        .setIncludeFolders(true)
        .setSelectFolderEnabled(false);

      const picker = new window.google.picker.PickerBuilder()
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
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
    ...items.map((it) => [it.barcode, it.name, it.quantity, it.unit, it.pricePerUnit, it.reorderAt]),
  ];
  await sheetsFetch(`/${spreadsheetId}/values/${encodeURIComponent(SHEET_RANGE)}?valueInputOption=RAW`, token, {
    method: "PUT",
    body: JSON.stringify({ values: rows }),
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
    }));
}

export function sheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
