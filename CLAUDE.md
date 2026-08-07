# CLAUDE.md — re-parma-treni

Dashboard treni regionali RE/Rubiera ↔ Parma. Contesto d'architettura per non
ri-derivarlo da zero in una sessione futura. Il README resta la doc utente
(italiano, "perché" di prodotto); qui solo cio' che serve per lavorare sul codice.

## Stack

Singolo `index.html` statico (CSS inline, JS inline), zero build, zero backend,
deploy GitHub Pages sotto subpath `/re-parma-treni/`. Nuovi file: `manifest.json`,
`service-worker.js`, `icon-192.png`/`icon-512.png`/`apple-touch-icon.png` (PWA).
Dev locale: `cd .. && python3 -m http.server 8901`, apri `/re-parma-treni/`
(mai dalla root del repo — non testerebbe i path relativi come sotto Pages).

## Fonte dati e pipeline

Fetch client-side a ViaggiaTreno (Trenitalia, API non ufficiale) via CORS-proxy
pubblico `proxy.cors.sh` (anonimo, nessuna API key — lc-debt, rischio 401/429,
upgrade path in README). Per ognuna delle 3 stazioni fisse (`STATIONS`):
`fetchPartenze()` → `collect()`/`collectFromParma()` (filtra `REG`) →
`buildRow()` (shape normalizzata per riga).

