# IDP Demo Backend

IDP'nin yalnız artifact açtığını değil, gerçek bir uygulamayı durdurup değiştirerek yeniden
başlattığını ve doğru sürümü sağlık kontrolüyle doğruladığını test eden sıfır bağımlılıklı Node.js
backend'i.

## Endpoint'ler

- `GET /health` → IDP health check; artifact içindeki sürümü döndürür.
- `GET /api/info` → frontend'in gösterdiği canlı veri.

Yerel test:

```bash
npm test
npm start
```

Varsayılan adres `http://0.0.0.0:8085`. Hedefte `.env` ile `HOST`, `PORT`,
`CORS_ORIGIN` ve `DEMO_MESSAGE` değiştirilebilir.

## Repository görevleri

Bu repo release orkestratörüdür. `.github/workflows/idp-release.yml` backend ve
`brskcygt/IDP-Demo-Frontend` repolarını aynı Windows self-hosted runner'da test eder, iki
immutable `.tar.gz` üretir, IDP'ye yükler ve GitHub Releases'a aynalar.

GitHub repo ayarlarına şunları ekle:

- Actions variable `IDP_URL`: `http://192.168.0.242:3001`
- Actions variable `IDP_PROJECT_ID`: IDP'de yeni demo projesinin kimliği
- Actions secret `IDP_ARTIFACT_UPLOAD_TOKEN`: IDP'nin proje için ürettiği upload tokenı

Workflow izni `Read and write permissions` olmalı; bunun nedeni GitHub Release asset'lerini
yüklemektir.

## IDP ayarları

Proje adı `IDP Demo`, artifact adı `idp-demo`, provider GitHub Actions, repository bu repo,
branch `main`, workflow `idp-release.yml`, version variable `VERSION`.

Hedef:

- Agent: `WIN-CI-01`
- Base path: `C:\inetpub\wwwroot\idp-demo`

İlk deploy öncesi iki component'i de `runtime: none`, health boş olacak şekilde kaydet:

| Component | Subdir | OS | Runtime |
|---|---|---|---|
| backend | backend | win-x64 | none |
| frontend | frontend | any | none |

`1.0.0-test.1` release'ini üretip deploy et. Dosyalar geldikten sonra Windows'ta yönetici
PowerShell aç ve çalıştır:

```powershell
cd C:\inetpub\wwwroot\idp-demo\backend\ops
.\bootstrap-windows.ps1 -NssmPath C:\tools\nssm\win64\nssm.exe
```

Script NSSM servisini, IIS app pool/site'ını, portları ve firewall kurallarını idempotent
olarak hazırlar. `nssm.exe` başka yerdeyse gerçek yolu ver.

Bootstrap'tan sonra IDP component ayarlarını şu hale getir:

| Component | Runtime | Ad | Health URL | Version path |
|---|---|---|---|---|
| backend | nssm | `IDPDemoBackend` | `http://127.0.0.1:8085/health` | `version` |
| frontend | iis-static | `IDPDemoFrontendPool` | `http://127.0.0.1:8090/version.json` | `version` |

Backend preserve listesine `.env`, frontend preserve listesine `config.js` eklenebilir.
Agent'ın `application.yml` dosyasında `deploy.nssm-path`, bootstrap çıktısındaki mutlak
`nssm.exe` yolu olmalı; değişiklikten sonra IDP agent'ını yeniden başlat.

Ardından `1.0.0-test.2` üret ve deploy et. Başarı ölçütleri:

1. IDP deploy sonucu iki component için başarılıdır.
2. `http://SUNUCU-IP:8085/health` ve `http://SUNUCU-IP:8090/version.json` aynı sürümü döndürür.
3. `http://SUNUCU-IP:8090` ekranında iki kart da **Canlı** görünür.
4. Eski release'e rollback sonrası iki endpoint eski sürümü gösterir.
