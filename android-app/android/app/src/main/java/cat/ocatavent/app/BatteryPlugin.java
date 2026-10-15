package cat.ocatavent.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/* Ocata Vent: comprova si l'app està exclosa de l'optimització de bateria (perquè Android no aturi la gravació)
   i obre els ajustos de l'app perquè el soci triï Bateria ▸ Sense restriccions.
   No fa servir REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (permís restringit al Google Play): ni check() ni open() el necessiten.
   Web: window.Capacitor.Plugins.OvBattery.check() / open(). */
@CapacitorPlugin(name = "OvBattery")
public class BatteryPlugin extends Plugin {
    @PluginMethod
    public void check(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        JSObject r = new JSObject();
        r.put("ignoring", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(r);
    }

    // Fitxa de l'app (Informació de l'app ▸ Bateria). Si el fabricant no la deixa obrir, la llista d'optimització de bateria.
    @PluginMethod
    public void open(PluginCall call) {
        Context c = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + c.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        } catch (Exception e) {
            Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            c.startActivity(i);
        }
        call.resolve();
    }
}
