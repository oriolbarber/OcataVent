package cat.ocatavent.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

/* Ocata Vent: widget compacte (4 × 1). Avui i els 7 dies següents en una fila: nota del millor moment que queda,
   matí/migdia/tarda i vent. Fa servir les mateixes dades que VentWidget (SharedPreferences ov_widget) i la mateixa cel·la. */
public class WeekWidget extends AppWidgetProvider {
    static final int DAYS = 8;   // avui + 7

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, WeekWidget.class));
        if (ids == null) return;
        for (int id : ids) m.updateAppWidget(id, build(c));
    }

    static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_week);
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.wRoot, PendingIntent.getActivity(c, 1, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        String s = c.getSharedPreferences(VentWidget.PREFS, Context.MODE_PRIVATE).getString(VentWidget.KEY, null);
        int n = 0;
        try { if (s != null) n = VentWidget.fillWeek(c, v, new JSONObject(s), true, DAYS); } catch (Exception ex) { n = 0; }
        v.setViewVisibility(R.id.wMsg, n > 0 ? View.GONE : View.VISIBLE);
        return v;
    }
}
