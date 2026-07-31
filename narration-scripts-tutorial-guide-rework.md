# Narration scripts — "Tutorial Guide" rework (round O)

Full current script for the main tour (Inventory + Account, 31 steps in order) —
your Tutorial Guide doc's Part 1 and Part 2. This replaces the previous
narration-scripts doc for anything listed below; where a step's wording didn't
change, I've said so and you can leave the existing recording alone.

Save each file to `public/audio/tutorial/<step-id>.mp3`. Exact filenames matter —
that's how the app finds them, no code changes needed on my end once they land.

Status tags:
- **[REUSE]** — wording is unchanged, existing recording still fits, nothing to do.
- **[RE-RECORD]** — a file already exists for this id, but the words changed, so the
  old recording will say the wrong thing. Needs a fresh take.
- **[NEW]** — never recorded before. Needed for this to stop being silent.

Property tour (Part 3) isn't included here — its content isn't being reworked this
round, see the accompanying chat message for why.

---

## 1. welcome — [RE-RECORD] (minor wording tweak)
> "Welcome to WS Inventory Management. We loaded 3 sample items so there's something to explore right away. This quick tour covers everything the app can do — tap the arrow to move through it at your own pace, or Skip tour if you'd rather dive in on your own."

## 2. cookie-consent — [REUSE]
(No change — silent/self-resolving step, existing recording still fits if you have one.)
> "First, a quick choice. Pick Accept or Decline below — either is fine, the app only uses essential cookies. Choosing now also clears this banner out of the way for the rest of the tour."

## 3. header-theme-toggle — [NEW]
(Split out of the old "header-tools" step — this is just the light/dark half.)
> "Light or dark, any time. This flips the whole app between light and dark mode whenever you like — it sticks until you tap it again."

## 4. header-clear-cache-test — [NEW]
(The other half of the old "header-tools" step — now its own guided, safe-to-try test.)
> "Try the refresh button — safely. Next to it, this icon reloads the app fresh if something ever looks stuck. Go ahead and press and hold it right now — it's just a preview while this tour is open, so nothing will actually be cleared. In real use, holding it for real does wipe this device's local cache and reload the page, though it never touches your saved inventory data."

## 5. stock-controls-tap — [RE-RECORD] (added a line)
> "Adjust stock in a tap. Go ahead and tap minus or plus on this item to log a unit at a time. Try it as many times as you like."

## 6. stock-controls-hold — [RE-RECORD] (added a line)
> "Hold for bigger changes. Now try pressing and holding either button — that adjusts several at once, handy for a big restock or a big pull. Take your time; tap Move on whenever you're ready to keep going."

## 7. inventory-search-sort — [NEW]
> "Find anything fast. Search by name, barcode, or location. Next to it, the sort menu can bump low-stock items straight to the top of the list."

## 8. inventory-import-export — [NEW]
> "Bring in — or back up — a whole spreadsheet. Already track inventory in a spreadsheet? Import it here in one go. Export works the same way in reverse, any time you want a copy on hand."

## 9. inventory-share-barcodes — [NEW]
> "Sharing is caring. Send your saved barcode-to-item matches to a teammate, or pull in theirs — handy the first time you're both starting from scratch, so neither of you has to scan everything twice."

## 10. item-action-icons — [NEW]
(Replaces the old "inventory-item-actions" step — quantity-chip mention dropped per your note.)
> "A closer look at these icons. Over on the right, the icons cover breaking down a case, moving stock to another location, editing details, and deleting. Give each one a try, one at a time."

## 11. item-action-breakdown — [NEW]
> "Break down a case. Tap this icon to split a sealed case into individual units — handy the moment a case actually gets opened, so the count stays accurate at both levels."

**Heads up:** none of the 3 sample items are set up with a case/each relationship, so this icon won't actually appear for most first-time customers — the step will just gracefully sit there until they tap Next. Let me know if you'd like me to add a case/each pair to the sample data so this one has something real to point at.

## 12. item-action-edit — [NEW]
> "Edit the full details. The pencil opens this item's full details — name, barcode, reorder point, usage tracking window, and more."

## 13. item-action-delete — [NEW]
> "Delete for good. And the trash icon removes an item entirely — it'll always ask you to confirm first, so there's no risk of an accidental tap losing anything."

## 14. scan — [REUSE]
> "Scan barcodes or receipts. Point your camera at a barcode to add or remove stock instantly. Adding a whole order at once? Switch to Receipt mode to log several items from one photo."

## 15. scan-modes — [NEW]
(Content grew — added the accuracy caveat you asked for.)
> "Two ways to log stock. Barcode mode is for one item at a time. Receipt mode reads a whole photographed receipt at once — great right after a big supply run, though accuracy can be hit or miss on a crumpled or blurry receipt. Worth a quick double-check of the results before trusting them completely."

