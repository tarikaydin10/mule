# Deployment

Jeder Push auf `main` läuft durch GitHub Actions (`.github/workflows/ci.yml`):

1. `npm ci`, `npm test`, `npm run build`
2. `dist/` per `rsync` über SSH nach `/var/www/mule/releases/<zeit>-<commit>/` auf den Hetzner-VPS
3. Symlink `/var/www/mule/current` wird atomar auf das neue Release umgestellt, die fünf neuesten Releases bleiben für Rollbacks liegen
4. Caddy liefert `current` aus und kümmert sich selbst um das HTTPS-Zertifikat

Andere Branches werden nur getestet und gebaut. Solange die Variablen unten fehlen, wird der Deploy-Job übersprungen und der Build meldet das als Hinweis.

## Einmalige Einrichtung

### 1. DNS

Eine Subdomain, z. B. `mule.deinedomain.de`, als A-Record (und AAAA für IPv6) auf die IP des VPS zeigen lassen. Liegt die Domain bei All-Inkl: KAS → Tools → DNS-Einstellungen.

### 2. Server (Ubuntu/Debian, als root oder mit `sudo`)

Caddy aus dem offiziellen Repository installieren, damit es aktuell bleibt: <https://caddyserver.com/docs/install#debian-ubuntu-raspbian>

```sh
apt install -y rsync

# Deploy-Benutzer ohne Passwort-Login ('*' sperrt das Passwort, SSH-Keys funktionieren weiter)
useradd --create-home --shell /bin/bash --password '*' deploy
install -d -o deploy -g deploy -m 755 /var/www/mule /var/www/mule/releases
install -d -o deploy -g deploy -m 700 /home/deploy/.ssh
```

Den Site-Block aus `deploy/Caddyfile` an `/etc/caddy/Caddyfile` anhängen, die Domain ersetzen, dann:

```sh
caddy validate --config /etc/caddy/Caddyfile && systemctl reload caddy
```

Ports 80 und 443 müssen offen sein (auch in einer Hetzner-Cloud-Firewall, falls aktiv). SSH muss aus dem Internet erreichbar sein, weil GitHub-Runner wechselnde IPs haben.

Läuft auf dem VPS schon ein anderer Webserver (nginx, Traefik …), zeigt man ihn stattdessen auf `/var/www/mule/current` und übernimmt die beiden Cache-Regeln aus `deploy/Caddyfile`.

### 3. SSH-Key nur für GitHub Actions

Lokal:

```sh
ssh-keygen -t ed25519 -N "" -C "github-actions-mule" -f mule_deploy
```

Den Inhalt von `mule_deploy.pub` auf dem Server mit vorangestelltem `restrict` eintragen (keine Port-Weiterleitung, kein Terminal):

```sh
echo "restrict ssh-ed25519 AAAA...  github-actions-mule" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
```

Host-Key des Servers für `DEPLOY_KNOWN_HOSTS` holen und den Fingerprint vergleichen:

```sh
# lokal
ssh-keyscan -t ed25519 <host> | tee known_hosts.txt | ssh-keygen -lf -
# auf dem Server, muss denselben Fingerprint zeigen
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Bei einem anderen SSH-Port als 22: `ssh-keyscan -p <port> ...`.

### 4. GitHub

Repository → Settings → Secrets and variables → Actions. Die Variablen als **Repository variables** anlegen, nicht als Environment variables, sonst sieht der Workflow sie nicht.

| Name | Art | Wert |
|---|---|---|
| `DEPLOY_SSH_KEY` | Secret | Inhalt der privaten Datei `mule_deploy` |
| `DEPLOY_HOST` | Variable | IP oder Hostname des VPS |
| `DEPLOY_USER` | Variable | `deploy` |
| `DEPLOY_PATH` | Variable | `/var/www/mule` |
| `DEPLOY_KNOWN_HOSTS` | Variable | Inhalt von `known_hosts.txt` |
| `DEPLOY_URL` | Variable | `https://mule.deinedomain.de` |
| `DEPLOY_PORT` | Variable, optional | SSH-Port, Standard `22` |

Danach `mule_deploy` lokal löschen. Der nächste Push auf `main` deployt. Manuell geht es über Actions → CI → Run workflow auf `main`.

## Rollback

Auf dem Server als `deploy`:

```sh
cd /var/www/mule
ls releases
ln -sfn releases/<release> current.tmp && mv -Tf current.tmp current
```

Der nächste Push auf `main` stellt wieder auf das neueste Release um.
