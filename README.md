# Petal - HTTP Client for People Who Don't Want Cloud Drama

I got tired of Postman and Insomnia.

Not because they're bad tools - they're genuinely good. But at some point they both decided that I couldn't just *use* them. I had to create an account first. Log in. Agree to sync my requests, headers, API keys, and environment variables to someone else's cloud. And then pay once the free tier got stingy.

The second issue was worse: my laptop started slowing to a crawl. These tools - once lean and fast - had become Electron monsters that eat 500 MB of RAM and spike your CPU while you're just trying to fire a GET request. My fans would spin up just opening the app.

So I built Petal. It runs on the local PHP + MySQL stack I already had. It opens in a browser tab. It stores everything in a local database. Nothing leaves your machine. No login. No sync. No cloud. No drama.

It won't replace Postman for a team of 20. It's not trying to. It's for one developer who wants a fast, focused tool that stays out of the way.

---

## What you need

- PHP 8.x
- MySQL 8.x
- Apache or Nginx (whichever you already have running)

No npm. No Composer. No build step. Everything frontend loads from CDN.

---

## Setup

**1. Clone it somewhere your web server can see**

```bash
git clone https://github.com/manoj-blr/petal.git /var/www/html/petal
```

**2. Point your web server at the `public/` folder**

Apache - add this to your virtual host or `apache2.conf`:
```apache
Alias /petal /var/www/html/petal/public
<Directory /var/www/html/petal/public>
    AllowOverride All
    Require all granted
</Directory>
```
Then open `http://localhost/petal`.

Nginx:
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
Add `127.0.0.1 petal.local` to `/etc/hosts`, open `http://petal.local`.

**3. Create the database**

```bash
mysql -u root -p < sql/schema.sql
```

Creates the `petal` database, all the tables, and seeds a default "Local" environment with `base_url = http://localhost` ready to go.

**4. Set your credentials**

```bash
cp config/.env.php.example config/.env.php
```

Open `config/.env.php`, fill in your MySQL username and password. This file is gitignored - it stays on your machine.

**5. Open it**

```
http://localhost/petal
```

The "Local" environment is already active. Start typing a URL and hit `Ctrl+Enter`.

---

## How it works

### Sending a request

Type a URL, pick a method, hit **Send** (or `Ctrl+Enter`). Response shows up below - status, timing, size, headers, and syntax-highlighted JSON if the body is JSON. HTML responses open in a sandboxed iframe so Laravel `dd()` and debug pages render properly instead of showing raw markup.

### Environments and variables

The dropdown in the top bar switches environments. Click **Manage environments** to add variables. Use `{{variable_name}}` anywhere in your URL, headers, or body and Petal substitutes them before sending:

```
https://{{base_url}}/api/users/{{user_id}}
```

If a variable isn't defined in the active environment, it gets left as-is and flagged in the response Info tab so you can see exactly what broke. You can also paste an entire `.env` file directly into the variable panel - click **Import .env** instead of typing them in one by one.

### Auth

The **Auth** tab handles the common cases: Bearer token, Basic auth, and API Key. It builds the headers for you so you're not manually constructing `Authorization: Bearer ...` every time. Variables work here too - `{{token}}` is fine.

### Saving requests

`Ctrl+S` to save. Give it a name, optionally drop it in a collection. Saved requests appear in the sidebar. Right-click to rename, duplicate, move, or delete. `Ctrl+K` opens a command palette - type to jump to any saved request without touching the sidebar.

### cURL

Two buttons in the request bar. **Copy as cURL** takes whatever's in the workspace and gives you the equivalent `curl` command - useful when you want to share it or paste it in a terminal. **Import from cURL** does the reverse - paste a `curl` command from your terminal, DevTools, or API docs, and Petal fills in the method, URL, headers, and body automatically.

### History

Every request you send gets logged. Last 50, grouped by date, in the sidebar. Click any entry to restore the full request - method, URL, headers, body, everything. `Ctrl+H` scrolls to it.

---

## Keyboard shortcuts

| Shortcut       | What it does                            |
|----------------|-----------------------------------------|
| `Ctrl+Enter`   | Send request                            |
| `Ctrl+S`       | Save current request                    |
| `Alt+N`        | New request                             |
| `Ctrl+K`       | Command palette                         |
| `Ctrl+E`       | Focus environment switcher              |
| `Ctrl+/`       | Toggle sidebar                          |
| `Ctrl+H`       | Scroll to history                       |
| `Ctrl+\`       | Toggle split / stacked layout           |
| `Ctrl+L`       | Focus + select URL bar                  |
| `Alt+M`        | Focus method selector                   |
| `Alt+1–5`      | Switch request tab                      |
| `Alt+6–7`      | Switch response tab                     |
| `?`            | Keyboard shortcut cheatsheet            |
| `Esc`          | Close modal / menu                      |

---

## Folder structure

```
petal/
├── public/                   ← Web root
│   ├── index.php             ← App shell
│   └── assets/
│       ├── css/
│       │   ├── theme.css     ← CSS custom properties
│       │   └── app.css       ← Layout and components
│       └── js/
│           ├── app.js
│           ├── shortcuts.js
│           ├── settings.js
│           ├── environments.js
│           ├── collections.js
│           ├── palette.js
│           ├── autocomplete.js
│           ├── history.js
│           ├── request.js
│           ├── save.js
│           ├── headers.js
│           ├── body.js
│           ├── auth.js
│           ├── curl.js
│           └── response.js
│
├── api/                      ← PHP endpoints, return JSON
│   ├── send_request.php
│   ├── environments.php
│   ├── variables.php
│   ├── collections.php
│   ├── requests.php
│   ├── history.php
│   └── settings.php
│
├── config/
│   ├── database.php
│   ├── .env.php              ← Your credentials (gitignored)
│   └── .env.php.example
│
└── sql/
    └── schema.sql
```

---

## The stack

Plain PHP 8, MySQL 8, Bootstrap 5 + jQuery 3 from CDN. No framework. No build pipeline. Boring on purpose - boring technology doesn't surprise you at 11pm when something breaks.

Every file should take under a minute to find and under five to understand. If you want to add something, you shouldn't need to read a framework guide to figure out where it goes.

---

## What's missing

No team sharing - use Git to export and share a collection if you need to. No WebSocket or GraphQL support, plain HTTP only. No response assertions or test runner yet. Postman collection import is on the list but not done.

If any of that's a dealbreaker, Postman exists and is good. This is for the case where Postman is too much.