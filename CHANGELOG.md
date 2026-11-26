# Changelog

All notable changes to Chat View for Freshdesk. Versions match `manifest.json` and the Chrome Web Store package.

## 1.7.3 — 2026-11-25

### Fixed
- Replies an agent sends from an external mail client (Outlook, Gmail) with customers in To/CC are no longer shown as private notes. Freshdesk sometimes stores them as private, but the customer did receive them, so they now show on the agent side like any other reply.

### Added
- Customer-facing notes get a **public note** label, so they can be told apart from private notes (🔒, in yellow).
- Click the **public note ▾** label to show or hide who the message was sent to (To / CC / BCC). Click it again to hide the list. Hovering the label lists the external recipients.

## 1.7.2 — 2026-11-11

### Changed
- New extension icon (Freshdesk-style chat bubble, padded to the store guidelines).

### Internal
- Anonymized test fixtures for `clean.js` and MIT license.

## 1.7.1 — 2026-11-09

### Fixed
- Code blocks and long preformatted text in a message now wrap inside the bubble instead of overflowing it.

## 1.7.0 — 2026-11-04

### Added
- **⚙ Settings → Newest first**: reverses the chat (latest on top, oldest at the bottom). The jump button moves to the top and points ↑.

## 1.6.0 — 2026-11-03

First packaged version: chat view for Freshdesk tickets with only the new text of each email, quoted history behind "show quoted", collapsible signatures, image lightbox, internal domains, light and dark mode, and English and Spanish.
