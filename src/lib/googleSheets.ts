"use client";

import { InventoryItem } from "./types";

// Client-side Google Sheets sync using Google Identity Services (GIS).
// Mirrors the ISC app's model: each customer connects *their own* Google
// account and *their own* spreadsheet — we never see or store their
// spreadsheet data on our server, it round-trips straight from their
// browser to Google's API using a token scoped only to Sheets.
//
// Requires NEXT_PUBLIC_GOOGLE_CLIENT_ID to be set (see README). That
// client ID is a public identifier (safe to ship to the browser), but it
// must have this app's deployed origin listed under "Authorized JavaScript
// origins" in Google Cloud Console > Credentials, or Google will refuse
// the sign-in popup.

const SHEET_RANGE = "Inventory!A1:F";
const HEADER_ROW = ["Barcode", "Name", "Quantity", "Unit", "Price Per Unit", "Reorder At"];

declare global {
  interface Window {
    google?: any;
  }
}

let gisLoaded: Promise<void> | null = null;
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

export function isGoogleSheetsConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID);
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
      scope: "https://www.googleapis.com/auth/spreadsheets",
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

export async function createInventorySpreadsheet(title = "InventorySync Data"): Promise<string> {
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
