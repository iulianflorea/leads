# LeadMailer

Aplicație desktop (Windows, macOS, Linux) care trimite emailuri personalizate către leaduri importate din Excel, prin contul tău Microsoft/Outlook, cu PDF-ul produsului de interes atașat automat.

> „LeadMailer” e un nume provizoriu, definit într-o singură constantă: `APP_NAME` în `src/shared/config.ts` (plus `productName` în `package.json` / `electron-builder.yml` pentru numele executabilului).

## Ce face

- **Import Excel** (.xlsx, .xls, .csv): drag & drop, alegerea foii, previzualizare, recunoaștere automată a coloanelor (RO/EN, tolerantă la greșeli de tipar), mapare editabilă și memorată pentru importurile viitoare. Coloanele nemapate devin variabile `{{extra.Coloana}}`. Raportul de import semnalează emailurile invalide, duplicatele (în fișier și în aplicație) și rândurile goale. Leadurile sunt grupate în liste.
- **Produse și PDF-uri**: fiecare produs are sinonime și o fișă PDF. Valorile din Excel se potrivesc automat (normalizare → potrivire exactă → conținere → fuzzy). Pentru valorile nerecunoscute poți lega valoarea de un produs, poți crea produsul sau poți alege să trimiți fără atașament. Un lead poate avea mai multe produse.
- **Șabloane**: editor rich text cu variabile `{{nume}}`, `{{prenume}}`, `{{email}}`, `{{telefon}}`, `{{adresa}}`, `{{produs}}`, `{{extra.X}}`, valori implicite `{{prenume|Client}}`, autocompletare la `{{`, previzualizare live pe un lead real (luminos/întunecat), semnătură, email de test.
- **Leaduri**: tabel virtualizat cu căutare (fără diacritice), filtre, sortare, selecție multiplă, editare inline, panou cu detalii și istoric, statusuri (nou / trimis / eroare / nu contacta).
- **Trimitere**: individuală, cu previzualizare finală, sau în masă, cu ecran de verificare, confirmare explicită și coadă cu Pauză / Reluare / Anulare / Reîncercare pentru eșuate. Coada se reia după o închidere neașteptată, fără retrimiteri.
- **Istoric** complet, exportabil în CSV.
- **Setări**: cont (Outlook, SMTP sau mod demonstrativ), viteza de trimitere, temă, limbă, GDPR și text de dezabonare, backup/restaurare, jurnal.

## Pornire rapidă

Cerințe: **Node.js 22+** și npm.

```bash
npm install          # instalează și pregătește better-sqlite3 pentru Electron
npm run dev          # pornește aplicația în modul dezvoltare (cu hot reload)
```

Pentru a încerca fără cont Microsoft: la prima pornire alege **„Încearcă fără cont (mod demonstrativ)”**. În acest mod nu se trimite nimic. Emailurile „trimise” sunt salvate ca JSON în `<folder date>/mock-outbox/`.

Fișiere de test incluse în `samples/`: `leads-example.xlsx` (antete în română, produse variate, un email invalid, un duplicat, un rând gol, două foi) și două PDF-uri (`pompa-de-caldura.pdf`, `panouri-fotovoltaice.pdf`). Le poți regenera cu `npm run samples`.

### Scripturi

| Comandă                                                 | Ce face                                                                              |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `npm run dev`                                           | aplicația în modul dezvoltare                                                        |
| `npm run build`                                         | compilează main, preload și renderer în `out/`                                       |
| `npm start`                                             | rulează build-ul din `out/`                                                          |
| `npm test`                                              | teste unitare (Vitest)                                                               |
| `npm run test:e2e`                                      | build + teste end-to-end Playwright pe Electron (provider de email mock, fără rețea) |
| `npm run lint` / `npm run typecheck` / `npm run format` | ESLint, TypeScript strict, Prettier                                                  |
| `npm run dist:mac` / `dist:win` / `dist:linux`          | pachete instalabile în `release/<versiune>/`                                         |
| `npm run samples` / `npm run icon`                      | regenerează fișierele exemplu / iconița din `build/icon.svg`                         |

Variabile de mediu utile: `LEADMAILER_MAIL_PROVIDER=mock|smtp|graph` (forțează providerul), `LEADMAILER_USER_DATA=<dosar>` (alt folder de date), `LEADMAILER_MOCK_DELAY_MS`, `LEADMAILER_MOCK_FAIL_RATE=0.2` (simulează erori), `LEADMAILER_MS_CLIENT_ID`.

