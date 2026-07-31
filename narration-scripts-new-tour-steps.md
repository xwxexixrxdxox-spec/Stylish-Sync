# New tutorial narration — scripts to record

20 new steps were added across both guided tours (main tour: 10 → 23 steps; Property tour: 9 → 16 steps). They're live right now as caption-only steps — no audio yet, so they show their text card but stay silent. Once you record these and send them back, I'll drop them into the same folders the existing narration already lives in and they'll start playing automatically (the app looks up narration by step id, so no code changes needed on my end).

Same setup as last time: your local ComfyUI/Chatterbox pipeline, same voice, one MP3 per step. File names below are exact — they have to match precisely for a clip to be picked up.

## Main tour — save to `public/audio/tutorial/`

### header-tools.mp3
> "Up here you can flip between light and dark mode any time. Next to it, the clear-cache icon reloads the app fresh if something ever looks stuck — it doesn't touch your inventory data."

### inventory-search-sort.mp3
> "Search by name, barcode, or location. Next to it, the sort menu can bump low-stock items straight to the top of the list."

### inventory-import-export.mp3
> "Already track inventory in a spreadsheet? Import it here in one go. Export works the same way in reverse, any time you want a copy on hand."

### inventory-share-barcodes.mp3
> "Send your saved barcode-to-item matches to a teammate, or pull in theirs — handy the first time you're both starting from scratch."

### inventory-item-actions.mp3
> "Tap the quantity number itself to set it to an exact amount instead of tapping minus or plus repeatedly. Over on the right, the icons cover breaking down a case, moving stock to another location, editing details, and deleting."

### scan-modes.mp3
> "Barcode mode is for one item at a time. Receipt mode reads a whole photographed receipt at once — great right after a big supply run."

### reorder-search-and-find.mp3
> "This toggle controls whether Find at searches by barcode or by name. Speaking of which — tap Find at on any item to jump straight to a search on a few common retailer sites."

### reorder-package-tracking.mp3
> "Once you've ordered, save the tracking number here for a quick link to the carrier's tracking page. It's simple by design — just a place to keep the number handy, not a live delivery tracker."

### account-sheets-actions.mp3
> "Once connected, Push sends this device's inventory to the sheet, and Pull brings the sheet's version back. Nothing syncs automatically — you're always in control of when a sync happens."

### account-name-tag.mp3
> "Add your name here so teammates working the same inventory can see who made a change and when — just a label, not a login, and anyone on this device can update it."

### account-manage-property.mp3
> "Property is a separate space for tracking equipment and fixtures — ordered parts, maintenance status, all of it — synced to its own tab on the same spreadsheet."

### account-reminders-install.mp3
> "Turn on daily reminders and you'll only hear from us when something's actually worth checking. And if you'd like this app to feel less like a browser tab, you can install it right to your home screen from here."

### account-replay-tour.mp3
> "This link brings this exact walkthrough back whenever you want a refresher — no need to remember anything from today."

## Property tour — save to `public/audio/property/`

### property-sync-actions.mp3
> "Once Google Sheets is connected from the Account panel, Property gets its own Property tab on that same spreadsheet — Push sends this device's list there, Pull brings it back."

### add-property.mp3
> "This button opens a short form — name, location, serial number, and notes — for anything you want to track going forward."

### example-edit.mp3
> "Tap Edit to update a property's name, location, serial number, or notes — nothing here is locked in once it's added."

### example-status-dropdown.mp3
> "Logging a receipt isn't the only way to move a part along — this dropdown lets you jump straight to Ordered, Shipped, Received, Installed, or Cancelled whenever that's a better fit."

### example-add-part.mp3
> "Type or scan a part number to look it up, or just fill in the description yourself — quantity, price, and an expected delivery date are all optional."

### example-add-task.mp3
> "Track maintenance the same way — type a repair or maintenance job here and hit enter to add it to the list. Its own status and history work exactly like an ordered part's."

### replay-tour.mp3
> "This link brings this exact walkthrough back whenever you want a refresher."

## Notes

- The scripts above are copied straight from each step's on-screen body text, so a recording matches what the card says word for word — feel free to smooth out phrasing for spoken cadence (e.g. "minus or plus" instead of reading a symbol) as long as the meaning stays the same; that's already reflected in `inventory-item-actions` above.
- Steps with a phase-2 target (`header-tools`, `inventory-item-actions`, `reorder-search-and-find`, `account-reminders-install`) don't need a split recording — the app switches the spotlight partway through the single clip's playback automatically, same as the existing `reorder` step already does.
- No rush on these — every new step already works fine without audio (it just shows the caption silently), so send them whenever you get a chance to record.
