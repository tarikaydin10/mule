# Fracht-Dock „Pier 9“

Map-Konzept für Meilenstein 1, zweite Fassung. Ein Containerterminal bei Nacht als Routennetz: drei Wege zurück, zwei Plätze für jede Beute, Wachen mit Gewohnheiten und eine Umgebung, die der Spieler lesen und an zwei Stellen umschalten kann.

Die erste Fassung war eine Gabel mit zwei reinen Routen, auf denen die Beute die Entscheidung vorwegnahm. Diese Fassung setzt Preise statt Regeln: Jeder Weg ist mit jeder Beute gangbar, nur verschieden teuer.

## Prinzipien

1. **Netz statt Gabel.** Jeder Raum hat mindestens zwei Ausgänge. Schleifen statt Warten. Sackgassen nur als Taschen mit Versteck.
2. **Preise statt Regeln.** Der Block durch die helle Galerie geht, wenn das Licht aus ist. Die warme Probe durch den Hof geht, wenn man schnell ist.
3. **Systeme überlappen.** Ein Wurf zieht die Wache aus dem Lichtkegel, ein Schalter macht den Steg dunkel und die Patrouille neugierig.
4. **Lesbar, bevor gefährlich.** Kegel, Kamerakegel, Lichtflecken, Geräuschringe sind sichtbar, bevor sie wirken.
5. **Alarm ist Jagd, nicht Ende.** Sichtlinie brechen, verstecken, abwarten. Wachen beruhigen sich in Stufen.
6. **Die Umgebung folgt Logik.** Kameras stehen im Dunkeln draußen, Menschen und Licht bewachen drinnen. Licht brennt, wo gearbeitet wird.

## Räume

Karte 100 × 60 Kacheln, oben das Hafenbecken, das Boot am Westkai, die Ziele im Osten. Koordinaten in Kacheln, Ursprung oben links; im Tiled-JSON liegen zwei Wasserzeilen darüber.

| Raum | Lage | Licht | Geräusch | Was dort gilt |
|---|---|---|---|---|
| Zufahrt | x0–22, y40–58 | Torlampe 0,5 | Westgasse Gitter ×1,6 | Einstieg am Zaun, Lampe auf dem direkten Weg |
| Pumpenhaus | x0–22, y18–40 | dunkel | Pumpen −30 % | Zickzack zwischen Rohren, Kamera am Nordausgang |
| Kai | x0–22, y2–18 | Laterne 0,6 an der Hütte | – | Boot im Dunkeln, Hafenmeister-Posten in der Hütte, Kai-Wache auf Runde |
| Kaimauer-Gasse | x18–22, y6–18 | dunkel | – | zwei Kacheln breit, Poller als Deckung, Ende im Laternenlicht |
| Technikraum | x19–22, y2–6 | dunkel | – | Lichtschalter der Galerie, Westtreppe |
| Zollgalerie | x22–80, y2–6 | 1,0, schaltbar | – | drei Fensterbänder zur Halle (x26–36, 42–48, 54–62), dunkler Vorraum am Ostende |
| Treppenhaus | x77–80, y6–20 | dunkel | – | Treppenkamera blickt die Treppe hinunter |
| Lagerhalle | x22–66, y6–26 | Notlicht 0,25 im Mittelgang | Rampen Gitter ×1,6 | drei Gänge, Regale, Westtor zur Kaimauer, zwei Rampen, Ostausgang |
| Zollprüfstelle | x22–30, y19–25 | Arbeitslampe 0,6 | – | Block B unter der Lampe, Stapler als Deckung |
| Kühlhaus | x66–78, y6–20 | dunkel | Kompressoren −50 %, schaltbar | Probe A hinter dem Kompressor, Schalter an der Tür |
| Kreuzung | x66–100, y20–24 | dunkel | – | Hub mit Schildern: Kühlhaus, Galerie, Zoll |
| Zollbüro | x84–97, y24–36 | 0,9 | – | Glasfront zum Korridor, Frachtpapiere, Serverraum dahinter (0,2) mit Block A und Hintertür |
| Seitengasse | x97–100, y24–44 | dunkel | – | Runde des Paars Tor, Hintertür, Weg in den Hof |
| Torhaus | x88–97, y36–44 | 0,4 | – | Pförtner-Posten am Fenster, Zollkasse in seinem Rücken |
| Verladezone | x22–100, y26–30 | Ostrampe 0,7 | Gitter an beiden Rampen | Stapler vor der Ostrampe, Mast Ost |
| Containerhof | x22–100, y30–58 | Tank 0,7 | Generator −40 % | drei Containerreihen, zwei offene Container, Kranhaus mit Fenster, Kühlcontainer mit Probe B |

