# Hieu Party — valódi, szerveroldali jelszóvédelem Firebase-szel

Ez a megoldás egy **Cloud Functiont** hoz létre, ami a te Firebase-projektedben fut.
A jelszó (pontosabban annak SHA-256 hash-e) kizárólag a Firebase Secret Managerben
tárolódik — soha nem kerül bele a HTML/JS kódba, soha nem látja a böngésző, és
soha nem kerül fel git-be. A látogató böngészője csak annyit kérdez meg a
függvénytől: "jó ez a jelszó?", és a válasz `{ok: true}` vagy `{ok: false}`.

## Amit kapsz

```
hieu-firebase/
├── firebase.json                 ← a Functions konfigurációja
├── hieu-party-firebase.html      ← a frissített meghívó oldal
└── functions/
    ├── index.js                  ← a jelszó-ellenőrző Cloud Function
    └── package.json
```

## 1. Előfeltételek

- Node.js (18 vagy újabb)
- Firebase CLI: `npm install -g firebase-tools`
- Egy létező Firebase projekt (ha a jelenlegi oldalad már Firebase Hostingon
  fut, ugyanazt a projektet használhatod)

## 2. Bejelentkezés és a projekt összekötése

```bash
firebase login
```

A `hieu-firebase` mappában hozz létre egy `.firebaserc` fájlt, vagy futtasd:

```bash
firebase use --add
```

és válaszd ki a meglévő projektedet.

## 3. Függőségek telepítése

```bash
cd hieu-firebase/functions
npm install
cd ..
```

## 4. A jelszó hash-ének beállítása (ez a valódi titok)

A "hieu" szó SHA-256 hash-e:

```
afc8e16842061ea3dbb023bf5f08d1bc3a728429313fab0cba30f60954ff9064
```

Ha másik jelszót szeretnél, számold ki a sajátodét, pl.:

```bash
node -e "console.log(require('crypto').createHash('sha256').update('uj-jelszo').digest('hex'))"
```

Ezután add hozzá titokként a projektedhez (ezt a CLI fogja kérni, ide írd be
a fenti hash-t, ne a sima szót):

```bash
firebase functions:secrets:set PARTY_PASSWORD_HASH
```

Ez a hash a Google Secret Managerében tárolódik, nem a kódban — ez a lényeg,
ami miatt ez valóban rejtve marad mindenki elől, aki csak a weboldal
forráskódját nézi.

## 5. Deploy

```bash
firebase deploy --only functions
```

A parancs végén megkapod a function URL-jét, valahogy így néz ki:

```
https://verifypartypassword-xxxxxxxxxx-uc.a.run.app
```

## 6. Az URL bekötése a HTML-be

Nyisd meg a `hieu-party-firebase.html` fájlt, keresd meg ezt a sort:

```js
var VERIFY_URL = 'PASTE_YOUR_CLOUD_FUNCTION_URL_HERE';
```

és cseréld ki a saját function URL-edre.

## 7. Feltöltés a meglévő oldaladra

Töltsd fel a `hieu-party-firebase.html`-t oda, ahol jelenleg a party oldal
él (akár Firebase Hosting, akár bármi más). A Cloud Function bárhonnan
hívható HTTPS-en keresztül, nem kell, hogy ugyanazon a hosztingon fusson.

## Érdemes még megfontolni (opcionális, de ajánlott élesben)

- **CORS szűkítése**: az `index.js`-ben az `ALLOWED_ORIGINS = ["*"]` sort
  cseréld le a saját domained(ek)re, pl. `["https://sajatoldalad.hu"]`,
  hogy más weboldalak ne hívhassák a végpontodat a látogatóid böngészőjéből.
- **Brute-force védelem**: jelenleg nincs beépített próbálkozás-korlátozás
  a szerver oldalon (a kliens oldali "5 próbálkozás" üzenet csak vizuális,
  nem véd semmit). Ha ez fontos, tehetsz rá Firebase App Checket vagy egy
  egyszerű Firestore-alapú számlálót IP-nként.
- **HTTPS**: a Cloud Function alapból HTTPS-en fut, ezt nem kell külön
  beállítani.
