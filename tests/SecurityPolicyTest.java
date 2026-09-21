import com.grupomds.visitas.SecurityPolicy;

public class SecurityPolicyTest {
    private static int assertions = 0;
    private static void check(boolean value) {
        assertions++;
        if (!value) throw new AssertionError("Policy test " + assertions + " failed");
    }
    public static void main(String[] args) {
        check(SecurityPolicy.isHome(SecurityPolicy.HOME));
        check(SecurityPolicy.isHome(SecurityPolicy.HOME + "#clientes"));
        check(SecurityPolicy.isLocal("https://appassets.androidplatform.net/assets/site/app.js"));
        check(!SecurityPolicy.isLocal("https://appassets.androidplatform.net.evil.example/assets/site/index.html"));
        check(!SecurityPolicy.isLocal("http://appassets.androidplatform.net/assets/site/index.html"));
        check(!SecurityPolicy.isLocal("https://user@appassets.androidplatform.net/assets/site/index.html"));
        check(!SecurityPolicy.isLocal("https://appassets.androidplatform.net:9999/assets/site/index.html"));
        check(!SecurityPolicy.isLocal("https://appassets.androidplatform.net/assets/site/../../private"));
        check(!SecurityPolicy.isLocal("https://appassets.androidplatform.net/assets/site/%2e%2e/private"));
        check(!SecurityPolicy.isHome("https://appassets.androidplatform.net/assets/site/app.js"));
        check(SecurityPolicy.isApi("https://www.cartociudad.es/geocoder/api/geocoder/candidates?q=sevilla"));
        check(SecurityPolicy.isApi("https://router.project-osrm.org/table/v1/driving/1,2;3,4"));
        check(!SecurityPolicy.isApi("https://router.project-osrm.org.evil.example/table"));
        check(!SecurityPolicy.isApi("http://www.cartociudad.es/geocoder"));
        check(SecurityPolicy.isExternal("https://www.google.com/maps/dir/?api=1&destination=Sevilla"));
        check(SecurityPolicy.isExternal("https://www.google.com/maps/dir/?destination=Calle+Arag%C3%B3n"));
        check(SecurityPolicy.isExternal("tel:+34955000000"));
        check(SecurityPolicy.isExternal("mailto:ejemplo@example.com"));
        check(SecurityPolicy.isExternal("geo:37.1,-5.9"));
        check(!SecurityPolicy.isExternal("javascript:alert(1)"));
        check(!SecurityPolicy.isExternal("intent://evil#Intent;scheme=file;end"));
        check(!SecurityPolicy.isExternal("file:///sdcard/private.json"));
        check(!SecurityPolicy.isExternal("content://com.android.documents/file/1"));
        check(!SecurityPolicy.isExternal("data:text/html,hello"));
        check(!SecurityPolicy.isExternal("https://user:pass@example.com/"));
        check(!SecurityPolicy.isExternal(SecurityPolicy.HOME));
        check(SecurityPolicy.exportName("../../evil.json").indexOf('/') == -1);
        check(SecurityPolicy.exportName("evil.apk").equals("MDS_Visitas_copia.json"));
        check(SecurityPolicy.exportName("MDS_Visitas_copia_2026-09-21.json").endsWith(".json"));
        System.out.println("OK: " + assertions + " URL and export policy checks.");
    }
}
