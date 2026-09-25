# Deployment

MULE ist ein statisches Bundle und läuft wie Kartei auf der Hetzner-CX23 hinter dem Edge-Caddy (`/srv/edge`, siehe Ryadom `deploy/edge/`). Für das Spiel läuft **kein Prozess und kein Container**. Der Edge-Caddy liefert die Dateien direkt aus `/srv/static` aus, ein Deploy ist ein Symlink-Wechsel.

```
/srv/static/mule/releases/<zeit>-<commit>/   ← eine Release
/srv/static/mule/current -> releases/…       ← was ausgeliefert wird
/srv/edge/conf.d/mule.caddy                  ← die Site
```

Jeder Push auf `main` läuft durch `.github/workflows/ci.yml`:

1. `npm ci`, `npm test`, `npm run build`
2. `dist/` per `rsync` in eine neue Release hochladen
3. `current` atomar umhängen, die fünf neuesten Releases bleiben für Rollbacks liegen
4. Prüfen, dass `https://<DOMAIN>/` genau dieses Build ausliefert und alle Bundles laden

Andere Branches werden nur getestet und gebaut. Solange die Variable `DOMAIN` fehlt, wird der Deploy übersprungen und der Build meldet das als Hinweis.

---

## Einmalig auf dem Server

Als root auf der CX23:

```bash
# 1. Verzeichnis für den Deploy-Benutzer
mkdir -p /srv/static/mule/releases
chown -R deploy:deploy /srv/static/mule

# 2. Der Edge-Caddy muss /srv/static sehen. Seit Kartei ist das eingerichtet; prüfen:
grep -n '/srv/static' /srv/edge/docker-compose.yml
#    Keine Ausgabe? Dann unter caddy.volumes ergänzen:
#      - /srv/static:/srv/static:ro
#    und danach: cd /srv/edge && docker compose up -d

# 3. Site-Datei ablegen und Caddy neu laden
curl -fsSL https://raw.githubusercontent.com/tarikaydin10/mule/main/deploy/mule.caddy \
  -o /srv/edge/conf.d/mule.caddy
docker exec edge-caddy caddy reload --config /etc/caddy/Caddyfile
```

Ein Syntaxfehler lässt den Reload fehlschlagen und die laufende Konfiguration unangetastet. Ryadom, Kartei und alles andere hinter dem Edge-Caddy bleiben davon unberührt.

## DNS bei ALL-INKL

Im **KAS** unter `Domain` → `klick-profi.de` → `DNS-Einstellungen`:

| Name   | Typ    | Wert                     |
| ------ | ------ | ------------------------ |
| `mule` | `A`    | IPv4 der CX23            |
| `mule` | `AAAA` | IPv6 der CX23 (optional) |

**Nicht** unter „Subdomain anlegen" eine Subdomain auf dem ALL-INKL-Webspace erzeugen. Das legt einen konkurrierenden A-Record auf den KAS-Server an.

```bash
nslookup mule.klick-profi.de
```

Sobald der Name auf die CX23 zeigt, holt der Edge-Caddy das Zertifikat selbst.

## Deploy-Schlüssel

Ein eigener Schlüssel nur für dieses Repo, damit er sich einzeln sperren lässt. Am einfachsten auf dem Server erzeugen:

```bash
ssh-keygen -t ed25519 -f /tmp/k -C github-actions-mule -N ''
# restrict: keine Port-Weiterleitung, kein Terminal; rsync und ssh-Kommandos gehen weiter
echo "restrict $(cat /tmp/k.pub)" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys && chmod 600 /home/deploy/.ssh/authorized_keys

echo "── SSH_PRIVATE_KEY_B64 (eine Zeile) ──"
base64 -w0 /tmp/k; echo
echo "── SSH_KNOWN_HOSTS ──"
echo "DEINE_SERVER_IP $(cut -d' ' -f1,2 /etc/ssh/ssh_host_ed25519_key.pub)"

shred -u /tmp/k /tmp/k.pub
```

`DEINE_SERVER_IP` durch genau den Wert ersetzen, der auch in `SSH_HOST` steht. Bei einem anderen SSH-Port als 22 lautet der Anfang `[IP]:PORT`. `SSH_HOST` und `SSH_KNOWN_HOSTS` sind dieselben Werte wie bei Ryadom, weil es derselbe Server ist.

## GitHub

**Settings → Secrets and variables → Actions**

| Typ | Name | Wert |
|---|---|---|
| Secret | `SSH_PRIVATE_KEY_B64` | Ausgabe von `base64 -w0 /tmp/k` |
| Secret | `SSH_KNOWN_HOSTS` | die Zeile von oben |
| Secret | `SSH_HOST` | IP der CX23 |
| Variable | `DOMAIN` | `mule.klick-profi.de` |
| Secret | `SSH_USER` | nur falls nicht `deploy` |
| Variable | `SSH_PORT` | nur falls nicht 22 |
| Variable | `DEPLOY_PATH` | nur falls nicht `/srv/static/mule` |

`DOMAIN` muss im **Variables**-Reiter stehen: Die CI entscheidet daran, ob überhaupt deployt wird, und diese Entscheidung kann keine Secrets lesen. Die SSH-Werte werden aus beiden Reitern gelesen.

Danach deployt jeder Push auf `main`. Von Hand geht es über Actions → CI → Run workflow auf `main`.

## Rollback

```bash
ssh deploy@<CX23> 'ls -1 /srv/static/mule/releases'
ssh deploy@<CX23> 'cd /srv/static/mule && ln -sfn releases/<RELEASE> current.tmp && mv -Tf current.tmp current'
```

Kein Reload nötig, Caddy folgt dem Symlink pro Anfrage. Der nächste Push auf `main` stellt wieder auf das neueste Build um.

## Andere Domain

Domain in `deploy/mule.caddy` und in der Variable `DOMAIN` ändern, Site-Datei neu ablegen, Caddy neu laden.
