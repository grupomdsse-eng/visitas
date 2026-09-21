package com.grupomds.visitas;

import java.net.URI;
import java.util.Locale;

/** URL checks shared by the Activity and JVM tests. No private client data here. */
public final class SecurityPolicy {
    public static final String HOST = "appassets.androidplatform.net";
    public static final String HOME = "https://" + HOST + "/assets/site/index.html";
    private SecurityPolicy() { }

    public static boolean isLocal(String value) {
        try {
            URI u = new URI(value);
            return "https".equalsIgnoreCase(u.getScheme())
                && HOST.equalsIgnoreCase(u.getHost())
                && (u.getPort() == -1 || u.getPort() == 443)
                && u.getRawUserInfo() == null && u.getPath() != null
                && u.getPath().startsWith("/assets/site/")
                && !u.getPath().contains("..") && !u.getPath().contains("\\");
        } catch (Exception e) { return false; }
    }

    public static boolean isHome(String value) {
        try { return isLocal(value) && "/assets/site/index.html".equals(new URI(value).getPath()); }
        catch (Exception e) { return false; }
    }

    public static boolean isApi(String value) {
        try {
            URI u = new URI(value);
            if (!"https".equalsIgnoreCase(u.getScheme()) || u.getRawUserInfo() != null
                || (u.getPort() != -1 && u.getPort() != 443)) return false;
            return "www.cartociudad.es".equalsIgnoreCase(u.getHost())
                || "router.project-osrm.org".equalsIgnoreCase(u.getHost());
        } catch (Exception e) { return false; }
    }

    public static boolean isExternal(String value) {
        if (value == null || value.length() > 16384) return false;
        try {
            URI u = new URI(value);
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase(Locale.ROOT);
            if (scheme.equals("https") || scheme.equals("http")) {
                return u.getHost() != null && u.getRawUserInfo() == null
                    && !HOST.equalsIgnoreCase(u.getHost());
            }
            return scheme.equals("tel") || scheme.equals("mailto") || scheme.equals("geo");
        } catch (Exception e) { return false; }
    }

    public static String exportName(String value) {
        String name = (value == null ? "MDS_Visitas_copia.json" : value)
            .replaceAll("[^A-Za-z0-9._-]", "_");
        if (name.length() > 120) name = name.substring(name.length() - 120);
        if (!name.toLowerCase(Locale.ROOT).matches(".+\\.(json|csv|html)$"))
            name = "MDS_Visitas_copia.json";
        return name;
    }
}