Per Reggio Emilia e Rubiera (verso Parma) la destinazione e' sempre 'Parma'
(`fallbackWest`/`WEST_HINTS` sul nome, nessuna ambiguita': Parma e' capolinea,
Rubiera come origine implica gia' la fermata a Rubiera). Per Parma (verso est)
**non** si deduce la destinazione dal nome del capolinea finale — vedi bug
storico sotto — `collectFromParma()` chiama `andamentoTreno` (fermate reali)
per ogni treno non chiaramente verso ovest (`isWestbound()`), cache in
`andamentoCache` per corsa/giorno (mai invalidata in sessione, si perde al
reload).

**`t.via` in `buildTrainLi()` e' dead code**: letto ma mai impostato da
`buildRow()`. Innocuo (sempre falsy), non serve cercarne l'origine.

## Bug storico: destinazione dedotta dal nome invece che dalle fermate reali (fix 2026-08-07)

La vecchia `fallbackEast()` assumeva che un treno diretto "oltre Rubiera"
(Modena/Bologna/Ancona/...) si fermasse anche a Rubiera, e che un treno con
destinazione non riconosciuta da nessuna hint list non fosse su questa
tratta. Entrambe le assunzioni sono **false**, verificato live il 2026-08-07
via `andamentoTreno/{codOrigine}/{numeroTreno}/{dataPartenzaTreno}`
(fermata-per-fermata, campi `fermate[].id`/`stazione`/`tipoFermata`/
`actualFermataType`):

- Treno 3929/3931 (Piacenza → Ancona): ferma a Reggio Emilia **ma salta
  Rubiera** — con la vecchia euristica sarebbe etichettato "Reggio Emilia e
  Rubiera", sbagliato.
- Treno 18131 (Piacenza → S.Benedetto del Tronto): stessa cosa (ferma a
  Reggio+Modena+Bologna, salta Rubiera), ma la sua destinazione non matchava
  nessuna hint → il treno era **invisibile** nella tab Parma.

Fix: `collectFromParma()` non guarda piu' il nome della destinazione finale
per decidere Rubiera vs Reggio Emilia, guarda le fermate reali. Le hint list
(`WEST_HINTS`) restano solo per escludere a costo zero i treni ovviamente
verso ovest, prima di spendere una chiamata `andamentoTreno`. **Non
reintrodurre una classificazione basata sul nome della destinazione finale.**

## Bug storico: offset timezone hardcoded (fix 2026-08-07)

`formatViaggiatrenoDate()` costruiva la stringa data/ora per l'API con offset
**hardcoded `GMT+0100`**. Roma e' UTC+2 (CEST) da fine marzo a fine ottobre:
per ~7 mesi l'anno l'app interrogava l'API un'ora nel futuro rispetto all'ora
reale, senza errori HTTP (risposta 200 valida, ma per l'istante sbagliato) —
rischio concreto di non mostrare treni imminenti. Verificato con un A/B allo
stesso wall-clock, stessa stazione, unica variabile l'offset: `GMT+0100` ⇒
manca un treno in ritardo non ancora partito; `GMT+0200` ⇒ presente. Fix:
offset calcolato dinamicamente via `Intl.DateTimeFormat({ timeZoneName:
'longOffset' })`. **Non reintrodurre un offset fisso.**

Conseguenza per il design: non esiste (e non serve) alcun filtro temporale
client-side su "orario schedulato passato" — `collect()`/render mostrano tutto
cio' che l'API restituisce; un treno in ritardo non partito resta in lista.
La finestra temporale esatta restituita da ViaggiaTreno rispetto all'istante
richiesto non e' documentata ufficialmente — trattarla come dettaglio upstream
che puo' variare, non come contratto stabile.

## Filtro stazione + geolocalizzazione

`STATION_COORDS` (lat/lon reali delle 3 stazioni) + `GEO_RADIUS_KM = 3`.
Distanze reali fra le 3 stazioni (11.5–37 km) escludono ambiguita' a 3km.
`initFilters()` renderizza subito i chip ("Tutte" default, mai bloccare sulla
geolocalizzazione), poi `tryAutoSelectByGeolocation()` best-effort/async: se
una stazione e' in raggio E l'utente non ha gia' cliccato un chip
(`userOverrodeFilter`), pre-seleziona quella. Permesso negato/nessuna stazione
in raggio → fallback silenzioso su "Tutte". Filtra su `origine` (nome
visualizzato, non il codice `S050xx`).

## `trainState` — fonte di verita' per lista principale + storico

Map module-level, chiave `numeroTreno_origine_orarioProgrammato`, valore
`{ row, missedCycles, lastSeenAt }` (`row.actualDepartureMs =
orarioPartenzaMs + ritardo*60000`, calcolato in `buildRow()`).

Ad ogni `refresh()` **riuscito** (mai nel `catch` — un fallimento di rete non
deve toccare lo stato): upsert delle righe fresche, poi per le entry assenti
dal fetch `missedCycles++`; **dopo `MAX_MISSED_CYCLES` (3) assenze consecutive
l'entry viene droppata a prescindere da stato/orario** (altrimenti un treno
mai piu' visto resterebbe congelato in cima alla lista con dati stantii).
Pruning incondizionato separato: qualunque entry con `actualDepartureMs` piu'
vecchio di `HISTORY_WINDOW_MS` (30min) viene rimossa, a prescindere da quante
volte e' stata rifetchata — backstop indipendente da `missedCycles`.

Classificazione (ricalcolata ad ogni tick, non scritta una volta): `actualDepartureMs
> now` → upcoming (lista principale, sort per orario **effettivo** crescente);
`<= now` → storico (sort decrescente, .time mostra l'orario effettivo non lo
schedulato). Include `cancellato`/`non partito` in entrambe le liste con il
loro tag preservato (decisione utente: non escluderli dallo storico).

**Perche' non una seconda chiamata API con `datetime = now-30min`** per lo
storico: raddoppierebbe le chiamate sul proxy CORS anonimo gia' fragile, per
un guadagno che la Map ottiene a costo zero e in modo deterministico.

lc-debt: storico solo in-memory, si perde al reload. Upgrade path: localStorage
con TTL 30min.

## PWA

Icone: file `.png` separati (non data-URI, per certezza di installabilita' e
perche' in pratica pesano meno del base64 inline). Generate una tantum via
Chrome headless (`--headless --screenshot=... --window-size=512,512` su un
HTML con l'emoji 🚂 su sfondo colorato) + `sips -z` per le altre dimensioni.
Service worker: bypass totale delle richieste cross-origin (mai cache-are
proxy.cors.sh/viaggiatreno.it, sono dati live), network-first per la
navigazione. `start_url`/`scope` del manifest e path di registrazione dello SW
sempre **relativi** (`./...`) per funzionare sotto il subpath GitHub Pages.
