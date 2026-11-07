# Nebula for Android

A small Android app that opens your deployed Nebula (for example on Vercel) full screen. It adds microphone access for voice, a file picker for attachments, and saves downloads (zips, PDFs, exports) to the phone's Downloads folder. Build mode still talks to the build server you run, such as the one in Termux at `http://localhost:3000`.

You do not need Android Studio or a computer. GitHub builds and signs the APK for you.

## Build the APK from your phone

1. Create a private GitHub repository and put this whole project in it (the folder that contains `android/` and `.github/`).
   - In Termux: `pkg install git`, then `git init`, `git add -A`, `git commit -m nebula`, `git remote add origin https://github.com/YOU/REPO.git`, `git push -u origin HEAD` (use a personal access token as the password).
   - Or on a computer: drag the folder into a new repository in the browser.
2. Open the repository on github.com, go to **Actions, Android APK, Run workflow**. Enter your deployed address, for example `https://my-nebula.vercel.app`, and a version number.
3. When it finishes (about 5 to 8 minutes), open the run, download the **nebula-apk** artifact, unzip it, and install `app-release.apk`. Android will ask you to allow installs from your browser or file manager.

## Signing key

The first run creates a signing key and keeps it in GitHub's cache, so later runs sign with the same key and the app updates in place. GitHub deletes cache entries that are unused for 7 days, and a new key means you must uninstall the old app first. For a permanent key, create one yourself and add four repository secrets (Settings, Secrets and variables, Actions):

| Secret | Value |
|---|---|
| `KEYSTORE_BASE64` | your keystore file, base64 encoded |
| `KEYSTORE_PASSWORD` | the keystore password |
| `KEY_ALIAS` | the key alias |
| `KEY_PASSWORD` | the key password (optional if it equals the keystore password) |

Create a keystore once with `keytool -genkeypair -v -keystore nebula.jks -alias nebula -keyalg RSA -keysize 2048 -validity 10000`, then `base64 -w0 nebula.jks`. Keep the file and passwords safe and never share them. Anyone with the keystore can publish updates as you.

## Build it yourself in Android Studio

Open the `android` folder in Android Studio and build. To point it at your site, add `appUrl=https://your-site` to `android/gradle.properties`. For a signed release use Build, Generate Signed App Bundle or APK.

## Notes

- Requires Android 10 or newer.
- Only pages from your own site get the file-saving bridge. Generated apps previewed inside Nebula cannot use it.
- Only the microphone is ever requested, and only for your own site.
- This project has not been compiled on the machine that produced it. If the workflow fails, open the failed step and send me its log.
