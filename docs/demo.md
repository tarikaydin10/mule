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
| 0–15 s | Kaimauer, Van mit Namen direkt hinter sich, Laterne, Schild „Zoll-Lager →“, in der Ferne ein Lichtkegel, der über den Hof wandert | Da geht es lang. Das ist eine Wache. | läuft los |
| 15–40 s | Der Weg führt an einer Kiste vorbei („Kiste · Versteck“), eine Wache kommt frontal entgegen, die Hinweiszeile sagt „E: verstecken“ | Verstecken ist ein Werkzeug. | versteckt sich, die Wache läuft vorbei. Wer es nicht tut: Balken füllt sich, Wache kommt nachsehen, noch kein Alarm |
| 40–60 s | Kreuzung im Lager. Beide Zielmarker mit Entfernung; links Kühlhaus-Schild und Kompressorbrummen, rechts Bürolicht. Ein Schalter neben der Hoflampe („Schalter · Hoflicht“) | Die Wahl. Der Schalter macht etwas mit dem Licht. | wählt eine Richtung |
| 60–120 s | Das Ziel: Block hinter dem Paar im Büro, Probe im Kühlhaus hinter der Wärmekamera | Der Preis steht in der Hinweiszeile: langsam, beide Hände / taut auf | hebt auf |
| 120–200 s | Rückweg: mit Block kein Wärmebild, kein Takedown, kein Wurf, halbes Tempo; mit Probe Temperatur in Prozent und eine Wärmekamera am Steg | Die Beute verändert die Regeln. | wählt den Rückweg |
| bis 240 s | Van, F. Endbildschirm: Wert, Zeit, „nochmal mit der anderen Beute?“ | Wiederholen lohnt. | R oder 1/2 |

## Aufbau

- **D1 Affordance-Schicht**, map-unabhängig: Briefing mit Lageplan · Karte auf Tab · Zielmarker mit Pfeilen am Bildschirmrand · Namen an allen Objekten · Statuszeile antwortet auf Ereignisse · Endbildschirm mit Empfehlung.
- **D2 Demo-Map**: kompakt, etwa 60 × 40 Kacheln, aus dem Drehbuch gebaut; der Einstieg lehrt jedes Werkzeug einmal. Pier 9 bleibt unter `?map=pier9` als Materiallager.
- **D3 Feinschliff**: Werte, Zeiten, Test mit einem Fremden. Danach das Gate aus der Roadmap.

## Was das für die Daten heißt

- Die Map trägt ihr Briefing (`briefing`, Map-Property). Beuten tragen ihren Ort (`place`, z. B. „Büro Süd“). Verstecke und Schalter tragen einen Namen für den Spieler (`label`).
- Der Lageplan ist die Kollisionsschicht, klein gezeichnet. Kein zweites Datenformat.
