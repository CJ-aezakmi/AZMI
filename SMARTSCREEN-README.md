# Решение проблемы Windows SmartScreen

## Текущая ситуация
Windows SmartScreen показывает предупреждение при запуске приложения, так как оно не подписано цифровой подписью.

## Решения

### Для пользователей (обход SmartScreen)
Когда появляется предупреждение SmartScreen:
1. Нажмите **"Подробнее"** (More info)
2. Нажмите **"Выполнить в любом случае"** (Run anyway)
3. Приложение запустится нормально

Это безопасно, если вы скачали .msi с официального GitHub Releases.

### Для разработчика (полное решение - платное)

Чтобы **полностью убрать** предупреждение SmartScreen, нужно:

#### 1. Купить сертификат подписи кода (Code Signing Certificate)
Стоимость: ~$100-400/год

Варианты:
- **DigiCert** (~$400/год) - рекомендуется
- **Sectigo (Comodo)** (~$200/год)
- **GlobalSign** (~$250/год)
- **SSL.com** (~$100/год)

Требования:
- Подтверждение личности/компании
- Процесс верификации 1-5 дней

#### 2. Подписать приложение

После получения сертификата, обновить `.github/workflows/windows-build-release.yml`:

```yaml
- name: Sign executable
  run: |
    # Установить сертификат в Windows Certificate Store
    $cert = Import-PfxCertificate -FilePath path/to/cert.pfx -CertStoreLocation Cert:\CurrentUser\My -Password (ConvertTo-SecureString -String "${{ secrets.CERT_PASSWORD }}" -AsPlainText -Force)
    
    # Подписать .msi
    & "C:\Program Files (x86)\Windows Kits\10\bin\10.0.22621.0\x64\signtool.exe" sign /sha1 $cert.Thumbprint /t http://timestamp.digicert.com /fd SHA256 "src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/*.msi"
  shell: pwsh
```

И обновить `tauri.conf.json`:
```json
"windows": {
  "certificateThumbprint": "YOUR_CERT_THUMBPRINT_HERE",
  "digestAlgorithm": "sha256",
  "timestampUrl": "http://timestamp.digicert.com"
}
```

#### 3. Набрать репутацию
Даже с подписью, первые недели/месяцы SmartScreen может показывать предупреждение.
Чтобы набрать репутацию:
- Больше установок (чем больше пользователей, тем быстрее)
- Отсутствие жалоб на вредоносность
- Время (обычно 2-4 недели)

## Альтернативные решения (бесплатные, но менее эффективные)

### 1. Self-signed сертификат (не рекомендуется)
- Можно создать self-signed сертификат бесплатно
- НО SmartScreen всё равно будет показывать предупреждение
- Пользователям придётся добавить ваш сертификат в доверенные вручную

### 2. Упаковка в installer
- Некоторые installer-системы (InnoSetup, NSIS) могут немного уменьшить предупреждения
- НО не убирают SmartScreen полностью

## Рекомендация

Для open-source проекта:
1. **Сейчас**: Добавить в README инструкцию для пользователей как обойти SmartScreen
2. **Если проект коммерческий**: Купить Code Signing Certificate от DigiCert или Sectigo
3. **После покупки**: Настроить автоматическую подпись в CI/CD

## Файлы для обновления

Уже добавлено в проект:
- ✅ `bundle.publisher` в tauri.conf.json
- ✅ `bundle.copyright` в tauri.conf.json  
- ✅ `bundle.homepage` в tauri.conf.json

Нужно добавить при наличии сертификата:
- ⏳ `bundle.windows.certificateThumbprint`
- ⏳ Шаг подписи в CI workflow