## Rückwege

| Weg | Verlauf | Bewacht durch | Blind für | Werkzeug |
|---|---|---|---|---|
| Nord | Treppenhaus → Galerie → Technikraum → Kai | Paar Halle durch die Fenster, Treppenkamera | Kameras auf dem Steg, kalte Ware | Lichtschalter (holt das Paar Halle hoch), Wurf |
| Mitte | Halle → Westtor → Kaimauer-Gasse → Kai-Ecke | Paar Halle im Südgang, Kai-Wache jede zweite Runde in der Gasse | alle Kameras | Timing, Poller, Takedown |
| Süd | Seitengasse → Verladezone → Hofgassen → Westgasse → Zufahrt → Pumpenhaus → Kai | fünf Kameras (eine unumgehbar), Pförtner, Paar Hof, Arbeitslicht, Gitter | kalte Ware, Dunkelheit | Verstecke, dunkle Westrampe, Generatorlärm |

Kosten je Beute:

| Weg | Server-Block | Kryoprobe |
|---|---|---|
| Nord | 18 s im Licht ohne Wärmebild; mit Licht aus ein dunkler Steg mit neugieriger Patrouille | kürzester Weg, Kameras egal; Treppenkamera zählt nur beim zweiten Gang |
| Mitte | dunkel und kameralos, aber eng: Begegnung mit der Kai-Wache heißt Rückzug | kameralos, Umweg durch die Halle kostet 10 s Auftauzeit |
| Süd | der lange Heimweg, Wachen sehen 3 Kacheln, Kameras nichts | ab etwa 24 s sichtbar; nur mit Probe B und sofortigem Aufbruch |

Mit Platz B dreht sich das Bild: Block B liegt am Westtor, für ihn ist Mitte kurz. Probe B liegt im Hof, für sie ist Süd die Versuchung.

Entscheidungspunkte: Zufahrt (Hof oder Umweg über Kai und Galerie zum Scouten) · Verladezone (helle Ostrampe oder dunkle Westrampe) · Kreuzung (Ziel und Rückweg) · Kai-Ecke (warten, werfen, Licht meiden).

## Verben

Siehe CLAUDE.md, Abschnitt Spieler-Verben. Takedown, Wurf, Verstecken, Schalten. Jedes Werkzeug öffnet ein Fenster und zahlt mit Aufmerksamkeit.

Schalter: Technikraum schaltet die Galerie dunkel und ruft das Paar Halle nach oben. Kühlhaus schaltet den Kompressor ab, die Maskierung fällt, der Knall ruft das Paar Halle an die Tür.

Verstecke: offener Container in der ersten Reihe, offener Container in der dritten Reihe, Kranhaus.

## Wachen

| Wache | Art | Revier | Gewohnheit |
|---|---|---|---|
| Paar Halle | Paar | Nord- und Südgang, 42 s | Plauderpunkt unter den Fenstern oder am Ostausgang |
| Paar Hof | Paar | äußere Gassen, 40 s | Plauderpunkt am Tank oder an der Westrampe |
| Paar Tor | Paar | Korridor, Seitengasse, Torhaus, 29 s | einer steht am Bürofenster, der andere geht |
| Pförtner | Posten | Torhausfenster, Blick nach Norden | 120 Grad Bogen |
| Hafenmeister | Posten | Hütte, Fenster nach Süden | sieht die Kai-Ecke |
| Kai-Wache | einzeln | Runde um die Hütte, 16 s | jede zweite Runde durch die Kaimauer-Gasse, zufällig |

