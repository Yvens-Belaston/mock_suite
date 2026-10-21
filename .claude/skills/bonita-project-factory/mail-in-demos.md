# Mail in demos (module ofelia-correo)

Every demo that sends mail uses the same generic module and the same local SMTP file, so a new demo gets
templates, TEST/REAL mode and real delivery without new code. Reference implementation: repo
`endikafercu/demo-bantrab-bonita`, folder `modulos/ofelia-correo` (its `README.md` is the full manual).

## 1. Install the module into the generated project

```bash
cp -r <demo-bantrab-bonita>/modulos/ofelia-correo <project>/modulos/
py modulos/ofelia-correo/instalar.py <project> --actor-group /<org>/<admin group> \
   --mail-from <fictitious sender of the demo> --from-name "<Customer> <service>"
```

It adds BDM `MailTemplate` + `MailSetting` (`com.ofelia.mail.model`), the subprocess `EnviarCorreo` 1.0.0
(contract: templateCode, languageCode, to, cc, bcc, valuesJson, fallbackSubject, fallbackBody; outputs
mailSent, mailError, mailTo...), its `.conf` and the page `custompage_ofeliaMail` (templates with preview,
sending mode, brand, test mail). Business processes call `EnviarCorreo` from a call activity: they only
prepare the recipients and a JSON of values (`{{cliente.nombre}}`, `{{enlaceTarea}}`...). A failing mail never
breaks the calling case. Seed `MailTemplate.csv` (with a `_LAYOUT` corporate frame) and `MailSetting.csv`
through the BDM import API (`runtime/importar_seed.py` of the reference repo).

## 2. TEST and REAL

| Mode | Where mail goes | Configure |
|---|---|---|
| TEST (default) | local SMTP catcher `localhost:1025`, mailbox `http://localhost:8025` | process parameters `testSmtpHost`, `testSmtpPort` |
| REAL | the SMTP server of `%USERPROFILE%\.ofelia\mail-smtp.properties` | that file (read on every send) |

Switch on the page Plantillas de correo, tab Envío (or MailSetting `mail.mode`). No redeploy, no restart.

## 3. The SMTP file: one for every project

`C:\Users\<user>\.ofelia\mail-smtp.properties` (guide next to it: `README.md`). Use **Gmail with an app
password**, never a relay like Brevo for an `@ofelia.com` sender:

```properties
host=smtp.gmail.com
port=465
ssl=true
starttls=false
user=<you>@ofelia.com
password=<16-letter app password>
from=<you>@ofelia.com
replyTo=<you>@ofelia.com
```

- **DMARC**: `ofelia.com` and `bonitasoft.com` publish `p=reject` and their SPF does not include Brevo.
  Brevo accepts the mail (`mailSent=true`) and Gmail drops it: nothing arrives. Check any sender domain
  with `nslookup -type=TXT _dmarc.<domain>`.
- App password: 2-step verification on, then <https://myaccount.google.com/apppasswords>.
- Edit with the full path: from the `!` bash prompt `%USERPROFILE%` is not expanded and Notepad creates
  the file in the current folder (it once landed in Google Drive). Never in a repo, Drive, a `.conf`
  or a command line (the EDR logs arguments).

## 4. Fictitious recipients: aliases

Set `mail.aliasTo = <you>+{local}@ofelia.com` (tab Envío, "Alias por destinatario"). In REAL mode every
to/cc/bcc goes to the alias of its local part (`mlopez@demo.gt` -> `<you>+mlopez@ofelia.com`): one real
mailbox, and the demo shows who each mail was for. `mail.redirectTo` is the older option (everything to
one address, `[para: ...]` in the subject). A mail to yourself may show only under Sent.

## 5. Brand

`MailSetting` rows `mail.brand.name`, `tagline`, `title`, `color`, `logoUrl` (public https PNG; blank =
the name in text), `footer`, `palette`. The `_LAYOUT` template frames every mail (header with logo,
button links, footer). Mailboxes block images of sites behind bot protection; check the logo arrives.

## 6. Check before the demo

```bash
ALIAS='<you>+{local}@ofelia.com' py runtime/e2e/prueba_correo_real.py   # REAL, then restores the mode
```

Then look at the inbox. `mailSent=true` only means the SMTP server accepted it. Leave TEST on when not
demoing (Gmail allows about 2,000 mails a day).
