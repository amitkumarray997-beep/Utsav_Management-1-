# Utsav: Campus Event Management

A full-stack campus event website where students discover events, create an account, and register, and where an admin manages events, posters and registrations. Built with **HTML, CSS and vanilla JavaScript** on a **zero-dependency Node.js server**.

**Live demo:** https://utsav-management-1.onrender.com

---

## Features

### For students
- Browse featured and upcoming events as ticket-stub cards, with a live countdown to the next event
- Search by name, venue or keyword, and filter by category
- Sign up and log in; your account and registrations follow you across devices
- Register from an event popup with full validation (name, email, 10-digit phone, event)
- Duplicate registration protection (one registration per student per event)
- A unique pass code (`MELA-XXXXX`) for every registration
- **My registrations:** view, cancel, clear all, or export to CSV
- Optional confirmation email through EmailJS

### For admins
- Add, edit and delete events (name, category, date and time, venue, description, featured flag)
- Upload event posters; a default poster is generated from the category when none is uploaded
- See every registration, remove any of them, and download the full list as CSV
- Registered counts on event cards update from the server

### General
- Dark and light mode (remembers your choice and follows the system setting)
- Responsive layout for mobile, tablet and desktop
- Entrance and scroll animations that respect reduced-motion settings

---

## Tech stack

| Layer | Details |
|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (no framework, no build step) |
| Backend | Node.js built-in `http`, `fs` and `crypto` modules (no npm dependencies) |
| Storage | One JSON file (`data/db.json`) plus image files in `uploads/` |
| Email | [EmailJS](https://www.emailjs.com/) from the browser (optional) |
| Hosting | Render (Node web service) |

---

## Getting started

**Requirements:** Node.js 18 or newer. There is nothing to install.

```bash
git clone https://github.com/amitkumarray997-beep/Utsav_Management-1-.git
cd Utsav_Management-1-
node server.js
```

Open http://localhost:3000.

On first run the server creates the database with four sample events and an admin account:

- Email: `admin@mela.com`
- Password: `Admin@123` (local development only; see below to change it)

---

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port the server listens on (hosts like Render set this automatically) |
| `ADMIN_PASSWORD` | `Admin@123` | Password for `admin@mela.com`. **Only used when the admin account is first created.** |
| `DATA_DIR` | project folder | Where `data/db.json` and `uploads/` are stored. Point it at a persistent disk in production. |

Example:

```bash
ADMIN_PASSWORD='a-strong-password' node server.js
```

If the admin account already exists, changing `ADMIN_PASSWORD` has no effect. Delete the admin user from `data/db.json` (with the server stopped) and restart to recreate it.

### Confirmation emails (optional)

A static page cannot send email on its own, so the project uses the free EmailJS service.

1. Create an account at emailjs.com and connect an email service (for example Gmail).
2. Create a template. Set **To email** to `{{to_email}}` and use these variables in the body: `{{to_name}}`, `{{event_name}}`, `{{event_date}}`, `{{event_venue}}`.
3. Put your Public Key, Service ID and Template ID in the `EMAILJS` object at the top of `script.js`.

Until this is set up, registrations still work and the confirmation screen says that email is not configured.

---

## How it works

- The server stores **events, users, registrations and login sessions** in `data/db.json`.
- **Passwords** are stored as salted scrypt hashes, never in plain text.
- Logging in sets an **HttpOnly, SameSite session cookie** (valid for 7 days, `Secure` when served over HTTPS). Admin-only actions are checked against that session on the server.
- Login attempts are **throttled** (10 failures per 10 minutes per IP).
- Registration rules (valid details, no duplicates, event exists) are **enforced on the server**, not only in the browser.
- Posters are saved as real files in `uploads/`. Replacing a poster or deleting an event removes the old file, and deleting an event also removes its registrations.
- Changes made by an admin are visible to everyone after a page refresh.

### API overview

| Method | Endpoint | Access | Description |
|---|---|---|---|
| `GET` | `/api/events` | Public | List events with registration counts |
| `POST` | `/api/events` | Admin | Create an event (optional base64 image) |
| `PUT` | `/api/events/:id` | Admin | Update an event or its poster |
| `DELETE` | `/api/events/:id` | Admin | Delete an event, its poster and its registrations |
| `POST` | `/api/signup` | Public | Create a student account and log in |
| `POST` | `/api/login` | Public | Log in |
| `POST` | `/api/logout` | Logged in | Log out |
| `GET` | `/api/me` | Public | Current user, or `null` |
| `GET` | `/api/registrations` | Logged in | Your registrations (all of them for admin) |
| `POST` | `/api/registrations` | Logged in | Register for an event |
| `DELETE` | `/api/registrations/:id` | Owner or admin | Cancel one registration |
| `DELETE` | `/api/registrations` | Logged in | Clear all of your registrations |

---

## Project structure

```
event-website/
├── server.js       API, database, sessions and image files
├── index.html      Page markup
├── script.js       Client logic (events, auth, registration, admin)
├── style.css       Base styles
├── mela.css        Utsav theme (ticket-stub cards)
├── package.json
├── data/           db.json is created here on first run
└── uploads/        Event posters
```

---

## Deploying to Render

1. Push the project to GitHub.
2. On [render.com](https://render.com), choose **New → Web Service** and connect the repository.
3. Runtime: **Node**. Start command: `node server.js`. The build step can be left as it is.
4. Under **Environment**, set `ADMIN_PASSWORD` to a strong password.
5. Deploy, then log in at your `onrender.com` address as `admin@mela.com`.

### Keeping data between deploys

Render's **free** instances have no persistent disk and sleep when idle. Every redeploy or restart resets the app to its starting data: accounts, registrations and uploaded posters are lost. For real use:

1. Choose an instance type that supports a **Disk**.
2. Add a disk with mount path `/var/data`.
3. Set `DATA_DIR=/var/data`.

Back up `data/db.json` and `uploads/` together. They hold everything.

---

## Known limitations

- The JSON-file database suits a single server and a modest number of users. For heavy traffic, move to a real database such as PostgreSQL.
- Changes appear after a page refresh. Live updates (polling or Server-Sent Events) are not included yet.
- There is no password reset flow.
- Registration emails come from the browser via EmailJS, so they depend on the EmailJS free-tier limits.

## Ideas for next steps

- Live updates for event changes and registration counts
- Password reset by email
- Event capacity limits and waitlists
- QR code on the registration pass, with a check-in screen for organizers
- Move storage to a managed database and cloud image storage

---

## Author

Built by **Amit Kumar Ray**. Contributions and suggestions are welcome through issues and pull requests.
