# Utsav – Events, Tickets, Tamasha

A responsive event management website built with **HTML5, CSS3 and vanilla JavaScript**.

## Features
- Hero section with live countdown to the next event
- Featured and upcoming event cards (name, date, venue, image, description)
- Search and category filter
- Student sign up / log in, and admin panel to manage events and posters
- Event details popup with registration form
- JavaScript validation (name, email, 10-digit phone, event) and confirmation message
- Duplicate registration check (same email + event)
- **Bonus:** dark/light mode (remembers your choice and follows system setting)
- **Bonus:** countdown timer in hero and "starts in N days" on each card
- **Bonus:** entrance, scroll-reveal and popup animations (respects reduced-motion)
- **Bonus:** Registration management: view, cancel, clear all, export to CSV (stored on the server, so it follows you across devices)
- Fully responsive: mobile, tablet, desktop

## Accounts and admin
- **Students** sign up with name, email, phone and password, then log in to register for events and see them under "My registrations".
- **Admin** login (created automatically on first run): `admin@mela.com` / `Admin@123`
- The Admin panel lets you add, edit and delete events (name, category, date and time, venue, description, featured flag) and upload a poster. If no poster is uploaded, a default poster is generated from the category. New events appear on the site immediately.
- The admin can also see and remove all registrations and download them as CSV.

## Confirmation emails (EmailJS)
A pure HTML/CSS/JS site cannot send email by itself, so this project uses the free EmailJS service from the browser.
1. Create a free account at emailjs.com and add an email service (for example Gmail).
2. Create a template. Set "To email" to `{{to_email}}` and use these variables in the body: `{{to_name}}`, `{{event_name}}`, `{{event_date}}`, `{{event_venue}}`.
3. Copy your Public Key, Service ID and Template ID into the `EMAILJS` object at the top of `script.js`.
Until this is done, registrations still work and the confirmation screen says that email is not set up.

## How images and the database work
- Events, student accounts, registrations and login sessions live in one database file: `data/db.json` (managed by `server.js`).
- When the admin adds an event with a poster, the image is saved as a real file in the **`uploads/`** folder inside the project, and its path is stored in the database.
- Editing the poster replaces the old file. "Use default poster" removes it.
- **Deleting an event also deletes its poster file from `uploads/`.**
- Passwords are stored as salted scrypt hashes. Logging in sets an HttpOnly session cookie (valid 7 days); admin actions are checked against that session on the server.
- The admin account is created on first run. Set its password with `ADMIN_PASSWORD=yourpass node server.js` (only used when the admin account is first created).
- Back up `data/db.json` and `uploads/` together. They hold everything.

## Run locally (Node.js 16+, no npm install needed)
```bash
cd event-website
node server.js
# open http://localhost:3000
```
Admin login: `admin@mela.com` / `Admin@123`

## What makes it different
Ticket-stub event cards, a paper-and-ink theme (`mela.css`), a pass code (MELA-XXXXX) on every registration, and a file-backed image store.

## Project structure
```
event-website/
├── server.js      (API + database + image files)
├── index.html
├── style.css
├── mela.css       (Campus Mela theme)
├── script.js
├── data/db.json   (events, accounts, registrations, sessions; created on first run)
└── uploads/       (event posters)
```

## Git and GitHub submission steps
```bash
cd event-website
git init
git add .
git commit -m "Initial commit: event management website"
git branch -M main
# create an empty repository on github.com first, then:
git remote add origin https://github.com/<your-username>/<repo-name>.git
git push -u origin main
```
Tip: make several small commits (for example "Add hero section", "Add dark mode", "Add registration management") so your history shows the progress.

Optional hosting: in the GitHub repo go to Settings > Pages, choose the `main` branch, and your site gets a live link.

## Deploy on Render
1. Push the project to GitHub (steps above).
2. On render.com: New > Web Service > connect the repo. Runtime: Node. Build command: leave empty. Start command: `node server.js`.
3. Choose a paid instance type (needed for a persistent disk). Add a Disk with mount path `/var/data`.
4. Environment variables: `ADMIN_PASSWORD` = a strong password, `DATA_DIR` = `/var/data`.
5. Deploy. Your site opens at the `onrender.com` link. Log in as `admin@mela.com` with your ADMIN_PASSWORD.
