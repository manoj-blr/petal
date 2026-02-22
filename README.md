# Petal — HTTP Client for People Who Don't Want Cloud Drama

I got tired of Postman and Insomnia.

Not because they're bad tools — they're genuinely good. But at some point they both decided that I couldn't just *use* them. I had to create an account first. Log in. Agree to sync my requests, headers, API keys, and environment variables to someone else's cloud. And then pay once the free tier started getting stingy.

The second issue was worse: my laptop started slowing to a crawl. These tools — once lean and fast — had become Electron monsters that would happily eat 500 MB of RAM and spike my CPU while I was just trying to fire a GET request. My fans would spin up just opening the app.

So I built Petal. It runs on the local PHP + MySQL stack I already had. It opens in a browser tab. It stores everything in a local database. Nothing leaves your machine. No login. No sync. No cloud. No drama.

It won't replace Postman for a team of 20. It's not trying to. It's for one developer who wants a fast, focused tool that stays out of the way.

---

## What it looks like

> _Screenshot coming soon — clone it and see for yourself. Takes about 5 minutes to set up._

---

## What you need

- PHP 8.x
- MySQL 8.x
- Apache or Nginx (whichever you already have running locally)

That's it. No npm. No Composer. No build step. Everything frontend loads from CDN.

---

## Setup

**1. Put the files somewhere your web server can see them**

```bash
git clone https://github.com/yourname/petal /var/www/html/petal
```

Or just copy the folder. Doesn't matter.

**2. Point your web server at the `public/` folder**

**Apache** — add this to your virtual host or `apache2.conf`:
```apache
Alias /petal /var/www/html/petal/public
<Directory /var/www/html/petal/public>
    AllowOverride All
    Require all granted
</Directory>
```
Then open `http://localhost/petal`.

**Nginx** — point `root` at `public/`:
```nginx
server {
    listen 80;
    server_name petal.local;
    root /var/www/html/petal/public;
    index index.php;

    location ~ \.php$ {
        fastcgi_pass unix:/run/php/php8.x-fpm.sock;
        include fastcgi_params;
        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;
    }
}
```
Add `127.0.0.1 petal.local` to `/etc/hosts`, then open `http://petal.local`.

**3. Create the database**

```bash
mysql -u root -p < sql/schema.sql
```

This creates the `petal` database, all tables, and seeds a default "Local" environment with `base_url = http://localhost` ready to use.

**4. Set your database credentials**

```bash
cp config/.env.php.example config/.env.php
```

Open `config/.env.php` and fill in your MySQL username and password. This file is gitignored — it never leaves your machine.

**5. Open it**

```
http://localhost/petal
```

You should see the app. The "Local" environment is already active. Start typing a URL and hit `Ctrl+Enter`.

---

## How to use it

### The basics

Type a URL, pick a method, hit **Send** (or `Ctrl+Enter`). The response shows up below — status code, timing, size, headers, and a syntax-highlighted body if it's JSON.

### Environments and variables

The dropdown in the top bar switches environments. Click **Manage environments** to create variables. Use `{{variable_name}}` anywhere in your URL, headers, or body — Petal substitutes them before sending.

```
https://{{base_url}}/api/users/{{user_id}}
```

If a variable isn't found in the active environment, it's left as-is and flagged in the response Info tab so you know what broke.

You can paste an entire `.env` file into the environment variable panel (click **Import .env**) instead of adding variables one by one.

### Auth

The **Auth** tab handles the common cases without you having to manually construct headers:

- **Bearer token** — paste your token; `Authorization: Bearer ...` is built automatically. Use `{{token}}` if it's in your environment.
- **Basic auth** — username + password; base64-encoded for you.
- **API Key** — header name and value; you decide where it goes.

### Saving requests

`Ctrl+S` to save. Give it a name, optionally assign it to a collection. Saved requests show up in the sidebar. Right-click (or use the `...` menu on hover) to rename, duplicate, move between collections, or delete.

`Ctrl+K` opens the command palette — start typing to jump to any saved request instantly.

### cURL

Two buttons in the request name bar:

- **Copy as cURL** (`⊞` icon) — generates the equivalent `curl` command for the current request and copies it to clipboard. Useful for sharing with teammates or dropping into a terminal.
- **Import from cURL** — paste a `curl` command from your terminal, browser DevTools (*right-click a network request → Copy as cURL*), or API docs. Petal parses the method, URL, headers, body, and SSL flag automatically.

### History

Every request you send is logged. The sidebar shows the last 50, grouped by date. Click any history entry to reload it into the workspace. `Ctrl+H` scrolls to the history section.

---

## Features

**Sending requests**
- GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS
- Query params tab — edit as key-value pairs, URL updates live
- Headers tab — key-value editor, two default headers pre-filled and enabled (`Accept` and `Content-Type: application/json`)
- Body tab — JSON, Form (URL-encoded), or Raw; Format button for JSON; invalid JSON is caught before sending
- Auth tab — Bearer token, Basic auth, API Key
- Per-request SSL verification toggle (shield icon) — for self-signed certs in local dev
- Per-request timeout (default 30s, range 1–300s)

