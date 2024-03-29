![Logo](admin/dect.png)

# ioBroker.fritzboxdect

## Fritzboxdect adapter for ioBroker

Adapter for Fritzbox DECT Devices

## Allgemeine Infos
* Die G�ltigkeit der SID wird bei jeder Aktion �berpr�ft. Dadurch h�lt ein Login bis die Fritzbox wegen anderen Login Fehler alle Benutzer kurz sperrt.
* Befehle w�hrend der Login-Sperre werden gehalten und versendet, sobald die Verbindung zur Fritzbox wieder hergestellt wird.
* Es werden nur Datenpunkte aktuallisert die sich ge�ndert haben.

## Konfig
* IP (Pflichtfeld)
  Hier bitte nur die IP eintragen. Bsp.: 192.168.178.1

* Benutzname (Pflichtfeld)
  Bitte einen Benutzer in der Fritzbox mit den Rechten Smart Home, Einstellungen und APP anlegen

* Passwort (Pflichtfeld)
  Das Passwort vom angelegten Benutzer

* Intervall DECT (Pflichtfeld)
  Datenpunkte der DECT Ger�te und Gruppen aktualisieren (optimal sind 2 Sekunden)

* Intervall komplett DECT (Pflichtfeld)
  Alle Datenpunkte werden aktualisiert auch wenn nicht ge�ndert wurde (Eingabe in Stunde)

* Intervall Template (Pflichtfeld)
  Wie oft sollen die Templates aktualisiert werden (Eingabe in Stunden - 1 x am Tag sollte reichen)

* Booster Zeit
  Zeit die bei hkr.boostactive angewendet werden soll (Thermostate)

* Open minutes
  Zeit die bei hkr.windowopenactiv angewendet werden soll (Thermostate)

* HTTPS verwenden
  Verwendung von HTTPS

* Fritzbox Objekte aktualisieren
  Sollte nach einem Update oder Nemens�nderung von Aktoren gesetzt werden

## Bekannte Ger�te
## FRITZ!DECT 200/210
*  Datenpunkte die gesetzt werden k�nnen
   - powermeter.loadpowerstatic: L�dt die Power Statistik (Neues Objekt devicestats wird angelegt)
   - simpleonoff.state: 0=off 1=on 2=toggle
   - switch.state: Aktor an/aus
   - temperature.loadtempstatic: L�dt die Temperatur Statistik (Neues Objekt devicestats wird angelegt)
   - name: Name vom Aktor �ndern
   - F�r Alexa: switch.state + temperature.celsius um auch die Temperatur ansagen zu lassen

## FRITZ!DECT 301/301 und Comet
*  Datenpunkte die gesetzt werden k�nnen
   - hkr.boostactive: Booster Heizung aktivieren - Zeit wird aus der Konfig genommen
   - hkr.boostactiveendtime: Booster Zeit in Minuten eingeben
   - hkr.windowopenactiv: Fentser offen Modus aktivieren - Zeit wird aus der Konfig genommen
   - hkr.windowopenactiveendtime: Zeit f�r Fenster offen Modus in Minuten eintragen
   - hkr.alexapower: True f�r Auto und false f�r Aus
   - hkr.alexaparty: True f�r 8 Grad und false f�r Auto
   - hkr.alexamode: 1 f�r Auto und 0 f�r Aus
   - hkr.tsoll: Einstellung Thermostat - 8 bis 28�C - on/off - open/closed - true/false - 0=auto, 1=closed, 2=open - 254(open)/253(closed)
   - temperature.loadtempstatic: L�dt die Temperatur Statistik (Neues Objekt devicestats wird angelegt)
     ACHTUNG! open, true, 2 und 254 setzen das HKT auf Max. 28 Grad.
   - name: Name vom Aktor �ndern
   - F�r Alexa: hkr.tsoll, temperature.celsius, hkr.alexamode, hkr.alexaparty, hkr.alexapower hkr.boostactive

## FRITZ!Powerline 546E
*  Datenpunkte die gesetzt werden k�nnen
   - powermeter.loadpowerstatic: L�dt die Power Statistik (Neues Objekt devicestats wird angelegt)
   - switch.state: Aktor an/aus
   - name: Name vom Aktor �ndern
   - F�r Alexa: switch.state

## FRITZ!DECT Repeater 100
*  Datenpunkte die gesetzt werden k�nnen
   - name: Name vom Aktor �ndern

## FRITZ!DECT 400
*  Datenpunkte die gesetzt werden k�nnen
   - name: Name vom Aktor �ndern
   - button.?.name: Name vom Button �ndern

## FRITZ!DECT 440
*  Datenpunkte die gesetzt werden k�nnen
   - name: Name vom Aktor �ndern
   - button.?.name: Name vom Button �ndern
   - F�r Alexa: celsius und rel_humidity f�r die jeweilige Abfrage

## FRITZ!DECT 500
*  Datenpunkte die gesetzt werden k�nnen
   - colorcontrol.loadcolor: L�dt die m�glichen Farben (Neues Objekt devicecolor wird angelegt)
   - colorcontrol.saturation und colorcontrol.hue f�r die Farben. Achtung!! Erst saturation und sofort hue setzen. Der trigger liegt bei hue und saturation wird ausgelesen.
   - colorcontrol.temperature: Setzen der Farbtemperatur
   - colorcontrol.alexaonoff: Licht An oder Aus
   - colorcontrol.huealexa: RGB
   - levelcontrol.level: Licht dimmen 0 (0%) bis 255 (100%)
   - levelcontrol.levelpercentage: Licht dimmen 0% - 100%
   - simpleonoff.state: 0=off 1=on 2=toggle
   - name: Name vom Aktor �ndern
   - F�r Alexa: colorcontrol.temperature, colorcontrol.alexaonoff, colorcontrol.huealexa und levelcontrol.levelpercentage

## Rollotron 1213
*  Datenpunkte die gesetzt werden k�nnen
   - levelcontrol.alexaclose: True = Rolllade schlie�en
   - levelcontrol.alexalevel: 0%=geschlossen und 100%=ge�ffnet
   - levelcontrol.alexaopen: True = Rolllade �ffnen
   - levelcontrol.alexastop: True = Stoppen
   - levelcontrol.level: 0(0%)=ge�ffnet und 255(100%)=geschlossen
   - levelcontrol.levelpercentage: 0%=ge�ffnet und 100%=geschlossen
   - name: Name vom Aktor �ndern
   - F�r Alexa: levelcontrol.alexavalue, levelcontrol.alexaclose, levelcontrol.alexalevel, levelcontrol.alexaopen und levelcontrol.alexastop

## HAN-FUN T�r/Fensterkontakt
*  Datenpunkte die gesetzt werden k�nnen
   - name: Name vom Aktor �ndern
   - F�r Alexa: alert.state

## Changelog

### 0.0.1

* (Lucky-ESA) initial release

## License

MIT License

Copyright (c) 2021 Lucky-ESA <lucky@luckyskills.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