## Înregistrarea aplicației în Microsoft Entra ID (Azure)

Pentru trimiterea prin Outlook ai nevoie de un **Application (client) ID**. Înregistrarea este gratuită și durează câteva minute.

1. Deschide [Microsoft Entra admin center](https://entra.microsoft.com) (sau portal.azure.com → _Microsoft Entra ID_) cu orice cont Microsoft. Pentru conturi personale poți folosi tenantul implicit creat automat.
2. **Applications → App registrations → New registration**.
   - **Name**: `LeadMailer` (sau numele aplicației tale).
   - **Supported account types**: _Accounts in any organizational directory (Any Microsoft Entra ID tenant – Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)_. Aceasta corespunde autorității `common` folosite de aplicație (conturi personale + work/school).
   - **Redirect URI**: platforma **Public client/native (mobile & desktop)**, valoarea `http://localhost`.
   - Apasă **Register**.
3. Pe pagina aplicației, copiază **Application (client) ID**.
4. **Authentication**: verifică dacă la _Mobile and desktop applications_ apare `http://localhost`. Portul nu contează: MSAL deschide un port aleator pe loopback, iar Microsoft acceptă orice port pentru `http://localhost`. Nu e nevoie de client secret: aplicația este „public client” și folosește authorization code + PKCE.
5. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**. Adaugă:
   - `Mail.Send` — trimiterea emailurilor;
   - `Mail.ReadWrite` — ciorne pentru atașamente mari și verificarea în „Trimise” după o întrerupere;
   - `User.Read` — numele și adresa contului conectat;
   - `offline_access` — reconectare silențioasă (refresh token).

   La conturile de firmă, un administrator poate apăsa _Grant admin consent_. Altfel, fiecare utilizator își dă acordul la prima conectare.

6. Pune Client ID-ul în aplicație. Cel mai simplu e din interfață: **Setări → Cont de email → Outlook / Microsoft 365 → „ID aplicație Microsoft (Client ID)”** (câmpul apare și în ghidul de început). Lipește ID-ul și apasă **Salvează**. Aplicația verifică formatul, îl păstrează în baza de date locală și îl folosește imediat, fără repornire. Dacă schimbi ID-ul, contul conectat se deconectează, pentru că tokenurile aparțin înregistrării vechi.

   Alternative, utile pentru distribuirea aplicației către alți utilizatori:
   - la build: `LEADMAILER_MS_CLIENT_ID=<id> npm run dist:mac` (ID-ul e inclus în pachet, iar utilizatorii nu mai trebuie să-l introducă);
   - în GitHub Actions: secretul de repository **`MS_CLIENT_ID`**;
   - în cod: `MS_CLIENT_ID` din `src/shared/config.ts`;
   - la rulare: variabila de mediu `LEADMAILER_MS_CLIENT_ID` (dacă e setată, câmpul din interfață devine doar informativ).

Ordinea de prioritate: variabila de mediu → ID-ul salvat din Setări → ID-ul de la build → constanta din cod.

### Cum funcționează conectarea

La „Conectează Outlook”, aplicația deschide browserul sistemului cu pagina de login Microsoft. După autentificare, Microsoft redirecționează spre `http://localhost:<port>`, iar MSAL preia codul și obține tokenurile. Cache-ul de tokenuri e salvat **criptat** cu `safeStorage` (Keychain pe macOS, DPAPI pe Windows, libsecret pe Linux) în `auth-cache.bin`. La pornire, contul se reconectează silențios. Dacă sesiunea expiră, aplicația afișează „Sesiunea Microsoft a expirat — Reconectează”. Pe Linux fără keyring, tokenurile nu se salvează pe disc, așa că va trebui să te reconectezi după fiecare repornire.

### Alternativa SMTP

Dacă nu poți înregistra aplicația, alege **Setări → Cont de email → Server SMTP**. Merge cu serverul de email al firmei sau cu Gmail cu parolă de aplicație. Parola se păstrează criptată local. Ai și un buton „Testează conexiunea”. Atenție:

- prin SMTP, emailurile **nu** apar automat în folderul „Trimise”;
- Microsoft dezactivează autentificarea SMTP cu parolă simplă pentru Outlook.com și Exchange Online, așa că pentru conturile Microsoft varianta recomandată rămâne Graph.

## Limitele Microsoft

Valorile sunt orientative și pot varia în funcție de cont și de vechimea lui:

|                      | Outlook.com (personal)          | Microsoft 365 / Exchange Online |
| -------------------- | ------------------------------- | ------------------------------- |
| Destinatari pe zi    | ~300 (mai puțin la conturi noi) | 10.000                          |
| Mesaje pe minut      | —                               | 30                              |
| Destinatari pe mesaj | 100                             | 500                             |

Graph mai limitează cererile per căsuță: cam 10.000 de cereri la 10 minute și maximum 4 cereri simultane. Mesajele trimise direct cu `/me/sendMail` trebuie să aibă sub ~4 MB. Peste ~3 MB de atașamente, aplicația trece automat la _draft + upload session + send_, care acceptă atașamente de până la 150 MB (aplicația limitează PDF-urile la 25 MB).

Ce face aplicația ca să nu depășească aceste limite:

- trimite **un singur email odată**, la intervalul setat (implicit 2 secunde; se schimbă în Setări);
- la răspunsurile `429` / `503` / `504` respectă **Retry-After**, iar în lipsa lui folosește backoff exponențial cu jitter (până la 5 reîncercări);
- la o eroare de autentificare reîmprospătează tokenul o dată, iar dacă nu reușește, **pune coada pe pauză** și cere reconectarea. Destinatarii nu sunt marcați ca eșuați.

Documentație: [Exchange Online limits](https://learn.microsoft.com/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits), [Graph throttling](https://learn.microsoft.com/graph/throttling-limits), [Outlook.com sending limits](https://support.microsoft.com/office/sending-limits-in-outlook-com-279ee200-594c-40f0-9ec8-bb6af7735c2e).

## Build per platformă

```bash
npm run dist:mac     # macOS arm64 → .dmg (doar de pe macOS)
npm run dist:win     # Windows x64 → instalator NSIS + portable .exe
npm run dist:linux   # Linux x64 → AppImage + .deb
```

Pachetele apar în `release/<versiune>/`. Configurația e în `electron-builder.yml`.

**Module native.** `better-sqlite3` (v13) folosește N-API și vine cu binare precompilate pentru toate platformele, deci aceeași compilare merge în Node (teste) și în Electron. De aceea `npmRebuild` e dezactivat la packaging, iar pachetele se pot construi și cross-platform. `postinstall` rulează totuși `electron-builder install-app-deps`, pentru eventuale alte module native. Fișierele `.node` sunt scoase din arhiva asar (`asarUnpack`).

**GitHub Actions** (`.github/workflows/build.yml`):

- `quality` (Ubuntu): lint, typecheck, teste unitare și teste e2e Electron sub `xvfb`;
- `package`: matrice `windows-latest`, `ubuntu-latest`, `macos-latest` (arm64), cu artefacte descărcabile la fiecare rulare;
- `release`: la un tag `v*` (ex.: `git tag v0.1.0 && git push --tags`) creează un **draft release** pe GitHub cu toate pachetele atașate.

Secrete opționale: `MS_CLIENT_ID`, iar pentru semnare `CSC_LINK` / `CSC_KEY_PASSWORD` (macOS) și `WIN_CSC_LINK` / `WIN_CSC_KEY_PASSWORD` (Windows).

## Semnarea aplicației (SmartScreen / Gatekeeper)

Fără certificate, pachetele funcționează, dar sistemul de operare avertizează la prima pornire.

- **Windows (SmartScreen)**: apare „Windows a protejat computerul”. Utilizatorul apasă _Mai multe informații → Rulează oricum_. Pentru a elimina avertismentul, semnează aplicația cu un certificat de code signing OV/EV (`WIN_CSC_LINK` + `WIN_CSC_KEY_PASSWORD`, sau Azure Trusted Signing). Reputația SmartScreen se construiește în timp, pe măsură ce aplicația e descărcată.
- **macOS (Gatekeeper)**: o aplicație nesemnată, descărcată de pe internet, poate apărea ca „deteriorată” sau „nu poate fi deschisă”. Soluție temporară: clic dreapta → _Deschide_, sau `xattr -cr /Applications/LeadMailer.app`. Soluția corectă e un cont Apple Developer (99 USD/an), certificatul **Developer ID Application** (`CSC_LINK` + `CSC_KEY_PASSWORD`) și **notarizarea** (`notarize: true` în `electron-builder.yml`, plus `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`). Entitlements-urile pentru Hardened Runtime sunt în `build/entitlements.mac.plist`.
- **Linux**: AppImage-ul trebuie făcut executabil (`chmod +x LeadMailer-*.AppImage`). Pachetul `.deb` se instalează cu `sudo apt install ./LeadMailer-*.deb`.

## Date, confidențialitate și loguri

- Toate datele stau local, în `app.getPath('userData')`: `leadmailer.db` (SQLite), `pdfs/`, `auth-cache.bin` (criptat). Folderul se deschide din _Setări → Date_.
- Singura comunicare în rețea este cu Microsoft (login și Graph) sau cu serverul SMTP ales. Aplicația nu are servere proprii.
- Logurile (electron-log) sunt în `~/Library/Logs/LeadMailer` (macOS), `%APPDATA%\LeadMailer\logs` (Windows) și `~/.config/LeadMailer/logs` (Linux). Ele **nu conțin date personale** ale leadurilor, doar id-uri, numere și coduri de eroare.
- **Backup**: _Setări → Exportă backup_ creează un `.zip` cu o copie consistentă a bazei de date și cu PDF-urile, fără tokenuri și parole (acestea sunt legate de calculator). _Importă backup_ validează arhiva, repornește aplicația și păstrează datele anterioare ca `*.before-restore`.
- Lista „Nu contacta” e păstrată după adresa de email și se respectă automat la trimiterile în masă, chiar dacă leadul e reimportat.

## Arhitectură

```
src/
  shared/     tipuri, scheme zod, contractul IPC, i18n (ro), logica pură:
              potrivire coloane/produse, randare șabloane
  main/       procesul principal: db (SQLite + migrații numerotate), repos, import (SheetJS),
              auth (MSAL), mailer (Graph / SMTP / Mock), queue, services, ipc
  preload/    puntea minimă window.lm (invoke + on), cu canale în whitelist
  renderer/   React + Zustand: ecrane, componente, design tokens (CSS variables)
tests/unit    Vitest
tests/e2e     Playwright pentru Electron
```

- **IPC tipizat**: `src/shared/ipc-contract.ts` definește fiecare canal printr-o schemă zod pentru input și un tip pentru output. Procesul principal validează tot ce primește. Renderer-ul folosește `call('canal', input)` cu tipuri inferate. Erorile circulă sub forma unor coduri stabile (`AppError`), traduse în mesaje clare cu o acțiune sugerată.
- **Securitate Electron**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP strict, navigare blocată, linkurile externe se deschid în browser.
- **Migrații**: fișiere `src/main/db/migrations/NNN_nume.sql`, incluse în build și aplicate la pornire, fiecare într-o tranzacție (`PRAGMA user_version`).
- **Mailer**: interfața `MailProvider` (`src/main/mailer/types.ts`) are implementările `GraphMailProvider`, `SmtpMailProvider` și `MockMailProvider`. Un provider nou se adaugă implementând interfața și înregistrându-l în `MailService`.
- **Coada**: `SendQueue` e logică pură, cu stocare injectată, testată separat. Fiecare email e un rând în `sends`, cu conținutul „înghețat” la confirmare. Un rând este revendicat atomic (`queued → sending`) înainte de trimitere, deci nu poate pleca de două ori. La repornire, rândurile rămase în `sending` sunt verificate în „Trimise” prin proprietatea extinsă `LeadMailerSendId` pusă pe fiecare mesaj Graph. Dacă verificarea nu e posibilă, rândul e marcat **„De verificat”**, iar utilizatorul decide.

### De ce Zustand (și nu TanStack Query)

Datele vin dintr-o bază de date locală, prin IPC, fără latență de rețea și fără alți clienți care să le modifice. Cache-ul, invalidarea și retry-urile din TanStack Query n-ar aduce mare lucru aici. Zustand oferă store-uri mici, fără provider, ușor de actualizat din evenimentele trimise de procesul principal (`data:changed`, `queue:progress`, `account:changed`). Fiecare ecran își reîncarcă datele când primește evenimentul relevant.

## Teste

- **Unitare** (`npm test`): detectarea coloanelor, normalizarea și potrivirea produselor, validarea importului, randarea șabloanelor, coada (pauză, reluare, anulare, retry, reluare idempotentă), retry/backoff, providerul Graph cu `fetch` mockat, migrațiile, backup-ul și exportul CSV.
- **End-to-end** (`npm run test:e2e`): import → mapare → raport, editare inline, produs + PDF → previzualizare șablon, trimitere individuală, trimitere în masă cu repornire în mijlocul cozii (fără dubluri) și onboarding. Toate rulează cu providerul mock, fără rețea.