## 16. reorder — [RE-RECORD] (content trimmed — Share moved to its own step)
> "Never run out unexpectedly. This is Reorder — it automatically lists everything at or below the reorder point you've set for it. Take a look at this item; its low-stock warning is right here."

## 17. reorder-search-and-find — [NEW]
> "Choose how it searches, then where to buy. This toggle controls whether Find at searches by barcode or by name, and Find at itself jumps straight to a search on a few common retailer sites. Give both a try — no rush, take whatever time you need."

## 18. reorder-package-tracking — [NEW]
(Moved earlier in the order, per your note — same words as before.)
> "Jot down a tracking number. Once you've ordered, save the tracking number here for a quick link to the carrier's tracking page. It's simple by design — just a place to keep the number handy, not a live delivery tracker."

## 19. reorder-share — [NEW]
(Split out of the old combined "reorder" step into its own moment.)
> "Send the whole list to a supplier. Tap Share to text or email this entire reorder list straight to a supplier — everything currently at or below its reorder point, in one go."

## 20. usage — [RE-RECORD] (content significantly changed)
> "See how fast things move. Usage charts how quickly each item gets used and estimates how many days of stock are left at that pace. We've narrowed the list to just this one item for now — go ahead and tap into it to see its full detail view."

## 21. usage-detail-timeframes — [NEW]
> "Zoom in or out on any time frame. These buttons switch the chart between a week, a month, a few months, or all-time — the fastest way to tell a one-off spike apart from a real ongoing trend."

## 22. support — [RE-RECORD] (added a line about Clyde's memory)
> "Stuck? Clyde's here. Support has Clyde, a free AI assistant you can open any time a question comes up — no need to leave the app. It remembers what you've told it earlier in the same conversation, so you don't have to repeat yourself as you dig into an issue."

## 23. account-gear — [REUSE]
> "Your account lives here. The gear icon opens your account: Google Sheets sync, app settings, and billing. Tap it now, or tap Next, to take a look."

## 24. google-signin — [RE-RECORD] (added a closing line, and this step now shows the sound bar)
> "Optional: back up to Google Sheets. Sign in with Google to sync your inventory to a spreadsheet you own — readable from anywhere, and safe if this device is ever lost. Totally optional; tap Next to skip it for now, and the next few steps will just gracefully skip past anything that needs a connected sheet."

## 25. account-push-test — [NEW]
(First of a 3-step push → clear → pull sequence, per your doc.)
> "Push sends this device's copy up. If you connected Google Sheets a moment ago, go ahead and tap Push to Sheet now — it sends this device's current inventory up to your spreadsheet. Nothing syncs automatically; it only happens when you tap it."

## 26. account-name-tag — [NEW]
> "Put a name on your changes. Add your name here so teammates working the same inventory can see who made a change and when — just a label, not a login, and anyone on this device can update it."

## 27. start-fresh — [RE-RECORD] (repositioned, and now frames the push/pull round trip)
(Same underlying button as before, moved earlier in the tour and reworded — this is no longer the tour's last step.)
> "Clear this device's copy. Tap Start Fresh below whenever you're ready — it clears these sample items and any changes you've made so far, right here on this device. If you pushed to a connected sheet a moment ago, nothing there is touched; the next step brings it right back."

## 28. account-pull-test — [NEW]
> "Pull brings it back down. And if you pushed earlier, tap Pull from Sheet now to bring that same inventory right back — proof that your data really does live safely in the spreadsheet, not just on this one device."

## 29. account-manage-property — [NEW]
> "Track equipment, not just stock. Property is a separate space for tracking equipment and fixtures — ordered parts, maintenance status, all of it — synced to its own tab on the same spreadsheet."

## 30. account-reminders-install — [NEW]
> "Reminders, and a home-screen shortcut. Turn on daily reminders and you'll only hear from us when something's actually worth checking. And if you'd like this app to feel less like a browser tab, you can install it right to your home screen from here."

## 31. account-replay-tour — [NEW]
> "Come back to this tour any time. This link brings this exact walkthrough back whenever you want a refresher — it's the only way to see it again now, since it no longer opens automatically."

## 32. tour-complete — [NEW]
(New closing step — replaces the old ending, which used to live on the Start Fresh step before it moved earlier.)
> "That's the tour! You're all set — explore Inventory on your own from here, or tap Manage Property above to keep going with equipment tracking."

---

## Not included this round

- **Property tour (Part 3)** — its 16 existing steps are unchanged; the hands-on
  rebuild you described (real data entry, add-a-part flow, the Lowe's cart step,
  status-change undo UI, a maintenance-task walkthrough) is a separate, larger
  build — see the accompanying chat message.
- **Clyde's own voice** — the AI chat assistant itself isn't narrated; only the
  tutorial step that introduces it (#22 above) has a script.
