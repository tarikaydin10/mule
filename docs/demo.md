# Demo: die ersten drei Minuten

Pier 9 ist aus einer Raumtabelle gebaut. Wer spawnt, sieht ein dunkles Eck und ein paar Rechtecke und weiß weder, wo er ist, noch was er will, noch was die Dinge sind. Die Demo dreht die Reihenfolge um: erst das Erlebnis, Sekunde für Sekunde, dann die Map dazu.

## Regeln

1. In jeder Sekunde weiß der Spieler: Wo bin ich, was will ich, was kann ich hier tun.
2. Jedes Objekt trägt seinen Namen, sobald der Spieler es sehen kann. Text ist erlaubt; er benennt die Welt (Kiste · Versteck), nicht die Tasten. Tasten stehen im Briefing und in der Hinweiszeile, die immer nur sagt, was jetzt geht.
3. Ziele sind immer markiert, auch durch Wände und Dunkelheit: Beute und Van mit Richtung und Entfernung am Bildschirmrand.
4. Gefahr zeigt sich, bevor sie gefährlich ist: Lichtkegel, Kamerakegel, Verdachtsbalken, Geräuschringe.
5. Jede Handlung bekommt eine Antwort in der Welt und in einem Satz in der Statuszeile: „Hoflicht aus. Zwei Wachen kommen nachsehen.“
6. Ein Lauf dauert zwei bis vier Minuten. Wer erwischt wird, ist mit einer Taste wieder drin.

## Drehbuch

| Zeit | Der Spieler sieht | Er versteht | Er tut |
|---|---|---|---|
| 0 s | Briefing: Titel, drei Sätze Auftrag, Lageplan mit Du, Van und beiden Zielen samt Wert, Tastenleiste | Zwei Ziele, ich wähle vor Ort. Rein hier, raus da. | Enter |
| 0–15 s | Kai im Laternenlicht, das Boot mit Namen direkt hinter sich, Schild „Hof →“, ein Posten am Fuß des Stegs mit dem Rücken zum Spieler, in der Gasse ein Lichtkegel, der näher kommt | Da geht es lang. Das sind Wachen, und die eine sieht mich nicht. | läuft los, in die Gasse oder zum Posten |
| 15–40 s | Gasse: die Wache kommt frontal entgegen, neben dem Weg ein offener Container („Offener Container · Versteck“), die Hinweiszeile sagt „E: verstecken“. Oder Steg: mit Shift angeschlichen, „Q: Takedown“ am Posten; wer läuft, wird gehört, und der Posten dreht sich um | Verstecken, Schleichen und Takedown sind Werkzeuge. | versteckt sich, die Wache steht drei Sekunden daneben und dreht um. Wer es nicht tut: Balken füllt sich, Wache kommt nachsehen, noch kein Alarm |
| 40–60 s | Hof: das Paar läuft durch das Hoflicht, der Schalter daneben („Hoflicht · Schalter“), am Tor das Schild „Büro · Lager · Kühlhaus“; beide Zielmarker mit Entfernung | Die Wahl. Der Schalter macht den Hof dunkel, und das Paar kommt nachsehen. | wählt eine Richtung |
| 60–120 s | Das Ziel: Block im Serverraum hinter dem Paar im Büro (Fensterband zum Gang, Bürolicht-Schalter am Gang, Container zum Verstecken daneben); Probe im Kühlhaus hinter dem Kompressor | Der Preis steht in der Hinweiszeile: beide Hände, Tempo 60 % / taut auf | hebt auf |
| 120–200 s | Rückweg: der Steg ist kurz, aber die Wärmekamera oben sieht die warme Probe, und der Posten steht unten, falls er noch steht; der Hof ist lang, mit dem Paar und einer Wärmekamera an der Gasse. Mit Block kein Wärmebild, kein Takedown, kein Wurf | Die Beute verändert die Regeln: für den Block muss der Posten vorher weg, für die Probe zählt die Zeit. | wählt den Rückweg |
| bis 240 s | Boot, F. Endbildschirm: Wert, Zeit, „nochmal mit der anderen Beute?“ | Wiederholen lohnt. | R oder 1/2 |

## Aufbau

- **D1 Affordance-Schicht**, map-unabhängig: Briefing mit Lageplan · Karte auf Tab · Zielmarker mit Pfeilen am Bildschirmrand · Namen an allen Objekten · Statuszeile antwortet auf Ereignisse · Endbildschirm mit Empfehlung.
- **D2 Demo-Map** (`public/maps/demo.json`, Generator `scripts/make-demo.mjs`): 60 × 40 Kacheln, aus dem Drehbuch gebaut; der Einstieg lehrt jedes Werkzeug einmal. Pier 9 bleibt unter `?map=pier9` als Materiallager.
- **D3 Feinschliff**: Werte, Zeiten, Test mit einem Fremden. Danach das Gate aus der Roadmap.

## Was das für die Daten heißt

- Die Map trägt ihr Briefing (`briefing`, Map-Property). Beuten tragen ihren Ort (`place`, z. B. „Büro Süd“). Verstecke und Schalter tragen einen Namen für den Spieler (`label`).
- Der Lageplan ist die Kollisionsschicht, klein gezeichnet. Kein zweites Datenformat.

## Die Demo-Map

Westen ist Wasser. Am Kai (Südwesten) liegen Boot, Spawn und Laterne. Von dort führen zwei Wege: der Steg am Wasser nach Norden direkt zum Gang der drei Räume, mit einem Posten am Fuß (Rücken zum Kai) und einer Wärmekamera oben; und die Gasse nach Osten in den Hof, mit einer Wache, die bis zum offenen Container vorläuft und dort drei Sekunden steht, und einer Wärmekamera am Hofende der Gasse.

Der Hof (Süden, Mitte) hat zwei Containerreihen, einen offenen Container, ein Paar auf einer großen Runde mit Plauderpunkt, das Hoflicht unter dem Tor und den Schalter daneben. Durch das Tor geht es in den Gang (Notlicht) mit den drei Räumen: Büro (Westen, hell, Paar, Fensterband, Schalter am Gang, offener Container in der Wand) mit dem Serverraum und dem Block dahinter; Lager (Mitte, dunkel, Regale, eine Wache, Zollkasse); Kühlhaus (Osten, dunkel, Kompressor maskiert Schritte, Probe dahinter).

Preise: Der Steg ist der kurze Rückweg. Mit der Probe sieht ihn die Kamera nach etwa 25 s Tragen; mit dem Block ist er nur offen, wenn der Posten vorher weg ist, denn mit dem Block gibt es keinen Takedown und keinen Wurf. Der Hof ist der lange Rückweg mit dem Paar; das Hoflicht aus macht ihn dunkel, ruft aber das Paar an den Schalter.
