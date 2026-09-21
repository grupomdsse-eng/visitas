package com.grupomds.visitas;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Insets;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/** Offline WebView shell. Only packaged content is allowed inside the trusted WebView. */
public final class MainActivity extends Activity {
    private static final int OPEN_FILE = 4001, SAVE_FILE = 4002;
    private WebView web;
    private FrameLayout root;
    private NativeStore store;
    private volatile boolean trustedPage = false;
    private ValueCallback<Uri[]> fileCallback;
    private final AtomicBoolean exporting = new AtomicBoolean(false);
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private volatile String exportId = "";
    private File pendingExport;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        store = new NativeStore(getFilesDir());
        pendingExport = new File(getFilesDir(), "mds-pending-export.tmp");
        if (savedInstanceState != null && savedInstanceState.getBoolean("exporting") && pendingExport.exists()) {
            exporting.set(true);
            exportId = savedInstanceState.getString("exportId", "");
        } else if (pendingExport.exists()) { pendingExport.delete(); }
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.WHITE);
        setContentView(root);
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                Insets ime = insets.getInsets(WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return Build.VERSION.SDK_INT >= 30 ? WindowInsets.CONSUMED : insets.consumeSystemWindowInsets();
        });
        // CONSUMED was added in API 30; for Android 8-10 use the legacy listener instead.
        if (Build.VERSION.SDK_INT < 30) root.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        root.requestApplyInsets();
        createWebView();
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    private void createWebView() {
        try { web = new WebView(this); }
        catch (Exception e) {
            showError("Android System WebView no está disponible. Actualízalo desde Google Play y vuelve a abrir la aplicación.");
            return;
        }
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true); // Scoped URI granted by the document picker only.
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setGeolocationEnabled(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSafeBrowsingEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " MDSVisitasAndroid/" + BuildConfig.VERSION_NAME);
        web.setBackgroundColor(Color.WHITE);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new NativeBridge(), "MDSNative");
        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (SecurityPolicy.isLocal(url)) {
                    WebResourceResponse response = assets.shouldInterceptRequest(request.getUrl());
                    return response == null ? denied() : response;
                }
                if (!request.isForMainFrame() && SecurityPolicy.isApi(url)) return null;
                return denied();
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (request.isForMainFrame() && SecurityPolicy.isHome(url)) return false;
                if (request.isForMainFrame()) openExternal(url);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                trustedPage = SecurityPolicy.isHome(url);
                if (!trustedPage) view.stopLoading();
            }
            @Override public void onPageFinished(WebView view, String url) { trustedPage = SecurityPolicy.isHome(url); }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showError("No se pudo abrir la aplicación. Tus datos no se han borrado.");
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                trustedPage = false;
                root.removeView(view);
                view.destroy(); web = null;
                showError("Android ha cerrado la vista. Pulsa Reabrir para recuperar los datos guardados.");
                return true;
            }
            // SSL errors keep Android's default fail-closed handling. Never call handler.proceed().
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onJsAlert(WebView view, String url, String message, JsResult result) {
                if (!SecurityPolicy.isHome(url)) { result.cancel(); return true; }
                new AlertDialog.Builder(MainActivity.this).setTitle("MDS Visitas").setMessage(message)
                    .setPositiveButton("Aceptar", (d, w) -> result.confirm())
                    .setOnCancelListener(d -> result.cancel()).show();
                return true;
            }
            @Override public boolean onJsConfirm(WebView view, String url, String message, JsResult result) {
                if (!SecurityPolicy.isHome(url)) { result.cancel(); return true; }
                new AlertDialog.Builder(MainActivity.this).setTitle("MDS Visitas").setMessage(message)
                    .setPositiveButton("Continuar", (d, w) -> result.confirm())
                    .setNegativeButton("Cancelar", (d, w) -> result.cancel())
                    .setOnCancelListener(d -> result.cancel()).show();
                return true;
            }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (!trustedPage) { callback.onReceiveValue(null); return true; }
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { startActivityForResult(intent, OPEN_FILE); }
                catch (ActivityNotFoundException e) {
                    fileCallback.onReceiveValue(null); fileCallback = null;
                    toast("No se encuentra un selector de archivos en este móvil.");
                }
                return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, false, false);
            }
            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean userGesture, Message resultMsg) {
                if (!userGesture) return false;
                WebView popup = new WebView(MainActivity.this);
                popup.getSettings().setJavaScriptEnabled(false);
                popup.setWebViewClient(new WebViewClient() {
                    @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                        openExternal(req.getUrl().toString()); v.destroy(); return true;
                    }
                    @Override public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest req) { return denied(); }
                });
                ((WebView.WebViewTransport) resultMsg.obj).setWebView(popup);
                resultMsg.sendToTarget(); return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> {
            if (SecurityPolicy.isExternal(url)) openExternal(url);
            else toast("Usa Copia de seguridad para guardar los datos.");
        });
        trustedPage = true;
        web.loadUrl(SecurityPolicy.HOME);
    }

    private static WebResourceResponse denied() {
        return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden",
            Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }

    private void openExternal(String value) {
        if (!SecurityPolicy.isExternal(value)) { toast("Enlace no permitido."); return; }
        runOnUiThread(() -> {
            try {
                Uri uri = Uri.parse(value);
                String scheme = uri.getScheme();
                Intent intent = new Intent("tel".equalsIgnoreCase(scheme) ? Intent.ACTION_DIAL :
                    "mailto".equalsIgnoreCase(scheme) ? Intent.ACTION_SENDTO : Intent.ACTION_VIEW, uri);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            } catch (ActivityNotFoundException e) { toast("No hay una aplicación instalada para abrir este enlace."); }
              catch (Exception e) { toast("No se pudo abrir el enlace."); }
        });
    }

    private void toast(String text) { runOnUiThread(() -> Toast.makeText(this, text, Toast.LENGTH_LONG).show()); }

    public final class NativeBridge {
        @JavascriptInterface public String readBundle() {
            if (!trustedPage) return "";
            try { return store.read(); } catch (Exception e) { return ""; }
        }
        @JavascriptInterface public boolean saveBundle(String json) { return trustedPage && store.write(json); }
        @JavascriptInterface public void openExternal(String url) { if (trustedPage) MainActivity.this.openExternal(url); }
        @JavascriptInterface public void exportText(String name, String text, String mime, String callbackId) {
            if (!trustedPage || callbackId == null || !callbackId.matches("[A-Za-z0-9-]{1,100}")) return;
            if (!exporting.compareAndSet(false, true)) { finishExportCallback(callbackId, false, "Hay otra copia abierta."); return; }
            exportId = callbackId;
            try {
                if (text == null || text.length() > NativeStore.MAX_BYTES) throw new IllegalArgumentException();
                byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
                if (bytes.length > NativeStore.MAX_BYTES) throw new IllegalArgumentException();
                try (FileOutputStream out = new FileOutputStream(pendingExport)) { out.write(bytes); out.getFD().sync(); }
                String safeName = SecurityPolicy.exportName(name);
                String type = safeName.endsWith(".csv") ? "text/csv" : safeName.endsWith(".html") ? "text/html" : "application/json";
                runOnUiThread(() -> {
                    try {
                        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                        intent.addCategory(Intent.CATEGORY_OPENABLE);
                        intent.setType(type);
                        intent.putExtra(Intent.EXTRA_TITLE, safeName);
                        startActivityForResult(intent, SAVE_FILE);
                    } catch (Exception e) { finishExport(false, "No se pudo abrir el selector de guardado."); }
                });
            } catch (Exception e) { finishExport(false, "La copia es demasiado grande o no hay espacio disponible."); }
        }
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == OPEN_FILE) {
            if (fileCallback != null) {
                Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
                fileCallback.onReceiveValue(uri != null && "content".equals(uri.getScheme()) ? new Uri[]{uri} : null);
                fileCallback = null;
            }
        } else if (requestCode == SAVE_FILE) {
            Uri uri = resultCode == RESULT_OK && data != null ? data.getData() : null;
            if (uri == null || !"content".equals(uri.getScheme())) { finishExport(false, "Guardado cancelado."); return; }
            io.execute(() -> {
                try (InputStream in = new FileInputStream(pendingExport);
                     OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                    if (out == null) throw new IllegalStateException();
                    byte[] buffer = new byte[16384];
                    int n; while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                    out.flush();
                } catch (Exception e) { finishExport(false, "No se pudo escribir la copia. Selecciona otra carpeta y reintenta."); return; }
                finishExport(true, "");
            });
        }
    }

    private void finishExport(boolean success, String message) {
        String id = exportId;
        if (pendingExport != null) pendingExport.delete();
        exporting.set(false); exportId = "";
        finishExportCallback(id, success, message);
    }

    private void finishExportCallback(String id, boolean success, String message) {
        runOnUiThread(() -> {
            if (web != null && trustedPage && !isFinishing() && !isDestroyed()) {
                web.evaluateJavascript("window.MDSAndroid&&window.MDSAndroid.exportResult("
                    + JSONObject.quote(id) + "," + success + "," + JSONObject.quote(message) + ");", null);
            }
            // Also informs the user if Android recreated the page during the file picker.
            if (success) toast("Copia guardada en la ubicación seleccionada.");
        });
    }

    @Override protected void onSaveInstanceState(Bundle out) {
        out.putBoolean("exporting", exporting.get()); out.putString("exportId", exportId);
        super.onSaveInstanceState(out);
    }

    @Override public void onBackPressed() {
        if (web == null || !trustedPage) { moveTaskToBack(true); return; }
        web.evaluateJavascript("(function(){return window.MDSAndroid ? window.MDSAndroid.back() : false;})()", result -> {
            if (!"true".equals(result)) moveTaskToBack(true);
        });
    }

    @Override protected void onPause() {
        if (web != null && trustedPage) web.evaluateJavascript("window.MDSAndroid&&window.MDSAndroid.flushDrafts();", null);
        super.onPause();
    }

    @Override protected void onDestroy() {
        trustedPage = false;
        if (fileCallback != null) { fileCallback.onReceiveValue(null); fileCallback = null; }
        if (web != null) { root.removeView(web); web.removeJavascriptInterface("MDSNative"); web.destroy(); web = null; }
        io.shutdown();
        super.onDestroy();
    }

    private void showError(String message) {
        trustedPage = false;
        runOnUiThread(() -> {
            root.removeAllViews();
            LinearLayout box = new LinearLayout(this); box.setOrientation(LinearLayout.VERTICAL); box.setPadding(40, 70, 40, 40);
            TextView text = new TextView(this); text.setText(message); text.setTextSize(18); box.addView(text);
            Button retry = new Button(this); retry.setText("Reabrir MDS Visitas"); retry.setOnClickListener(v -> recreate()); box.addView(retry);
            root.addView(box);
        });
    }
}
