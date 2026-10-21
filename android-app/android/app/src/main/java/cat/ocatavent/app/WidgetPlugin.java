package cat.ocatavent.app;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/* Ocata Vent: la web hi passa el veredicte d'ara i la previsió per hores (JSON) i el widget de la pantalla d'inici el mostra.
   Web: window.Capacitor.Plugins.OvWidget.save({data: "…"}) (app.js, widgetPush). */
@CapacitorPlugin(name = "OvWidget")
public class WidgetPlugin extends Plugin {
    @PluginMethod
    public void save(PluginCall call) {
        String d = call.getString("data");
        if (d == null) { call.reject("Sense dades"); return; }
        Context c = getContext();
        c.getSharedPreferences(VentWidget.PREFS, Context.MODE_PRIVATE).edit().putString(VentWidget.KEY, d).apply();
        VentWidget.updateAll(c);
        WeekWidget.updateAll(c);
        call.resolve();
    }
}
