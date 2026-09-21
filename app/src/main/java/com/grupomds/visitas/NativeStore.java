package com.grupomds.visitas;

import android.util.AtomicFile;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/** Atomic backup in the app's files directory, NOT the temporary cache. */
final class NativeStore {
    static final int MAX_BYTES = 32 * 1024 * 1024;
    private final AtomicFile file;
    NativeStore(File directory) { file = new AtomicFile(new File(directory, "mds-visitas-data.json")); }

    synchronized String read() throws Exception {
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile() + ".bak").exists()) return "";
        if (file.getBaseFile().length() > MAX_BYTES) throw new IllegalStateException("Respaldo demasiado grande");
        return new String(file.readFully(), StandardCharsets.UTF_8);
    }

    synchronized boolean write(String value) {
        if (value == null || value.length() > MAX_BYTES) return false;
        FileOutputStream stream = null;
        try {
            byte[] data = value.getBytes(StandardCharsets.UTF_8);
            if (data.length > MAX_BYTES) return false;
            JSONObject json = new JSONObject(value);
            if (!"mds-visitas-mobile".equals(json.optString("format"))
                || json.optJSONObject("seed") == null || json.optJSONObject("state") == null) return false;
            stream = file.startWrite();
            stream.write(data);
            file.finishWrite(stream);
            return true;
        } catch (Exception e) {
            if (stream != null) file.failWrite(stream);
            return false;
        }
    }
}
