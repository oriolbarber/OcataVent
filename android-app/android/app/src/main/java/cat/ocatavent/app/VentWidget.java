package cat.ocatavent.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.graphics.Color;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.RelativeSizeSpan;
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/* Ocata Vent: widget de la pantalla d'inici amb la idoneïtat per navegar.
   L'app hi desa (WidgetPlugin) el veredicte d'ara i la previsió de les 48 hores següents.
   Android el refresca cada 30 min sense obrir l'app: si les dades d'ara tenen menys de 45 min, les mostra
   (amb el vent de l'estació); si no, mostra la previsió de l'hora en curs. Tocar-lo obre l'app.
   A sota, resum de 7 dies (si el widget fa ≥ WEEK_MIN dp d'alt): per a cada dia, la nota del millor moment que queda
   (rajola de color), matí/migdia/tarda en tres segments (gris si ja ha passat) i el vent d'aquell moment. */
public class VentWidget extends AppWidgetProvider {
    static final String PREFS = "ov_widget", KEY = "snap";
    static final long NOW_MAX = 45 * 60 * 1000L, HOUR = 3600 * 1000L;
    static final Locale CA = new Locale("ca", "ES");
    static final int WEEK_MIN = 140;   // dp: per sota, només el veredicte d'ara
    static final String[] DOW = {"Dg", "Dl", "Dt", "Dc", "Dj", "Dv", "Ds"};
    static final int[] SEG = {R.id.dS0, R.id.dS1, R.id.dS2};

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, build(c, week(m, id)));
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle opts) {
        m.updateAppWidget(id, build(c, week(m, id)));   // en canviar la mida: mostra o amaga els 7 dies
    }

    // Alçada real en vertical = MAX_HEIGHT; si el launcher no la diu, es mostren els 7 dies
    static boolean week(AppWidgetManager m, int id) {
        int h = m.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        return h == 0 || h >= WEEK_MIN;
    }

    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        int[] ids = m.getAppWidgetIds(new ComponentName(c, VentWidget.class));
        if (ids == null) return;
        for (int id : ids) m.updateAppWidget(id, build(c, week(m, id)));
    }

    static RemoteViews build(Context c, boolean showWeek) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_vent);
        Intent i = new Intent(c, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.wRoot, PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        String s = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
        if (s == null) { empty(v, "Ocata Vent", "Obre l'app per veure les condicions"); return v; }
        try {
            JSONObject o = new JSONObject(s);
            long now = System.currentTimeMillis(), at = o.optLong("at", 0);
            SimpleDateFormat hm = new SimpleDateFormat("HH:mm", CA), hh = new SimpleDateFormat("HH", CA);
            JSONObject e = null; String src = null;
            if (now - at < NOW_MAX && o.has("now")) {
                e = o.getJSONObject("now");
                String st = o.optString("st", "");
                src = (st.isEmpty() ? "Previsió" : "Estació " + st) + " · " + hm.format(new Date(at));
            } else {
                JSONArray h = o.optJSONArray("hrs");
                if (h != null) for (int k = 0; k < h.length(); k++) {
                    JSONObject x = h.getJSONObject(k); long t = x.optLong("t", 0);
                    if (now >= t && now < t + HOUR) { e = x; src = "Previsió de les " + hh.format(new Date(t)) + " h"; break; }
                }
            }
            if (e == null) { empty(v, title(o), "Previsió caducada: obre l'app"); return v; }
            String k = e.optString("k", "no");
            int col = "ideal".equals(k) ? 0xFF34E39A : "marg".equals(k) ? 0xFFFF9A3C : 0xFFFF6476;
            v.setInt(R.id.wRoot, "setBackgroundResource", "ideal".equals(k) ? R.drawable.widget_bg_ideal : "marg".equals(k) ? R.drawable.widget_bg_marg : R.drawable.widget_bg_no);
            String sc = e.isNull("s") ? "–" : String.valueOf(Math.round(e.getDouble("s") / 10.0));
            SpannableString sp = new SpannableString(sc + "/10");
            sp.setSpan(new RelativeSizeSpan(0.45f), sc.length(), sp.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            v.setTextViewText(R.id.wScore, sp);
            v.setTextColor(R.id.wScore, col);
            v.setTextViewText(R.id.wVerd, e.optString("v", "").toUpperCase(CA));
            v.setTextColor(R.id.wVerd, col);
            v.setTextViewText(R.id.wTitle, title(o));
            String wind = e.isNull("w") ? "Sense dades de vent" : Math.round(e.getDouble("w")) + " kn " + e.optString("dn", "")
                + (e.isNull("g") ? "" : " · ratxa " + Math.round(e.getDouble("g")));
            v.setTextViewText(R.id.wWind, wind.trim());
            String wave = e.isNull("h") ? "" : "Onada " + String.format(CA, "%.1f", e.getDouble("h")) + " m";
            String why = e.optString("why", "");
            v.setTextViewText(R.id.wWave, wave + (!wave.isEmpty() && !why.isEmpty() ? " · " : "") + why);
            v.setTextViewText(R.id.wSrc, src);
            fillWeek(c, v, o, showWeek);
        } catch (Exception ex) {
            empty(v, "Ocata Vent", "Obre l'app per veure les condicions");
        }
        return v;
    }

    static int bgDay(String k) { return "ideal".equals(k) ? R.drawable.day_ideal : "marg".equals(k) ? R.drawable.day_marg : "no".equals(k) ? R.drawable.day_no : R.drawable.day_none; }
    static int bgSeg(String k) { return "ideal".equals(k) ? R.drawable.seg_ideal : "marg".equals(k) ? R.drawable.seg_marg : "no".equals(k) ? R.drawable.seg_no : R.drawable.seg_none; }

    // Resum de 7 dies a partir d'avui (la llista en porta 8: si el paquet és d'ahir, en continuen quedant 7)
    static void fillWeek(Context c, RemoteViews v, JSONObject o, boolean show) throws Exception {
        v.removeAllViews(R.id.wWeek);
        JSONArray days = o.optJSONArray("days");
        if (!show || days == null || days.length() == 0) { v.setViewVisibility(R.id.wWeek, android.view.View.GONE); return; }
        long now = System.currentTimeMillis();
        Calendar cal = Calendar.getInstance(); cal.set(Calendar.HOUR_OF_DAY, 0); cal.set(Calendar.MINUTE, 0); cal.set(Calendar.SECOND, 0); cal.set(Calendar.MILLISECOND, 0);
        long today = cal.getTimeInMillis();
        int n = 0;
        for (int i = 0; i < days.length() && n < 7; i++) {
            JSONObject d = days.getJSONObject(i); long t = d.optLong("t", 0);
            if (t < today) continue;
            Calendar dc = Calendar.getInstance(); dc.setTimeInMillis(t);
            long dd = Math.round((t - 12 * HOUR - today) / (24.0 * HOUR));   // 0 = avui, 1 = demà (arrodonit pels canvis d'hora)
            RemoteViews cell = new RemoteViews(c.getPackageName(), R.layout.widget_day);
            cell.setTextViewText(R.id.dLbl, dd == 0 ? "Avui" : dd == 1 ? "Demà" : DOW[dc.get(Calendar.DAY_OF_WEEK) - 1]);
            cell.setTextColor(R.id.dLbl, dd == 0 ? Color.WHITE : 0xFF9FB0C8);
            JSONArray sl = d.optJSONArray("sl"); JSONObject best = null;
            for (int j = 0; j < 3; j++) {
                JSONObject x = sl == null || j >= sl.length() || sl.isNull(j) ? null : sl.getJSONObject(j);
                boolean past = x != null && now >= x.optLong("e", 0);
                cell.setInt(SEG[j], "setBackgroundResource", x == null || past ? R.drawable.seg_none : bgSeg(x.optString("k", "")));
                if (x != null && !past && !x.isNull("s") && (best == null || x.getDouble("s") > best.getDouble("s"))) best = x;
            }
            if (best != null) {
                cell.setInt(R.id.dTile, "setBackgroundResource", bgDay(best.optString("k", "")));
                cell.setTextViewText(R.id.dTile, String.valueOf(Math.round(best.getDouble("s") / 10.0)));
                cell.setTextColor(R.id.dTile, 0xFF0F1724);
                cell.setTextViewText(R.id.dWind, best.isNull("w") ? "" : Math.round(best.getDouble("w")) + " " + best.optString("dn", ""));
            } else {   // avui, ja passades totes les franges
                cell.setInt(R.id.dTile, "setBackgroundResource", R.drawable.day_none);
                cell.setTextViewText(R.id.dTile, "–");
                cell.setTextColor(R.id.dTile, 0xFF9FB0C8);
                cell.setTextViewText(R.id.dWind, "");
            }
            v.addView(R.id.wWeek, cell); n++;
        }
        v.setViewVisibility(R.id.wWeek, n > 0 ? android.view.View.VISIBLE : android.view.View.GONE);
    }

    static String title(JSONObject o) {
        String a = o.optString("act", ""), l = o.optString("loc", "");
        return a.isEmpty() ? (l.isEmpty() ? "Ocata Vent" : l) : a + (l.isEmpty() ? "" : " · " + l);
    }

    static void empty(RemoteViews v, String title, String msg) {
        v.setInt(R.id.wRoot, "setBackgroundResource", R.drawable.widget_bg_none);
        v.setTextViewText(R.id.wScore, "–");
        v.setTextColor(R.id.wScore, Color.WHITE);
        v.setTextViewText(R.id.wVerd, "");
        v.setTextViewText(R.id.wTitle, title);
        v.setTextViewText(R.id.wWind, msg);
        v.setTextViewText(R.id.wWave, "");
        v.setTextViewText(R.id.wSrc, "");
        v.removeAllViews(R.id.wWeek);
        v.setViewVisibility(R.id.wWeek, android.view.View.GONE);
    }
}