**Response panel**
- Status badge colour-coded by range (2xx green, 3xx yellow, 4xx orange, 5xx red)
- Duration (ms) and size (KB/MB)
- Syntax-highlighted JSON — written from scratch, no library
- HTML preview tab — auto-shown for `text/html` responses; uses `srcdoc` iframe so Laravel `dd()` and similar interactive debug pages work
- Response body search — `$.path.to.key` for JSON navigation, text search with match highlighting
- Copy raw body to clipboard; word-wrap toggle
- Response size limit — bodies over 5 MB are truncated with a warning to prevent browser lockup
- Split view (`Ctrl+\`) — side-by-side request and response panels

**Environments**
- Multiple environments, one active at a time
- `{{variable}}` substitution in URL, headers, and body
- Duplicate an environment with all its variables in one click
- Bulk import from a `.env` file

**Collections and saved requests**
- Organise requests into collections
- Duplicate, rename, move between collections, delete via right-click menu
- Request notes — a free-text Notes tab for documenting endpoints, expected params, gotchas
- `Ctrl+K` command palette — fuzzy search across all saved requests

**History**
- Last 50 requests, grouped by "Today / Yesterday / date"
- Click to reload any past request (method, URL, headers, body all restored)

**cURL**
- Copy any request as a `curl` command
- Import from `curl` — shell-aware parser handles quoted args, escaped characters, line continuations

**Settings (persisted across sessions)**
- Light / dark theme toggle
- Split / stacked response layout
- Sidebar visible / hidden

**Keyboard shortcuts**

| Shortcut       | Action                                  |
|----------------|-----------------------------------------|
| `Ctrl+Enter`   | Send request                            |
| `Ctrl+S`       | Save current request                    |
| `Alt+N`        | New request                             |
| `Ctrl+K`       | Command palette (jump to saved request) |
| `Ctrl+E`       | Focus environment switcher              |
| `Ctrl+/`       | Toggle sidebar                          |
| `Ctrl+H`       | Scroll to history                       |
| `Ctrl+\`       | Toggle split / stacked layout           |
| `Ctrl+L`       | Focus + select URL bar                  |
| `Alt+M`        | Focus method selector (arrow keys cycle)|
| `Alt+1–5`      | Switch request tab (Params/Headers/Body/Auth/Notes) |
| `Alt+6–7`      | Switch response tab (Body/Headers)      |
| `?`            | Open keyboard shortcut cheatsheet       |
| `Esc`          | Close modal / menu                      |

---

## Folder structure

```
petal/
├── public/                   ← Web root — point your server here
│   ├── index.php             ← Single-page app shell (all HTML lives here)
│   └── assets/
│       ├── css/
│       │   ├── theme.css     ← CSS custom properties (colours, fonts, radii)
│       │   └── app.css       ← Layout + component styles (no hardcoded colours)
│       └── js/
│           ├── app.js           ← Init, showToast(), sidebar toggle
│           ├── shortcuts.js     ← Central keyboard shortcut registry
│           ├── settings.js      ← Theme, layout — localStorage + DB dual-write
│           ├── environments.js  ← Environment switcher + variable editor
│           ├── collections.js   ← Sidebar tree, CRUD, context menu
│           ├── palette.js       ← Ctrl+K command palette
│           ├── autocomplete.js  ← URL bar autocomplete (saved requests + history)
│           ├── history.js       ← History panel
│           ├── request.js       ← URL bar, send/cancel, new/load request, params tab
│           ├── save.js          ← Save + update request flow
│           ├── headers.js       ← Headers tab editor
│           ├── body.js          ← Body tab (JSON / Form / Raw)
│           ├── auth.js          ← Auth tab (Bearer / Basic / API Key)
│           ├── curl.js          ← cURL generator + importer
│           └── response.js      ← Response rendering + JSON syntax highlighter
│
├── api/                      ← PHP endpoints (AJAX only, return JSON)
│   ├── send_request.php      ← cURL engine, variable substitution, history logging
│   ├── environments.php      ← CRUD for environments
│   ├── variables.php         ← CRUD for environment variables
│   ├── collections.php       ← CRUD for collections
│   ├── requests.php          ← CRUD for saved requests
│   ├── history.php           ← Read / clear request history
│   └── settings.php          ← Read / write user settings (theme, layout)
│
├── config/
│   ├── database.php          ← PDO connection helper (getDb())
│   ├── .env.php              ← Your credentials (gitignored)
│   └── .env.php.example      ← Copy this and fill it in
│
└── sql/
    └── schema.sql            ← Full schema + seed data — run once to set up
```

---

## Philosophy

Every file in this codebase should be easy to read, modify, and delete. No framework magic. No abstractions for the sake of it. If something can be simpler, it should be simpler.

The frontend is plain jQuery + Bootstrap loaded from CDN. The backend is plain PHP 8. The database is MySQL. These are boring choices. That's the point — boring technology stays out of your way.

If you want to add a feature, you can find where it belongs in about 30 seconds and write it in vanilla JS or PHP without reading a framework guide first.

---

## What it doesn't do (yet)

- No team sharing or cloud sync — intentionally. Use Git to share a request collection export.
- No WebSocket or GraphQL mode — plain HTTP only for now.
- No test runner or response assertions — coming at some point.
- No Postman collection import — on the list.

---

## Tech stack

| Layer    | Choice                                          |
|----------|-------------------------------------------------|
| Backend  | Plain PHP 8.x — no framework                   |
| Database | MySQL 8.x                                       |
| Frontend | Bootstrap 5 + jQuery 3 + Bootstrap Icons (CDN) |
| Server   | Apache or Nginx — whatever you already have     |
