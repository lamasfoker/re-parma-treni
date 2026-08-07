# Treni regionali Reggio Emilia / Rubiera ↔ Parma

Dashboard a colpo d'occhio (zero click) dei treni regionali tra Reggio Emilia/Rubiera e Parma, con ritardi in tempo reale, orario effettivo di partenza e binario, pensata per essere consultata velocemente dal telefono mentre si cammina verso la stazione. Installabile come PWA.

## Come funziona

**Nessun backend.** `index.html` è una singola pagina statica che, direttamente dal browser:

1. Chiama l'API non ufficiale di ViaggiaTreno (Trenitalia) per i treni in partenza da Reggio Emilia, Rubiera e Parma.
2. Passa attraverso [proxy.cors.sh](https://cors.sh) (CORS-proxy pubblico) per superare il blocco CORS di `viaggiatreno.it` — senza questo passaggio il browser rifiuterebbe di leggere la risposta.
3. Filtra solo i treni regionali (`REG`) che collegano le tre stazioni (classificazione via nome destinazione: i regionali su questa tratta della linea Milano-Bologna fermano in tutte le stazioni intermedie, quindi non serve interrogare le fermate treno per treno).
4. Mostra tutto in un'unica lista ordinata per orario effettivo di partenza; un filtro per stazione di partenza si pre-seleziona da solo in base alla posizione (se sei vicino a una delle tre stazioni), altrimenti resta su "Tutte".
5. Uno storico ("Partiti di recente") mostra i treni partiti negli ultimi 30 minuti.

### Perché non un backend proprio (Cloudflare Worker / Render / ecc.)

Tentativo iniziale: un Cloudflare Worker come backend. **Scartato**: il WAF di `viaggiatreno.it` risponde `403 Access Denied` in modo specifico alle chiamate provenienti dalle IP range di Cloudflare Workers (verificato: stessa richiesta da un normale server risponde `200`). Non essendoci garanzia che altri host "edge"/serverless gratuiti se la cavino meglio, si è verificato che un CORS-proxy pubblico ospitato altrove (`proxy.cors.sh`) non soffre dello stesso blocco — il che permette di tornare all'architettura più semplice possibile: nessun server da mantenere, solo file statici.

## lc-debt (limiti noti, con upgrade path)

- **Proxy CORS anonimo**: `index.html` usa `proxy.cors.sh` senza API key. Funziona (verificato), ma non è il modo ufficialmente supportato dal servizio, che documenta un'API key gratuita pinnata al dominio. Se il proxy inizia a rispondere 401/429: creare un progetto gratuito su [cors.sh/console](https://cors.sh/console), pinnare una key `live_` al dominio GitHub Pages, e valorizzare la costante `CORS_API_KEY` in cima allo `<script>` di `index.html`.
- **Classificazione per nome destinazione, non per fermate effettive**: affidabile su questa tratta (nessun servizio regionale "skip-stop"), ma teoricamente meno preciso di una verifica esplicita delle fermate (`andamentoTreno`). Se in futuro serve gestire linee con fermate saltate, vedere la cronologia del repo per l'implementazione basata su `fermate` (scartata qui solo per il blocco WAF incontrato lato Worker, non per un difetto della tecnica in sé).
- **Storico solo in-memory**: la sezione "Partiti di recente" vive solo nella sessione della pagina aperta, si azzera al reload. Upgrade path se serve persistenza: localStorage con TTL 30min.

## Sviluppo locale

Qualsiasi server statico va bene, ma va servito dalla cartella **padre** del
repo (non dalla sua root), per riprodurre il subpath `/re-parma-treni/` di
GitHub Pages — necessario perché manifest/service-worker usano path relativi:

```sh
cd .. && python3 -m http.server 8901
```

Poi aprire `http://localhost:8901/re-parma-treni/`.

## Pubblicazione (GitHub Pages)

1. Push del repo su GitHub.
2. Impostazioni repo → Pages → deploy dalla root del branch principale.
3. Aprire `https://<utente>.github.io/re-parma-treni/` dal telefono (funziona anche fuori Wi-Fi di casa, su rete dati).