Zustände: Patrouille (mit Wartezeiten), Posten (Bogen), Verdacht, Suche (im Paar geteilt: einer geht, einer bleibt in Sicht), Alarm (Sichtlinie 4 s gebrochen führt in die Suche), wachsam (60 s weiterer Kegel und schnellerer Verdacht, Rückkehr an zufälligen Routenpunkt), am Boden (wird gefunden, Fund heißt Alarm).

Konvergenz mit Maß: Partner kommt immer, Kameras rufen alle, eine einzelne Wache holt nur ihren Partner.

## Kameras

| Kamera | Position, Blick | Reichweite | Rolle |
|---|---|---|---|
| Treppenkamera | (78, 7), nach unten | 9 Kacheln | verunreinigt Nord beim zweiten Gang |
| Mast Ost | (64, 28), nach Westen | 12 Kacheln | macht die helle Ostrampe doppelt teuer |
| Mast Süd | (46, 57), nach oben | 9 Kacheln | zwingt in die Außengassen |
| Tor-Kamera | (86, 45), nach Westen | 9 Kacheln | Probe B startet unter Beobachtung, kalt |
| Pumpenhaus | (10, 19), nach unten | 9 Kacheln | der unumgehbare Preis des Südwegs |

## Zufall, Nebenbeute, Wert

Pro Lauf gezogen: Platz A oder B jeder Beute, Plauderpunkt jedes Paars, Umweg der Kai-Wache pro Runde. Seed im Zustand. Debug-Fixierung (Tasten 1, 2, 0) für den Gate-Test.

Nebenbeute: Frachtpapiere im Zollbüro (800), Zollkasse im Torhaus (1200). Einhändig, ohne Regel. Werte der Hauptziele nach dem Gate-Test; Erwartung: der Block ist der schwerere Lauf.

## Dramaturgie

0–30 s Einstieg (Zaun, Torlampe, erste Kamera tut nichts) · 30–90 s Annäherung (Verladezone, erstes Paar, Rampenwahl) · 90–150 s Ziele (Kreuzung, Wärmebild, Wahl) · 150–300 s Rückweg · bis 420 s Gier und Ausstieg.

## Fairness-Regeln

1. Sichtbar, bevor gefährlich.
2. Entdeckung dauert auf Distanz mindestens eine Sekunde, sofort nur auf Armlänge.
3. Alarm hat einen Ausgang: Sichtlinie 4 s brechen führt in die Suche, Verstecke beenden jede Jagd.
4. Kein Raum ohne zweiten Ausgang; Ausnahmen sind Taschen mit Versteck.
5. Jeder Weg für jede Beute. Preise, keine Verbote.
6. Werkzeuge haben Preise.
7. Die Welt erklärt sich selbst.

## Aufbau

1. **Rohbau und Netz:** Räume, drei Rückwege, Türen, beide Beute-Plätze, Nebenbeute, Extraktion, Lichtzonen, Schilder, Map-Auswahl. Fertig, wenn alle Wege begehbar sind und die Laufzeiten stimmen (Probe Nord unter 25 s, Block Süd unter 60 s).
2. **Wachen mit Gewohnheiten:** Wartezeiten, Plauderpunkte, Posten, wachsam, geteilte Suche, Rückkehr an zufälligen Punkt, Fund am Boden. Fertig, wenn jedes Fenster lernbar ist und ein Alarm mit Sichtlinienbruch endet.
3. **Sensorik und Zonen:** Glas, fünf Kameras, Zonenwerte, Auftauzeit 50 s. Fertig, wenn jede Kamera genau trifft, was die Tabelle sagt.
4. **Verben:** Takedown mit Fund, Wurf, Verstecke, Schalter mit Folgen. Fertig, wenn jeder Weg mit jeder Beute mit dem passenden Werkzeug schaffbar ist.
5. **Zufall und Feinschliff:** Seed, Varianten, Debug-Fixierung, Werte, Gate-Test mit 1 und 2.
6. **Nach dem Gate:** Alarmstufe (Paar Tor sperrt die Kreuzung), hörbare Wachenschritte, Hinweise ab dem Vertical Slice.

## Entscheidungen

Fensterbänder statt Vollglas · Hintertür am Serverraum · Verstecke sind drin · zwei Schalter, nicht mehr · Werte nach dem Gate-Test.
