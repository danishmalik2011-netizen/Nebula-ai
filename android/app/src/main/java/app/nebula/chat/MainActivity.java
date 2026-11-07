package app.nebula.chat;

import android.Manifest;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;

import org.json.JSONObject;

import java.io.OutputStream;
import java.util.HashSet;
import java.util.Set;

/** Hosts the deployed Nebula web app in a WebView. */
public class MainActivity extends AppCompatActivity {
    private static final int REQ_FILE = 11;
    private static final int REQ_MIC = 12;

    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private PermissionRequest pendingPermission;
    private String appHost = "";

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Uri app = Uri.parse(BuildConfig.APP_URL);
        appHost = app.getHost() == null ? "" : app.getHost();
        String appOrigin = app.getScheme() + "://" + app.getAuthority();

        web = new WebView(this);
        web.setBackgroundColor(0xFFF6F2EA);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setUserAgentString(s.getUserAgentString() + " NebulaApp/" + BuildConfig.VERSION_NAME);

        // Only pages from your own site get the file-saving bridge (not previews of generated apps).
        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            Set<String> allowed = new HashSet<>();
            allowed.add(appOrigin);
            WebViewCompat.addWebMessageListener(web, "NebulaApp", allowed,
                    (view, message, sourceOrigin, isMainFrame, replyProxy) -> {
                        String data = message.getData();
                        if (isMainFrame && data != null) onAppMessage(data);
                    });
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
                if (!r.isForMainFrame()) return false;
                Uri u = r.getUrl();
                if (u.getHost() != null && u.getHost().equals(appHost)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) { }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) {
                    v.loadUrl("file:///android_asset/offline.html?u=" + Uri.encode(BuildConfig.APP_URL));
                }
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView w, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                try {
                    startActivityForResult(params.createIntent(), REQ_FILE);
                } catch (Exception e) {
                    chooser = null;
                    return false;
                }
                return true;
            }

            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> handlePermission(request));
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        if (state == null) web.loadUrl(BuildConfig.APP_URL);
        else web.restoreState(state);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    // Microphone for dictation and live voice: only for your own site, only audio.
    private void handlePermission(PermissionRequest request) {
        boolean mine = appHost.equals(request.getOrigin().getHost());
        boolean mic = false, other = false;
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r)) mic = true;
            else other = true;
        }
        if (!mine || !mic || other) {
            request.deny();
            return;
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
            request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
        } else {
            pendingPermission = request;
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC);
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(code, permissions, results);
        if (code == REQ_MIC && pendingPermission != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
            } else {
                pendingPermission.deny();
            }
            pendingPermission = null;
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (code == REQ_FILE && chooser != null) {
            chooser.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(result, data));
            chooser = null;
        }
    }

    // Files from the web app (zips, PDFs, exports) are saved to the Downloads folder.
    private void onAppMessage(String json) {
        try {
            JSONObject o = new JSONObject(json);
            if (!"save".equals(o.optString("t"))) return;
            final String name = o.optString("name", "download");
            final String mime = o.optString("mime", "application/octet-stream");
            final String b64 = o.getString("b64");
            new Thread(() -> save(name, mime, b64)).start();
        } catch (Exception e) {
            toast("Couldn't save the file.");
        }
    }

    private void save(String name, String mime, String b64) {
        try {
            byte[] data = Base64.decode(b64, Base64.DEFAULT);
            String safe = name.replaceAll("[\\\\/:*?\"<>|]", "_");
            if (safe.isEmpty()) safe = "download";
            ContentValues values = new ContentValues();
            values.put(MediaStore.Downloads.DISPLAY_NAME, safe);
            values.put(MediaStore.Downloads.MIME_TYPE, mime);
            values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) throw new IllegalStateException("no destination");
            try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                if (out == null) throw new IllegalStateException("no stream");
                out.write(data);
            }
            toast("Saved to Downloads: " + safe);
        } catch (Exception e) {
            toast("Couldn't save: " + e.getMessage());
        }
    }

    private void toast(final String text) {
        runOnUiThread(() -> Toast.makeText(MainActivity.this, text, Toast.LENGTH_LONG).show());
    }
}
