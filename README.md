# Bibelraum

Lokale Weboberfläche für die Lutherbibel 1912. FastAPI und Qdrant laufen in Docker,
Ollama auf dem Mac nutzt die Apple-GPU über Metal. Keine Cloud-Anfragen für Fragen
oder Antworten, keine externen Schriftarten oder Frontend-CDNs.

## Start auf diesem Mac

Docker Desktop starten, dann:

```sh
cd /Users/lukajuric/Desktop/bible-rag
./scripts/start-mac.sh
```

**http://localhost:8000** öffnen. Beim ersten Start lädt das Skript bei Bedarf die
projektlokale Ollama-Version und fehlende Modelle herunter. Die bestehende
macOS-App wird nicht verändert. Modell- und Laufzeitdateien liegen unter
`.runtime/` und sind von Git ausgeschlossen.

Das Startskript ist nach einem Neustart des Macs erneut nötig. `docker compose up`
allein startet den nativen Ollama-Prozess nicht. Unter `.runtime/ollama.log`
stehen die Ollama-Logs. Stoppen: `./scripts/stop-mac.sh`.

## Benutzung

- Frage schreiben oder einen Themenvorschlag auswählen, dann „Antwort entdecken“.
- Die Antwort erscheint während der Generierung. „Stoppen“ bricht sie ab.
- Quellenmarker öffnen die passende Bibelstelle; alle gefundenen Stellen stehen
  unter „Zum Nachlesen“. Die Suche liefert eine Auswahl, keine vollständige
  Aussage über die gesamte Bibel.
- Fertige Antworten werden bis zu 20 Einträge in diesem Browser gespeichert.
  Auf breiten Ansichten sind sie links abrufbar. Auf schmalen Ansichten öffnet das
  Seitenleistensymbol den Verlauf. „Löschen“ entfernt ihn nach einer Bestätigung.
- Die Oberfläche verwendet die Systemschrift (San Francisco auf Apple-Geräten).
  „Darstellung“ bietet System, Hell und Dunkel. Die Wahl bleibt in diesem Browser
  gespeichert; im Systemmodus folgt sie dem Betriebssystem. Die Gestaltung folgt
  den [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/),
  mit Rücksicht auf Tastaturbedienung, reduzierte Bewegung und erhöhte Kontraste.
- Die Antwortzeit steht unter der Antwort; der Tooltip zeigt weitere Messwerte.
- Das Modell kann Auszüge falsch interpretieren. Die Originalstellen bleiben
  deshalb direkt zugänglich. Jede neue Frage ist unabhängig, ohne Chat-Kontext.

## Performance

- Chat: `qwen3:4b-instruct`, ohne zusätzlichen Denkmodus, maximal 512 Ausgabetokens.
- Embeddings: `qwen3-embedding:0.6b`, unverändert gegenüber dem vorhandenen Bestand.
- Suchfragen bekommen die von Qwen empfohlene `Instruct`-/`Query`-Struktur;
  die gespeicherten Dokumentvektoren bleiben unverändert. Siehe die
  [Modell-Dokumentation](https://huggingface.co/Qwen/Qwen3-Embedding-0.6B).
- Beide Modelle bleiben 30 Minuten geladen; maximal zwei geladene Modelle und eine
  Generierung je Modell. Der Embedding-Kontext für Suchfragen ist auf 4096 begrenzt.
- Echtes NDJSON-Streaming von Ollama bis zum Browser, kein Warten auf die gesamte Antwort.
- Browserabbruch schließt den laufenden Ollama-Stream. Bereits laufende kurze
  Embedding-/Suchoperationen können beim Abbruch noch zu Ende laufen.
- Native API: `127.0.0.1:11435`; Docker erreicht sie unter `host.docker.internal:11435`.
  Die Weboberfläche und Qdrant sind ebenfalls nur an Loopback gebunden.

GPU-Auslastung prüfen:

```sh
OLLAMA_HOST=127.0.0.1:11435 .runtime/ollama/ollama ps
```

Die Ausgabe sollte nach einer Frage für beide Modelle `100% GPU` zeigen.
Beim ersten Aufruf müssen die Modelle geladen werden. Weitere Fragen sind schneller.
Die ursprünglichen Docker-Modelle und der bestehende Qdrant-Bestand wurden erhalten.
Eine erneute Indexierung ist für diese Umstellung nicht nötig.

## API und Tests

`POST /ask` bleibt als JSON-API erhalten. `POST /ask/stream` liefert zeilenweise JSON:
`status`, `sources`, `token`, `done` (mit Messwerten), oder `error`.
Ein HTTP-200-Stream ist erst nach dem `done`-Ereignis erfolgreich abgeschlossen.
`GET /health` prüft Modellverfügbarkeit und Bibelbestand.

Für lesbare Umlaute in der Terminalausgabe:

```sh
curl -s http://localhost:8000/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"Was bedeutet Nächstenliebe?","top_k":5}' \
  | python3 -m json.tool --no-ensure-ascii
```

```sh
docker compose exec -T api python -m unittest discover -s tests -v
```

## Optional: vollständig in Docker, ohne Apple-GPU

```sh
OLLAMA_URL=http://ollama:11434 docker compose --profile cpu up -d --build
```

Dieser Modus ist auf macOS deutlich langsamer. Das normale Startskript schaltet
wieder auf natives Ollama um und stoppt den CPU-Container.

## Neu aufgesetzter Bibelbestand

Ein frischer Qdrant-Datenträger ist noch leer. `data/luth1912.json` bereitstellen
und `docker compose exec api python ingest.py` ausführen. Achtung: Das vorhandene
Ingest-Skript ersetzt die gesamte Collection; nicht zum normalen Start ausführen.
