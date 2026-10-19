# Woodsman's Quiz — remote operator

Version 2026.10.18.6

The website shows the actual venue operator window, with the same layout, buttons, score fields and game controls. Click **Full screen** to use just that window. Both the website and the venue computer can operate the same running quiz. The venue continues to own the sound, weekly files, timers and broadcast screen.

## Updating an existing remote installation

For the 18 October Guess It accumulating-clues update, replace the venue app and upload the new **Website** contents over the files in your existing GitHub Pages repository. Close the old quiz and broadcast windows, open the new app, and refresh the remote website with **Command–Shift–R** on a Mac or **Ctrl–Shift–R** on Windows. Confirm version **2026.10.18.6** appears beside the operator window. Your current site address and host login stay the same. **Do not rerun the SQL for this update**; the database setup has not changed.

## 1. Update the venue computer

Replace the old **Woodsman's Quiz.app** with the supplied **2026.10.18.6** app. Close and reopen the quiz and its broadcast window. If you use the folder's HTML launcher instead, use the updated Quiz System folder.

Load the weekly quiz files and open the broadcast window on the venue computer as usual. Sign in to **Live Companion** using your existing quiz host email/password. TEST mode is fine.

## 2. Set up the correct Supabase project once

Sign in to the Supabase dashboard account that owns the **existing quiz project**. The account previously open in Codex was the wrong one; no setup was applied there.

The website is configured for the same project as the quiz and phone view: **zjdxgcmeraiodigwdxpy**. Check that project reference in the dashboard URL before continuing.

Open that project's **SQL Editor**, paste the contents of **Supabase setup.sql**, and run it. This creates the private remote connection rules and a small list of currently available venue computers. It does not alter quiz questions, scores, phone state, bookings or existing users. It can be run again safely.

Use your normal quiz host login in the website. This is the login used inside Live Companion, not your Supabase dashboard login. No new password or service-role key is needed.

## 3. Upload the website to GitHub

Upload the **contents** of the **Website** folder to the folder served by your GitHub Pages repository. Keep all subfolders in place. `index.html` should be at the site's root, or inside the subfolder where you want the operator page to live. If your repository already has an `index.html`, use a separate `operator` subfolder to preserve that existing page.

Keep `.nojekyll` in the published folder; this hidden file is included in the ZIP. Only the Website contents belong on the public website. The SQL file and these instructions stay outside it. Do not upload the quiz app, weekly workbooks or your Quiz Library.

If Pages is not already enabled, open the repository's **Settings → Pages**, choose **Deploy from a branch**, then select your branch and the folder containing the website. Visit the published HTTPS address when GitHub has finished deploying it.

The supplied website's videos are silent preview copies, sized for browser upload. Original venue videos and audio are unchanged. GitHub allows browser uploads up to 25 MiB per file; every supplied website file is below that limit. [GitHub upload guidance](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository).

## 4. Connect and run a quiz

The venue’s four-step setup now includes library upload, Live Companion sign-in, remote enablement and weekly files. **Setup & files** and **Back to playlist** also work from the remote mirror while music continues. File selection remains on the venue computer.

1. On the venue computer, click **Enable remote access** in Setup. Give the computer a recognisable name if needed. During a show, **Show tools → Remote access on/off** enables or disables the connection locally.
2. On your laptop, visit the GitHub website and sign in with the **same quiz host account**.
3. Choose the venue computer and click **Connect**. Its operator window appears. Use **Full screen** or choose a view size.
4. Click the usual buttons, type scores and select options. Tab performs the existing advance/music-fade action. The Snakes arrow keys, Heist Space shortcut and physical timer keyboard controls also work when those screens are active. Text fields keep normal typing and Tab navigation.
5. Keep using local venue controls whenever needed. Their changes appear online. A second remote laptop can view the show; click **Take control** there to transfer remote operation. Local control stays available throughout.

TEST and LIVE both support remote operation. The mode label remains visible, and switching online asks for confirmation. Sound only plays at the venue. The display refreshes roughly once a second, with additional network delay; it is suitable for operating the show, not frame-accurate remote timing. Fades and game timing run on the venue computer.

Local file pickers, account sign-out, remote-access enable/disable, opening the broadcast popup and downloading exports must be used on the venue computer. They are disabled in the mirror. Weekly uploaded images are relayed privately to the signed-in operator; the workbooks and music library are not uploaded to GitHub.

Both computers need internet access and the venue computer must stay awake with the quiz running. If the remote connection drops, online controls pause. Old clicks are not replayed on reconnection. The local show keeps running. **Disable remote access** at the venue when finished.

## Connect a phone camera midway through a quiz

There is no need to pair a phone at startup. From the remote operator, open **Show tools → Phone camera**, scan the QR code using your phone, sign in with the same host account and tap **Connect camera**. This leaves the current round and its timing running. The phone starts in preview only; the venue computer and phone show that preview, while the remote laptop shows status and controls.

Once the physical game name is revealed, use **Show camera**, **Hide camera** and the layout selector from the remote operator or venue computer. Tab into the break automatically hides the camera. The physical stopwatch/countdown still starts only when you choose it manually.

The phone page is **camera.html**, included in Website. The QR code defaults to https://oarandz.github.io/quiteremote/. Upload all new Website files and update the venue app together. Your existing private Supabase remote connection is reused; **do not rerun the SQL** for this feature.

The phone microphone stays off, video is not recorded, and music still comes from the venue computer. Keep the phone unlocked on the camera page. On reconnection, explicitly Show camera again. Use the same Wi-Fi where possible. If the network blocks direct video, the venue camera panel has optional TURN relay settings; a relay account/service is not included. Public STUN is used by default. Relay credentials are session-only and excluded from the remote mirror/checkpoints.

Camera checks used real browser WebRTC with a synthetic video device and isolated signaling. They did not access a real camera or test your phone, venue network, Safari or a TURN service. Do a TEST-mode rehearsal with your phone after uploading the website.

## Checks completed and remaining setup

The supplied files were tested with separate venue and remote browser sessions, the actual Supabase client library and an isolated simulated connection. The SQL was tested in local PostgreSQL, including same-account access, other-account rejection and existing unrelated policies. These checks did not connect to or change your live Supabase database.

After applying the SQL to the correct project and publishing on GitHub, do a TEST-mode rehearsal on your actual two computers before a quiz night. If no venue appears, check the version, same host login, remote access enabled and the SQL setup. If controls pause, check that the venue computer is awake and online.

[Supabase's private-channel authorization documentation](https://supabase.com/docs/guides/realtime/authorization) describes the connection permissions used by this package.
