# Printer Farm Dashboard

A local dashboard for Bambu Lab printers. It shows every printer's status, its current job,
progress, layer, temperatures, time remaining and an estimated finish time.

Printers can be found two ways, and you can use both together:

- **Bambu Cloud** (recommended): sign in once and every printer on your account appears
  automatically, including printers you add later. Status comes through Bambu's cloud, so
  you don't need any IP addresses or access codes.
- **LAN**: list printers in `printers.json` with their IP address. Status is read directly
  from the printer, without going through the cloud.

## Setup

Requires Node.js 18+.

```
npm install
npm run login     # sign in to Bambu Cloud (one time)
npm start
```

Then open http://localhost:3000. To use a different port, set `PORT` first, e.g. `$env:PORT=8080; npm start`.

To try the UI without any printers, run `npm run demo`.

### Bambu Cloud sign-in

`npm run login` asks for your region, email and password. If your account uses Google or
Apple sign-in, leave the password blank and you'll be emailed a code instead. If Bambu
emails you a verification code, or your account has two-factor authentication, you'll be
asked for that code too.

Only the resulting token is saved, in `bambu-cloud.json`, and your password is not stored.
Treat that file like a password anyway: it gives access to your Bambu account. The token
lasts about three months, and the server tries to renew it automatically. If the dashboard
says the sign-in expired, run `npm run login` again.

The printer list is re-checked every 10 minutes.

### printers.json (optional with cloud, required without it)

Copy `printers.example.json` to `printers.json`. Entries are matched by `serial`:

- `name` / `model`: override what the cloud reports.
- `ip`: read this printer over your LAN instead of the cloud. With cloud sign-in the
  access code is filled in automatically. Without cloud, also set `accessCode` (on the
  printer under Settings → Network / WLAN).
- A printer that isn't on your Bambu account needs `serial`, `ip` and `accessCode`.

Give LAN printers a DHCP reservation in your router so their IP stays the same.

## Notes

- The dashboard only reads status. It never sends print or motion commands.
- **LAN Only Mode** disconnects a printer from Bambu Cloud, so such a printer shows as
  offline via the cloud. Give it an `ip` in `printers.json` and it will be read locally instead.
- On recent firmware, reading a printer over the LAN may require LAN Only Mode and/or
  Developer Mode. If a LAN printer says "Access code rejected", check this first.
- Each printer allows only a few simultaneous local MQTT connections. If several local tools
  are connected to the same printer at once, some of them may be refused.
- "Time remaining" comes from the printer's own estimate. Between updates the page counts it
  down locally.
- The server listens on all interfaces, so other devices on your network (a wall tablet, your
  phone) can open `http://<this-pc-ip>:3000`. Windows Firewall may ask you to allow Node.
